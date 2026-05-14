import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { isValidInput } from '../validation';

/**
 * Feature: pi-dev-integration, Property 8: Whitespace-only input rejection
 *
 * For any string composed entirely of whitespace characters (spaces, tabs, newlines),
 * the input validation SHALL reject submission. For any string containing at least one
 * non-whitespace character, the input validation SHALL accept submission.
 *
 * **Validates: Requirements 7.10**
 */

/** Arbitrary that generates whitespace-only strings (spaces, tabs, newlines) */
const whitespaceOnlyArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom(' ', '\t', '\n', '\r', '\r\n', '\f', '\v'),
  { minLength: 0, maxLength: 100 }
);

/** Arbitrary that generates strings with at least one non-whitespace character */
const nonWhitespaceArb: fc.Arbitrary<string> = fc.tuple(
  fc.string({ minLength: 0, maxLength: 50 }),
  fc.char().filter((c) => c.trim().length > 0),
  fc.string({ minLength: 0, maxLength: 50 })
).map(([prefix, nonWs, suffix]) => prefix + nonWs + suffix);

describe('Property 8: Whitespace-only input rejection', () => {
  it('should reject whitespace-only strings', () => {
    fc.assert(
      fc.property(whitespaceOnlyArb, (input) => {
        expect(isValidInput(input)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('should accept strings with at least one non-whitespace character', () => {
    fc.assert(
      fc.property(nonWhitespaceArb, (input) => {
        expect(isValidInput(input)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject the empty string', () => {
    expect(isValidInput('')).toBe(false);
  });
});
