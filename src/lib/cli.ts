/**
 * CLI Runner — Shared streaming CLI execution for AI engines.
 * 
 * Eliminates duplicate listener setup across runAITask, sendMessage, sendSimpleMessage.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getProvider } from '@/lib/providers';

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
  /** Called on each parsed output line */
  onOutput?: (displayText: string) => void;
  /** Context mode for token optimization */
  mode?: 'minimal' | 'standard' | 'full';
}

export interface CLIRunResult {
  success: boolean;
  content: string;
  errorMessage?: string;
}

// ─── Shared CLI Runner ──────────────────────────────────────────────────

/**
 * Run an AI engine CLI with streaming output.
 * 
 * Handles:
 * - Provider-specific arg building and output parsing
 * - Event listener setup/teardown (cli-output, cli-complete)
 * - Timeout management
 * - Output aggregation
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
    mode = 'standard',
  } = params;

  const provider = getProvider(engineAlias);
  let responseContent = '';
  let unlistenOutput: (() => void) | null = null;
  let unlistenComplete: (() => void) | null = null;

  try {
    // Setup completion promise FIRST to avoid race condition
    let completionResolve: ((result: { success: boolean; error_message?: string }) => void) | undefined;
    const completionPromise = new Promise<{ success: boolean; error_message?: string }>((resolve) => {
      completionResolve = resolve;
    });

    unlistenComplete = await listen('cli-complete', (event: { payload: { id: string; success: boolean; error_message?: string } }) => {
      if (event.payload.id !== taskId) return;
      if (completionResolve) completionResolve(event.payload);
    });

    // Setup output listener
    unlistenOutput = await listen('cli-output', (event: { payload: { id: string; line: string; is_error?: boolean } }) => {
      if (event.payload.id !== taskId) return;
      
      const parsed = provider.parseOutputLine(event.payload.line);
      if (!parsed) return;

      const displayText = parsed.displayText;
      if (displayText) {
        responseContent += displayText + '\n';
        onOutput?.(displayText);
      }
    });

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
    // Always cleanup listeners
    if (unlistenOutput) unlistenOutput();
    if (unlistenComplete) unlistenComplete();
  }
}
