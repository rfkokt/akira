import type { PiChatMessage } from './types';

/**
 * Sorts messages by timestamp in ascending chronological order.
 * Returns a new array without mutating the input.
 */
export function sortMessagesByTimestamp(messages: PiChatMessage[]): PiChatMessage[] {
  return [...messages].sort((a, b) => a.timestamp - b.timestamp);
}
