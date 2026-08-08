// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import {
  CUSTOM_FORMULAS_CHANGED_EVENT,
  readSessionFormulaAssets,
  resolveCustomFormula,
  resolveFormulaReference,
} from '@/lib/formula-resolver';

const VALID_FRM = `StormProbe {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

describe('formula registry change signal (review B1)', () => {
  it('re-resolving from session assets never re-dispatches the event', () => {
    let listenerRuns = 0;
    const listener = () => {
      listenerRuns += 1;
      // Mirror the ExploreClient listener: re-resolve on every change.
      resolveFormulaReference('storm-probe', readSessionFormulaAssets());
    };
    window.addEventListener(CUSTOM_FORMULAS_CHANGED_EVENT, listener);
    try {
      const first = resolveCustomFormula({ id: 'storm-probe', source: VALID_FRM });
      expect(first.success).toBe(true);
      // Exactly one dispatch for the new registration; the listener's own
      // re-resolution must not self-excite (pre-fix this ran ~3000 times).
      expect(listenerRuns).toBe(1);

      // Re-registering the same id (e.g. a repeated cloud save) is silent.
      resolveCustomFormula({ id: 'storm-probe', source: VALID_FRM });
      expect(listenerRuns).toBe(1);
    } finally {
      window.removeEventListener(CUSTOM_FORMULAS_CHANGED_EVENT, listener);
    }
  });
});
