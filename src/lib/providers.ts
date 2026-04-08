/**
 * AI Engine Provider Registry
 * 
 * Centralized provider configuration for CLI-based AI engines.
 * To add a new provider:
 *   1. Create a ProviderConfig object
 *   2. Register it in PROVIDER_REGISTRY
 *   3. That's it — runAITask, sendMessage, and TaskCreatorChat will auto-adapt.
 */

export interface ProviderConfig {
  /** Unique alias matching engine.alias from settings */
  alias: string;

  /**
   * Build CLI args for this provider.
   * @returns { args, prompt } where args is the CLI arguments array,
   *   and prompt is what to write to stdin (empty string = don't write to stdin)
   */
  buildArgs: (params: {
    engineArgs: string;
    prompt: string;
    cwd: string;
    mode?: 'minimal' | 'standard' | 'full';  // Context mode for token optimization (optional)
  }) => { args: string[]; stdinPrompt: string };

  /**
   * Parse a single line of CLI output into a display-friendly format.
   * Return null to skip the line (e.g., heartbeat events).
   */
  parseOutputLine: (line: string) => ParsedOutput | null;
}

export interface ParsedOutput {
  /** What to display in the chat message area */
  displayText: string;
  /** Structured step info for the progress panel (optional) */
  step?: {
    type: 'step_start' | 'tool_use' | 'text' | 'error' | 'complete';
    content: string;
  };
}

// ─── Provider Implementations ───────────────────────────────────────────

const opencodeProvider: ProviderConfig = {
  alias: 'opencode',

  buildArgs({ prompt, cwd }) {
    const workingDir = cwd || '.';
    // Note: Opencode doesn't support --no-context or --no-files flags
    // Token optimization is done by sending shorter prompts instead

    return {
      args: [
        'run',
        '--format', 'json',
        '--dir', workingDir,
        prompt,
      ],
      stdinPrompt: '', // opencode takes prompt as argument, not stdin
    };
  },

  parseOutputLine(line: string): ParsedOutput | null {
    try {
      const json = JSON.parse(line);

      if (json.type === 'text' && json.part?.text) {
        return {
          displayText: json.part.text,
          step: { type: 'text', content: json.part.text.substring(0, 100) },
        };
      }

      if (json.type === 'step_start') {
        const label = json.part?.type || 'thinking';
        return {
          displayText: `[${label}] Thinking...`,
          step: { type: 'step_start', content: label },
        };
      }

      if (json.type === 'tool_use') {
        const toolState = json.part?.state;
        const toolName = json.part?.tool || 'unknown';
        let detail = '';
        if (toolState?.input?.filePath) detail = toolState.input.filePath;
        else if (toolState?.input?.pattern) detail = toolState.input.pattern;
        else if (toolState?.input?.command) detail = toolState.input.command;
        else if (toolState?.input?.file_path) detail = toolState.input.file_path;

        let toolInfo = `[Tool: ${toolName}]`;
        if (detail) toolInfo += ` ${detail}`;
        if (toolState?.output) {
          const output = typeof toolState.output === 'string'
            ? toolState.output.substring(0, 200)
            : JSON.stringify(toolState.output).substring(0, 200);
          toolInfo += `\n  → ${output}`;
        }

        return {
          displayText: toolInfo,
          step: { type: 'tool_use', content: `${toolName}${detail ? `: ${detail}` : ''}` },
        };
      }

      if (json.type === 'step_finish') {
        const tokens = json.tokens?.total || 0;
        const cost = json.cost ? ` ($${json.cost.toFixed(6)})` : '';
        return {
          displayText: `\n--- Step completed: ${tokens} tokens${cost} ---`,
          step: { type: 'complete', content: `${tokens} tokens${cost}` },
        };
      }

      if (json.type === 'error') {
        const msg = json.message || 'Unknown error';
        return {
          displayText: `❌ Error: ${msg}`,
          step: { type: 'error', content: msg },
        };
      }

      // heartbeat, session_start, etc. — skip
      return null;
    } catch {
      // Not valid JSON — treat as raw text
      return line.trim() ? {
        displayText: line,
        step: { type: 'text', content: line.substring(0, 100) },
      } : null;
    }
  },
};

const claudeProvider: ProviderConfig = {
  alias: 'claude',

  buildArgs({ engineArgs, prompt }) {
    // Keep any user-defined args (e.g., --dangerously-skip-permissions / --permission-mode bypassPermissions)
    // then add -p (print/non-interactive) + stream-json output for proper streaming
    const userArgs = engineArgs.split(' ').filter(Boolean);

    // Remove any existing output-format / print flags to avoid duplicates
    const baseArgs = userArgs.filter(
      a => !['--output-format', '-p', '--print', '--verbose', '--include-partial-messages'].includes(a)
        && !a.startsWith('--output-format=')
    );

    // Note: --no-context flag is not supported by Claude CLI
    // Token optimization is done by sending shorter prompts instead
    // --verbose is REQUIRED when using --output-format=stream-json

    return {
      args: [
        ...baseArgs,
        '-p',                                // non-interactive print mode
        '--output-format', 'stream-json',    // real-time JSON streaming
        '--include-partial-messages',        // stream text as it arrives
        '--verbose',                         // REQUIRED by stream-json
      ],
      stdinPrompt: prompt,
    };
  },

  parseOutputLine(line: string): ParsedOutput | null {
    if (!line.trim()) return null;

    // Claude stream-json format outputs newline-delimited JSON events
    try {
      const json = JSON.parse(line);
      const type = json.type as string;

      // ── System init — skip silently ──────────────────────────────
      if (type === 'system') return null;

      // ── User echo — skip ─────────────────────────────────────────
      if (type === 'user') return null;

      // ── Assistant text (main content) ────────────────────────────
      if (type === 'assistant') {
        const content = json.message?.content ?? [];
        const texts: string[] = [];

        for (const block of content) {
          if (block.type === 'text' && block.text) {
            texts.push(block.text);
          }
          if (block.type === 'tool_use') {
            const input = block.input ?? {};
            const detail = input.file_path || input.path || input.command || input.pattern || '';
            texts.push(`[Tool: ${block.name}]${detail ? ` ${detail}` : ''}`);
          }
        }

        const text = texts.join('\n');
        if (!text) return null;
        return {
          displayText: text,
          step: { type: 'text', content: text.substring(0, 100) },
        };
      }

      // ── Tool result ──────────────────────────────────────────────
      if (type === 'tool_result') {
        const content = Array.isArray(json.content) ? json.content : [];
        const text = content.map((c: { text?: string }) => c.text || '').filter(Boolean).join('\n');
        if (!text) return null;
        return {
          displayText: `  → ${text.substring(0, 200)}`,
          step: { type: 'tool_use', content: text.substring(0, 100) },
        };
      }

      // ── Final result ─────────────────────────────────────────────
      if (type === 'result') {
        const subtype = json.subtype as string;
        const cost = json.total_cost_usd ? ` ($${Number(json.total_cost_usd).toFixed(4)})` : '';
        const duration = json.duration_ms ? ` in ${Math.round(json.duration_ms / 1000)}s` : '';
        if (subtype === 'success') {
          return {
            displayText: `\n✅ Completed${duration}${cost}`,
            step: { type: 'complete', content: `Done${duration}${cost}` },
          };
        }
        if (subtype === 'error_max_turns' || subtype === 'error') {
          const msg = json.result || 'Unknown error';
          return {
            displayText: `❌ ${msg}`,
            step: { type: 'error', content: msg.substring(0, 100) },
          };
        }
        return null;
      }

      // ── Unknown JSON — skip ──────────────────────────────────────
      return null;

    } catch {
      // Not JSON — Claude might emit plain text in some edge cases
      // Strip ANSI escape sequences before displaying
      const clean = line
        .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
        .trim();
      if (!clean) return null;
      return {
        displayText: clean,
        step: { type: 'text', content: clean.substring(0, 100) },
      };
    }
  },
};

/**
 * Default/fallback provider for any engine not in the registry.
 * Sends prompt via stdin and displays raw output.
 */
const defaultProvider: ProviderConfig = {
  alias: '__default__',

  buildArgs({ engineArgs, prompt }) {
    const baseArgs = engineArgs.split(' ').filter(Boolean);
    // Note: Most CLI tools don't support --no-context flag
    // Token optimization is done by sending shorter prompts instead

    return {
      args: baseArgs,
      stdinPrompt: prompt,
    };
  },

  parseOutputLine(line: string): ParsedOutput | null {
    if (!line.trim()) return null;
    return {
      displayText: line,
      step: { type: 'text', content: line.substring(0, 100) },
    };
  },
};

const geminiProvider: ProviderConfig = {
  alias: 'gemini',

  buildArgs({ engineArgs, prompt }) {
    const userArgs = engineArgs.split(' ').filter(Boolean);

    // Remove conflicting flags
    const baseArgs = userArgs.filter(
      a => !['--prompt', '-p', '--output-format', '-o'].includes(a)
        && !a.startsWith('--prompt=')
        && !a.startsWith('--output-format=')
        && !a.startsWith('-o=')
    );

    // Note: Gemini CLI doesn't support --no-context flag
    // Token optimization is done by sending shorter prompts instead

    return {
      args: [
        ...baseArgs,
        '--prompt', prompt,           // non-interactive mode with prompt
        '--output-format', 'stream-json',  // JSON streaming output
      ],
      stdinPrompt: '', // Gemini takes prompt via argument
    };
  },

  parseOutputLine(line: string): ParsedOutput | null {
    if (!line.trim()) return null;

    // Filter out Gemini CLI status/system messages that shouldn't be shown
    const systemKeywords = [
      'YOLO mode',
      'Loaded cached credentials',
      'All tool calls',
      'Approval mode:',
      'Sandbox mode:',
      'Using model:',
      'Session:',
      'Extension',
    ];
    
    // Check if line is a system message (plain text)
    for (const keyword of systemKeywords) {
      if (line.includes(keyword)) {
        return null;
      }
    }

    try {
      const json = JSON.parse(line);
      const type = json.type as string;

      // Init event - skip
      if (type === 'init') {
        return null;
      }

      // Message event - this contains the actual response
      if (type === 'message') {
        // Skip user messages (echo)
        if (json.role === 'user') {
          return null;
        }
        // Assistant message with content
        if (json.role === 'assistant' && json.content) {
          return {
            displayText: json.content,
            step: { type: 'text', content: json.content.substring(0, 100) },
          };
        }
        return null;
      }

      // Text content (alternative format)
      if (type === 'text' || json.text) {
        const text = json.text || json.content || '';
        if (!text) return null;
        return {
          displayText: text,
          step: { type: 'text', content: text.substring(0, 100) },
        };
      }

      // Tool use
      if (type === 'tool_use' || json.tool_use) {
        const toolData = json.tool_use || json.tool || {};
        const toolName = toolData.name || json.name || 'unknown';
        const input = toolData.input || json.input || {};
        const detail = input.file_path || input.path || input.command || input.pattern || '';

        return {
          displayText: `[Tool: ${toolName}]${detail ? ` ${detail}` : ''}`,
          step: { type: 'tool_use', content: `${toolName}${detail ? `: ${detail}` : ''}` },
        };
      }

      // Tool result
      if (type === 'tool_result' || json.tool_result) {
        const result = json.tool_result || json.result || json.content || '';
        const text = typeof result === 'string' ? result : JSON.stringify(result);
        return {
          displayText: `  → ${text.substring(0, 200)}`,
          step: { type: 'tool_use', content: text.substring(0, 100) },
        };
      }

      // Thinking/reasoning
      if (type === 'thinking' || json.thinking) {
        const thinking = json.thinking || json.content || '';
        return {
          displayText: `[Thinking] ${thinking.substring(0, 100)}...`,
          step: { type: 'step_start', content: 'Thinking...' },
        };
      }

      // Error
      if (type === 'error' || json.error) {
        const msg = json.error?.message || json.message || 'Unknown error';
        return {
          displayText: `❌ Error: ${msg}`,
          step: { type: 'error', content: msg },
        };
      }

      // Result/completion
      if (type === 'result') {
        if (json.status === 'success') {
          const stats = json.stats || {};
          const tokens = stats.total_tokens || 0;
          const duration = stats.duration_ms ? Math.round(stats.duration_ms / 1000) : 0;
          return {
            displayText: `\n✅ Completed in ${duration}s (${tokens} tokens)`,
            step: { type: 'complete', content: `Done in ${duration}s` },
          };
        }
        if (json.status === 'error') {
          const msg = json.error || 'Unknown error';
          return {
            displayText: `❌ Error: ${msg}`,
            step: { type: 'error', content: msg },
          };
        }
        return null;
      }

      // Complete event
      if (type === 'complete' || json.done) {
        const cost = json.cost ? ` ($${Number(json.cost).toFixed(4)})` : '';
        const duration = json.duration_ms ? ` in ${Math.round(json.duration_ms / 1000)}s` : '';
        return {
          displayText: `\n✅ Completed${duration}${cost}`,
          step: { type: 'complete', content: `Done${duration}${cost}` },
        };
      }

      // Skip unknown JSON types
      return null;

    } catch {
      // Not JSON — check if it's a system message
      const clean = line
        .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
        .trim();
      
      if (!clean) return null;
      
      // Skip system messages
      for (const keyword of systemKeywords) {
        if (clean.includes(keyword)) {
          return null;
        }
      }
      
      // Check for status icons
      if (clean.match(/^(✅|❌|⚠️|ℹ️)\s*(Completed|Error|Warning|Info)/i)) {
        return null;
      }
      
      return {
        displayText: clean,
        step: { type: 'text', content: clean.substring(0, 100) },
      };
    }
  },
};

// ─── Provider Registry ──────────────────────────────────────────────────

const PROVIDER_REGISTRY: Record<string, ProviderConfig> = {
  opencode: opencodeProvider,
  claude: claudeProvider,
  gemini: geminiProvider,
};

/**
 * Get the provider config for a given engine alias.
 * Falls back to defaultProvider if not found.
 */
export function getProvider(alias: string): ProviderConfig {
  return PROVIDER_REGISTRY[alias] || defaultProvider;
}

/**
 * Register a new provider at runtime.
 */
export function registerProvider(config: ProviderConfig): void {
  PROVIDER_REGISTRY[config.alias] = config;
}

/**
 * Get all registered provider aliases.
 */
export function getRegisteredProviders(): string[] {
  return Object.keys(PROVIDER_REGISTRY);
}
