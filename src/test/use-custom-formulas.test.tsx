import { act, renderHook } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBuiltins } from '@/engine/plugins/builtins/index';
import { useCustomFormulas } from '@/hooks/useCustomFormulas';

const SIMPLE_SOURCE = `HintedExample {
init:
  z = pixel
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

describe('useCustomFormulas', () => {
  let storage = new Map<string, string>();

  beforeAll(() => {
    registerBuiltins({ quiet: true });
  });

  beforeEach(() => {
    storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
  });

  it('persists and reloads experience hints for saved formulas', () => {
    const hint = {
      bounds: {
        centerX: -0.12,
        centerY: 0.04,
        zoom: 1.1,
        rotation: 0,
      },
      coloring: {
        outsideColoringId: 'orbitEcho',
        insideColoringId: 'finalOrbit',
        paletteIndex: 4,
      },
    };

    const first = renderHook(() => useCustomFormulas());

    act(() => {
      const result = first.result.current.saveFormula('Hinted Example', SIMPLE_SOURCE, hint);
      expect(result.success).toBe(true);
    });

    expect(first.result.current.formulas).toHaveLength(1);
    expect(first.result.current.formulas[0].experienceHint).toEqual(hint);

    first.unmount();

    const second = renderHook(() => useCustomFormulas());
    expect(second.result.current.formulas).toHaveLength(1);
    expect(second.result.current.formulas[0].experienceHint).toEqual(hint);
  });

  it('updates an existing formula instead of duplicating it when an id is provided', () => {
    const firstHint = {
      bounds: {
        centerX: -0.5,
        centerY: 0,
        zoom: 0.4,
        rotation: 0,
      },
    };

    const updatedHint = {
      bounds: {
        centerX: -0.12,
        centerY: 0.08,
        zoom: 2.4,
        rotation: 0.1,
      },
    };

    const hook = renderHook(() => useCustomFormulas());

    act(() => {
      const result = hook.result.current.saveFormula('Editable Example', SIMPLE_SOURCE, firstHint);
      expect(result.success).toBe(true);
    });

    const formulaId = hook.result.current.formulas[0]?.id ?? '';
    expect(formulaId).not.toBe('');

    act(() => {
      const result = hook.result.current.saveFormula(
        'Editable Example',
        SIMPLE_SOURCE.replace('|z| < 4', '|z| < 16'),
        updatedHint,
        formulaId,
      );
      expect(result.success).toBe(true);
    });

    expect(hook.result.current.formulas).toHaveLength(1);
    expect(hook.result.current.formulas[0]?.id).toBe(formulaId);
    expect(hook.result.current.formulas[0]?.experienceHint).toEqual(updatedHint);
    expect(hook.result.current.formulas[0]?.source).toContain('|z| < 16');
  });

  it('derives experience hints from native source metadata when no explicit hint is saved', () => {
    const nativeSource = `; @mode: native
; @default-view: -0.7435, 0.1314, 88, 0
NativeHinted {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

    const hook = renderHook(() => useCustomFormulas());

    act(() => {
      const result = hook.result.current.saveFormula('Native Hinted', nativeSource);
      expect(result.success).toBe(true);
    });

    expect(hook.result.current.formulas[0]?.experienceHint?.bounds).toEqual({
      centerX: -0.7435,
      centerY: 0.1314,
      zoom: 88,
      rotation: 0,
    });
  });
});
