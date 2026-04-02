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
    return {
      args: ['run', '--format', 'json', '--dir', workingDir, prompt],
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

    return {
      args: [
        ...baseArgs,
        '-p',                                // non-interactive print mode
        '--output-format', 'stream-json',    // real-time JSON streaming
        '--include-partial-messages',        // stream text as it arrives
        '--verbose',                         // required by --output-format=stream-json
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
    return {
      args: engineArgs.split(' ').filter(Boolean),
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

// ─── Provider Registry ──────────────────────────────────────────────────

const PROVIDER_REGISTRY: Record<string, ProviderConfig> = {
  opencode: opencodeProvider,
  claude: claudeProvider,
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
