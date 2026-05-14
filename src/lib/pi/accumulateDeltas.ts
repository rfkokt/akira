/**
 * Pure function that accumulates streaming text deltas into final content.
 * This mirrors the logic in piStore's handlePiEvent for message_update events.
 *
 * Given a sequence of text_delta strings, returns the concatenated result.
 */
export function accumulateTextDeltas(deltas: string[]): string {
  let content = '';
  for (const delta of deltas) {
    content += delta;
  }
  return content;
}

/**
 * Pure function that accumulates streaming thinking deltas into final thinking content.
 * This mirrors the logic in piStore's handlePiEvent for thinking_delta in message_update events.
 *
 * Given a sequence of thinking_delta strings, returns the concatenated result.
 */
export function accumulateThinkingDeltas(deltas: string[]): string {
  let thinking = '';
  for (const delta of deltas) {
    thinking += delta;
  }
  return thinking;
}

/**
 * Simulates the full streaming accumulation as done in piStore.handlePiEvent.
 * Processes a sequence of message_update events (each with optional text_delta and thinking_delta)
 * and returns the final accumulated content and thinking.
 */
export function accumulateMessageUpdates(
  updates: Array<{ text_delta?: string; thinking_delta?: string }>
): { content: string; thinking: string } {
  let content = '';
  let thinking = '';

  for (const update of updates) {
    if (update.text_delta) {
      content += update.text_delta;
    }
    if (update.thinking_delta) {
      thinking += update.thinking_delta;
    }
  }

  return { content, thinking };
}
