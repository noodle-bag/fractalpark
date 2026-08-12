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

  it('dispatches once when the same bytes move from legacy v1 to strict v2', () => {
    const formulaId = 'version-change-probe';
    let listenerRuns = 0;
    const listener = () => {
      listenerRuns += 1;
    };
    window.addEventListener(CUSTOM_FORMULAS_CHANGED_EVENT, listener);
    try {
      expect(
        resolveCustomFormula({
          id: formulaId,
          source: VALID_FRM,
          frmSemanticsVersion: 1,
        }).success,
      ).toBe(true);
      expect(listenerRuns).toBe(1);

      expect(
        resolveCustomFormula({
          id: formulaId,
          source: VALID_FRM,
          frmSemanticsVersion: 2,
        }).success,
      ).toBe(true);
      expect(listenerRuns).toBe(2);
      expect(
        readSessionFormulaAssets().find((asset) => asset.id === formulaId)
          ?.frmSemanticsVersion,
      ).toBe(2);

      resolveCustomFormula({
        id: formulaId,
        source: VALID_FRM,
        frmSemanticsVersion: 2,
      });
      expect(listenerRuns).toBe(2);
    } finally {
      window.removeEventListener(CUSTOM_FORMULAS_CHANGED_EVENT, listener);
    }
  });

  it('keeps an equivalent experience hint silent when object key order changes', () => {
    const formulaId = 'hint-order-probe';
    let listenerRuns = 0;
    const listener = () => {
      listenerRuns += 1;
    };
    window.addEventListener(CUSTOM_FORMULAS_CHANGED_EVENT, listener);
    try {
      resolveCustomFormula({
        id: formulaId,
        source: VALID_FRM,
        experienceHint: {
          bounds: { centerX: 1, centerY: 2, zoom: 3, rotation: 4 },
          coloring: {
            outsideColoringId: 'smooth',
            insideColoringId: 'solid',
            paletteIndex: 5,
          },
        },
      });
      expect(listenerRuns).toBe(1);

      resolveCustomFormula({
        id: formulaId,
        source: VALID_FRM,
        experienceHint: {
          coloring: {
            paletteIndex: 5,
            insideColoringId: 'solid',
            outsideColoringId: 'smooth',
          },
          bounds: { rotation: 4, zoom: 3, centerY: 2, centerX: 1 },
        },
      });
      expect(listenerRuns).toBe(1);
    } finally {
      window.removeEventListener(CUSTOM_FORMULAS_CHANGED_EVENT, listener);
    }
  });
});
