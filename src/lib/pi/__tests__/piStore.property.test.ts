import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  accumulateTextDeltas,
  accumulateThinkingDeltas,
  accumulateMessageUpdates,
} from '../accumulateDeltas';

/**
 * Property 5: Streaming delta concatenation preserves content
 *
 * For any sequence of message_update events containing text_delta or thinking_delta values,
 * the accumulated content in the corresponding message field (content or thinking)
 * SHALL equal the ordered concatenation of all delta strings in the sequence.
 *
 * **Validates: Requirements 4.1, 4.2**
 */
describe('Property 5: Streaming delta concatenation preserves content', () => {
  it('text_delta accumulation equals ordered concatenation', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 0, maxLength: 50 }),
        (deltas: string[]) => {
          const accumulated = accumulateTextDeltas(deltas);
          const expected = deltas.join('');
          expect(accumulated).toBe(expected);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('thinking_delta accumulation equals ordered concatenation', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 0, maxLength: 50 }),
        (deltas: string[]) => {
          const accumulated = accumulateThinkingDeltas(deltas);
          const expected = deltas.join('');
          expect(accumulated).toBe(expected);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('mixed text_delta and thinking_delta accumulation preserves both independently', () => {
    const messageUpdateArb = fc.record({
      text_delta: fc.option(fc.string(), { nil: undefined }),
      thinking_delta: fc.option(fc.string(), { nil: undefined }),
    });

    fc.assert(
      fc.property(
        fc.array(messageUpdateArb, { minLength: 0, maxLength: 50 }),
        (updates) => {
          const result = accumulateMessageUpdates(updates);

          // Expected content is the concatenation of all text_delta values in order
          const expectedContent = updates
            .map((u) => u.text_delta ?? '')
            .join('');

          // Expected thinking is the concatenation of all thinking_delta values in order
          const expectedThinking = updates
            .map((u) => u.thinking_delta ?? '')
            .join('');

          expect(result.content).toBe(expectedContent);
          expect(result.thinking).toBe(expectedThinking);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('empty delta sequence produces empty content', () => {
    fc.assert(
      fc.property(fc.constant([]), (deltas: string[]) => {
        expect(accumulateTextDeltas(deltas)).toBe('');
        expect(accumulateThinkingDeltas(deltas)).toBe('');
      }),
      { numRuns: 100 }
    );
  });

  it('single delta equals itself', () => {
    fc.assert(
      fc.property(fc.string(), (delta: string) => {
        expect(accumulateTextDeltas([delta])).toBe(delta);
        expect(accumulateThinkingDeltas([delta])).toBe(delta);
      }),
      { numRuns: 200 }
    );
  });

  it('accumulation is associative (splitting deltas at any point gives same result)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 2, maxLength: 30 }),
        fc.nat(),
        (deltas, splitIdx) => {
          const normalizedSplit = splitIdx % deltas.length;
          const firstPart = deltas.slice(0, normalizedSplit);
          const secondPart = deltas.slice(normalizedSplit);

          const fullResult = accumulateTextDeltas(deltas);
          const partialResult =
            accumulateTextDeltas(firstPart) + accumulateTextDeltas(secondPart);

          expect(fullResult).toBe(partialResult);
        }
      ),
      { numRuns: 200 }
    );
  });
});
