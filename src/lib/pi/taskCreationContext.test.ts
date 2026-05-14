import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getTaskCreationContext } from './taskCreationContext';
import type { PiChatMessage } from './types';

/**
 * Feature: pi-dev-integration
 * Property 13: Task creation context window limited to last 6 messages
 *
 * **Validates: Requirements 14.2**
 */

// Arbitrary generator for PiChatMessage
const piChatMessageArb: fc.Arbitrary<PiChatMessage> = fc.record({
  id: fc.uuid(),
  taskId: fc.uuid(),
  role: fc.constantFrom('user' as const, 'assistant' as const, 'system' as const, 'steer' as const),
  content: fc.string({ minLength: 0, maxLength: 200 }),
  thinking: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
  toolExecutions: fc.constant(undefined),
  timestamp: fc.nat({ max: 2000000000000 }),
});

// Generator for arrays of PiChatMessage of varying lengths (0 to 25)
const messagesArb = fc.array(piChatMessageArb, { minLength: 0, maxLength: 25 });

describe('Property 13: Task creation context window limited to last 6 messages', () => {
  it('result length is exactly min(messages.length, 6)', () => {
    fc.assert(
      fc.property(messagesArb, (messages) => {
        const result = getTaskCreationContext(messages);
        const expectedLength = Math.min(messages.length, 6);
        expect(result).toHaveLength(expectedLength);
      }),
      { numRuns: 200 }
    );
  });

  it('result contains the last min(N, 6) messages in order', () => {
    fc.assert(
      fc.property(messagesArb, (messages) => {
        const result = getTaskCreationContext(messages);
        const expectedCount = Math.min(messages.length, 6);
        const expectedMessages = messages.slice(-expectedCount);

        // Each message in result should be the same reference as the corresponding tail message
        for (let i = 0; i < result.length; i++) {
          expect(result[i]).toBe(expectedMessages[i]);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('result preserves chronological order from original array', () => {
    fc.assert(
      fc.property(messagesArb, (messages) => {
        const result = getTaskCreationContext(messages);

        // If we have messages, verify the result maintains the same relative order
        if (result.length > 1) {
          for (let i = 0; i < result.length - 1; i++) {
            const indexInOriginal = messages.indexOf(result[i]);
            const nextIndexInOriginal = messages.indexOf(result[i + 1]);
            expect(indexInOriginal).toBeLessThan(nextIndexInOriginal);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('never returns more than 6 messages regardless of input size', () => {
    fc.assert(
      fc.property(
        fc.array(piChatMessageArb, { minLength: 7, maxLength: 25 }),
        (messages) => {
          const result = getTaskCreationContext(messages);
          expect(result.length).toBeLessThanOrEqual(6);
          expect(result.length).toBe(6);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns all messages when input has 6 or fewer', () => {
    fc.assert(
      fc.property(
        fc.array(piChatMessageArb, { minLength: 0, maxLength: 6 }),
        (messages) => {
          const result = getTaskCreationContext(messages);
          expect(result.length).toBe(messages.length);
          // All messages should be included
          for (let i = 0; i < messages.length; i++) {
            expect(result[i]).toBe(messages[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
