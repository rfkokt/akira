/**
 * Pure utility functions for session statistics display logic.
 */

/**
 * Determines whether a context window warning should be shown.
 * Returns true if contextWindowPct exceeds 0.80 (80%).
 *
 * @param contextWindowPct - A value between 0 and 1 representing context window usage
 * @returns true if warning should be displayed, false otherwise
 */
export function shouldShowContextWarning(contextWindowPct: number): boolean {
  return contextWindowPct > 0.80;
}
