import type { PiChatMessage } from './types';

/**
 * Returns the last min(N, 6) messages from a conversation history
 * for use as context in task creation prompts.
 *
 * @param messages - The full conversation history
 * @returns The last min(messages.length, 6) messages in chronological order
 */
export function getTaskCreationContext(messages: PiChatMessage[]): PiChatMessage[] {
  const maxContext = 6;
  const count = Math.min(messages.length, maxContext);
  return messages.slice(-count);
}
