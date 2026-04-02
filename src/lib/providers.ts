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
    return {
      args: engineArgs.split(' ').filter(Boolean),
      stdinPrompt: prompt, // Claude reads prompt from stdin
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
