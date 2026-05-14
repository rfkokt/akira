import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { shouldShowContextWarning } from '../sessionStats';

/**
 * Feature: pi-dev-integration, Property 9: Context window warning threshold
 *
 * For any session stats where contextWindowPct exceeds 0.80, the session stats display
 * SHALL show a warning indicator. For any value at or below 0.80, no warning SHALL be shown.
 *
 * **Validates: Requirements 8.4**
 */
describe('Property 9: Context window warning threshold', () => {
  it('should show warning for any contextWindowPct > 0.80', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.80 + Number.EPSILON, max: 1.0, noNaN: true }),
        (pct: number) => {
          // Only test values strictly greater than 0.80
          fc.pre(pct > 0.80);
          expect(shouldShowContextWarning(pct)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not show warning for any contextWindowPct <= 0.80', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.0, max: 0.80, noNaN: true }),
        (pct: number) => {
          expect(shouldShowContextWarning(pct)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not show warning at exactly 0.80 (boundary)', () => {
    expect(shouldShowContextWarning(0.80)).toBe(false);
  });

  it('should show warning just above 0.80 (boundary)', () => {
    expect(shouldShowContextWarning(0.80 + Number.EPSILON)).toBe(true);
  });

  it('warning shown iff contextWindowPct > 0.80 for any value in [0, 1]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.0, max: 1.0, noNaN: true }),
        (pct: number) => {
          const result = shouldShowContextWarning(pct);
          if (pct > 0.80) {
            expect(result).toBe(true);
          } else {
            expect(result).toBe(false);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
