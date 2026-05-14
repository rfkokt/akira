import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { sortMessagesByTimestamp } from '../messages';
import type { PiChatMessage } from '../types';

/**
 * Feature: pi-dev-integration, Property 7: Messages displayed in chronological order
 *
 * For any set of chat messages associated with a task, the display order SHALL be
 * sorted by timestamp in ascending order, regardless of the order in which messages
 * were added to the store.
 *
 * **Validates: Requirements 7.1**
 */

const piChatMessageArb: fc.Arbitrary<PiChatMessage> = fc.record({
  id: fc.uuid(),
  taskId: fc.uuid(),
  role: fc.constantFrom('user', 'assistant', 'system', 'steer') as fc.Arbitrary<PiChatMessage['role']>,
  content: fc.string(),
  thinking: fc.option(fc.string(), { nil: undefined }),
  toolExecutions: fc.constant(undefined),
  timestamp: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
});

describe('Property 7: Messages displayed in chronological order', () => {
  it('should sort any array of messages in ascending timestamp order', () => {
    fc.assert(
      fc.property(
        fc.array(piChatMessageArb, { minLength: 0, maxLength: 50 }),
        (messages) => {
          const sorted = sortMessagesByTimestamp(messages);

          // Assert: each message's timestamp is ≤ the next message's timestamp
          for (let i = 0; i < sorted.length - 1; i++) {
            expect(sorted[i].timestamp).toBeLessThanOrEqual(sorted[i + 1].timestamp);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve all messages (no messages lost or duplicated)', () => {
    fc.assert(
      fc.property(
        fc.array(piChatMessageArb, { minLength: 0, maxLength: 50 }),
        (messages) => {
          const sorted = sortMessagesByTimestamp(messages);

          // Same length
          expect(sorted.length).toBe(messages.length);

          // Same set of message IDs
          const originalIds = messages.map((m) => m.id).sort();
          const sortedIds = sorted.map((m) => m.id).sort();
          expect(sortedIds).toEqual(originalIds);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not mutate the original array', () => {
    fc.assert(
      fc.property(
        fc.array(piChatMessageArb, { minLength: 1, maxLength: 50 }),
        (messages) => {
          const originalOrder = messages.map((m) => m.id);
          sortMessagesByTimestamp(messages);

          // Original array unchanged
          const afterOrder = messages.map((m) => m.id);
          expect(afterOrder).toEqual(originalOrder);
        }
      ),
      { numRuns: 100 }
    );
  });
});
