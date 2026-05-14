import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { constructPromptWithRules } from '../rulesPrompt';

/**
 * Feature: pi-dev-integration, Property 11: Rules content prepended before user message
 *
 * For any non-empty rules content and any user prompt message, the constructed prompt
 * sent to Pi SHALL contain the rules content appearing before the user message content.
 *
 * **Validates: Requirements 10.2**
 */

/** Arbitrary that generates non-empty rules content */
const nonEmptyRulesArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 500 });

/** Arbitrary that generates user messages (can be any string) */
const userMessageArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 500 });

describe('Property 11: Rules content prepended before user message', () => {
  it('should contain rules content appearing before user message in constructed prompt', () => {
    fc.assert(
      fc.property(nonEmptyRulesArb, userMessageArb, (rules, userMessage) => {
        const prompt = constructPromptWithRules(rules, userMessage);

        const rulesIndex = prompt.indexOf(rules);
        const userMessageIndex = prompt.indexOf(userMessage);

        // Rules content must be present in the prompt
        expect(rulesIndex).toBeGreaterThanOrEqual(0);
        // User message must be present in the prompt
        expect(userMessageIndex).toBeGreaterThanOrEqual(0);
        // Rules content must appear before user message
        expect(rulesIndex).toBeLessThan(userMessageIndex);
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve the full rules content in the constructed prompt', () => {
    fc.assert(
      fc.property(nonEmptyRulesArb, userMessageArb, (rules, userMessage) => {
        const prompt = constructPromptWithRules(rules, userMessage);
        expect(prompt).toContain(rules);
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve the full user message in the constructed prompt', () => {
    fc.assert(
      fc.property(nonEmptyRulesArb, userMessageArb, (rules, userMessage) => {
        const prompt = constructPromptWithRules(rules, userMessage);
        expect(prompt).toContain(userMessage);
      }),
      { numRuns: 100 }
    );
  });
});
