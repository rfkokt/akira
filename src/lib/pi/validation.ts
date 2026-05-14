/**
 * Pure input validation functions for Pi chat input.
 */

/**
 * Validates that the input string is non-empty and contains at least one
 * non-whitespace character. Returns false for empty strings or strings
 * composed entirely of whitespace (spaces, tabs, newlines).
 */
export function isValidInput(input: string): boolean {
  return input.trim().length > 0;
}
