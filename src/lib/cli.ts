/**
 * CLI Runner — Structured streaming CLI execution for AI engines.
 * 
 * Uses `agent-event-{taskId}` for structured streaming output.
 * Falls back to `cli-output`/`cli-complete` for backward compatibility.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getProvider } from '@/lib/providers';
import type { AnyAgentEvent, ToolUseEvent, ToolOutputEvent } from '@/lib/streaming';

// ─── Types ──────────────────────────────────────────────────────────────

export interface CLIRunParams {
  /** Task ID or Execution ID */
  taskId: string;
  /** Engine alias (opencode, claude, etc.) */
  engineAlias: string;
  /** Engine binary path */
  binaryPath: string;
  /** Engine args string from settings */
  engineArgs: string;
  /** The prompt to send */
  prompt: string;
  /** Workspace folder path */
  cwd: string | null;
  /** Timeout in ms (default: 5 minutes) */
  timeoutMs?: number;
  /** Called for each display text chunk */
  onOutput?: (displayText: string) => void;
  /** Called when thinking content arrives */
  onThinking?: (thinking: string) => void;
  /** Called when a tool use event arrives */
  onToolUse?: (tool: ToolUseEvent) => void;
  /** Called when a tool output arrives */
  onToolOutput?: (output: ToolOutputEvent) => void;
  /** Called when token usage stats arrive */
  onUsage?: (input: number, output: number, cache?: number) => void;
  /** Context mode for token optimization */
  mode?: 'minimal' | 'standard' | 'full';
}

export interface CLIRunResult {
  success: boolean;
  content: string;
  errorMessage?: string;
}

// ─── Structured CLI Runner ──────────────────────────────────────────────

/**
 * Run an AI engine CLI with structured streaming output.
 * 
 * Listens to `agent-event-{taskId}` for structured events and
 * `cli-complete` for completion detection.
 * Also falls back to `cli-output` for providers that don't emit structured events.
 */
export async function runCLIWithStreaming(params: CLIRunParams): Promise<CLIRunResult> {
  const {
    taskId,
    engineAlias,
    binaryPath,
    engineArgs,
    prompt,
    cwd,
    timeoutMs = 5 * 60 * 1000,
    onOutput,
    onThinking,
    onToolUse,
    onToolOutput,
    onUsage,
    mode = 'standard',
  } = params;

  const provider = getProvider(engineAlias);
  let responseContent = '';
  let unlisteners: UnlistenFn[] = [];

  try {
    // Completion promise
    let completionResolve: ((result: { success: boolean; error_message?: string }) => void) | undefined;
    const completionPromise = new Promise<{ success: boolean; error_message?: string }>((resolve) => {
      completionResolve = resolve;
    });

    // Track whether agent-events are being received for this task
    let receivedAgentEvent = false;

    // Listen for_completion event (legacy, reliable for knowing when process ends)
    const unlistenComplete = await listen('cli-complete', (event: { payload: { id: string; success: boolean; error_message?: string } }) => {
      if (event.payload.id !== taskId) return;
      if (completionResolve) completionResolve(event.payload);
    });
    unlisteners.push(unlistenComplete);

    // Listen for structured agent events
    const unlistenAgentEvent = await listen<AnyAgentEvent>(`agent-event-${taskId}`, (event) => {
      const agentEvent = event.payload;
      receivedAgentEvent = true;
      
      switch (agentEvent.type) {
        case 'thinking':
          onThinking?.(agentEvent.thinking);
          break;
        case 'text': {
          // Try provider-specific parsing for richer display
          const parsed = provider.parseOutputLine(agentEvent.text);
          
          // Forward thinking content from provider parsing
          if (parsed?.thinking) {
            onThinking?.(parsed.thinking);
          }
          
          // Forward usage stats from provider parsing
          if (parsed?.usage) {
            onUsage?.(parsed.usage.inputTokens, parsed.usage.outputTokens, parsed.usage.cacheTokens);
          }
          
          const displayText = parsed?.displayText || '';
          // Skip empty display text (e.g., thinking_delta, message_start, etc.)
          if (displayText) {
            responseContent += displayText;
            onOutput?.(displayText);
          }
          break;
        }
        case 'tool_use':
          onToolUse?.(agentEvent);
          break;
        case 'tool_output':
          onToolOutput?.(agentEvent);
          break;
        case 'usage':
          onUsage?.(agentEvent.input_tokens, agentEvent.output_tokens);
          break;
        case 'done':
          break;
        case 'error':
          console.error('[cli] Agent error:', agentEvent.error);
          break;
      }
    });
    unlisteners.push(unlistenAgentEvent);

    // Also listen to raw cli-output as fallback for providers
    // that don't emit properly structured agent events
    const unlistenOutput = await listen('cli-output', (event: { payload: { id: string; line: string; is_error?: boolean } }) => {
      if (event.payload.id !== taskId) return;
      if (event.payload.is_error) return; // Skip stderr lines — agent-event handles errors
      
      // If agent-events are being received, skip cli-output to avoid duplicates
      if (receivedAgentEvent) return;
      
      // Fallback: accumulate content from cli-output when agent-events not available
      const parsed = provider.parseOutputLine(event.payload.line);
      if (!parsed) return;
      
      const displayText = parsed.displayText;
      if (displayText) {
        responseContent += displayText;
        onOutput?.(displayText);
      }
    });
    unlisteners.push(unlistenOutput);

    // Build CLI args using provider
    const { args, stdinPrompt } = provider.buildArgs({
      engineArgs,
      prompt,
      cwd: cwd || '',
      mode,
    });

    console.log(`[cli] Running ${engineAlias} | Task: ${taskId} | Args: ${JSON.stringify(args)} | StdIn: ${stdinPrompt ? 'yes' : 'no'}`);

    // Start CLI
    await invoke('run_cli', {
      id: taskId,
      binary: binaryPath,
      args,
      prompt: stdinPrompt,
      cwd,
    });

    // Wait for completion with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`CLI timed out after ${timeoutMs / 1000}s`)), timeoutMs);
    });

    const result = await Promise.race([completionPromise, timeoutPromise]);

    return {
      success: result.success,
      content: responseContent,
      errorMessage: result.error_message,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[cli] Error:', errorMsg);
    return {
      success: false,
      content: responseContent,
      errorMessage: errorMsg,
    };
  } finally {
    for (const unlisten of unlisteners) {
      unlisten();
    }
  }
}