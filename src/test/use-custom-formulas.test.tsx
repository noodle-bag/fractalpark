import { act, renderHook } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBuiltins } from '@/engine/plugins/builtins/index';
import { pluginRegistry } from '@/engine/plugins/registry';
import { useCustomFormulas } from '@/hooks/useCustomFormulas';
import {
  CUSTOM_FORMULAS_STORAGE_KEY,
  MAX_CUSTOM_FORMULAS,
} from '@/lib/custom-formula-storage';

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

  it('does not expose or register a formula when local persistence fails', () => {
    const now = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage blocked');
      },
      removeItem: () => {},
      clear: () => {},
    });
    const hook = renderHook(() => useCustomFormulas());

    act(() => {
      expect(
        hook.result.current.saveFormula('Unavailable', SIMPLE_SOURCE)
      ).toEqual({
        success: false,
        code: 'storage-unavailable',
      });
    });

    expect(hook.result.current.formulas).toHaveLength(0);
    expect(pluginRegistry.hasFormula(`custom-${now}`)).toBe(false);
    nowSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('keeps rename and delete atomic when local persistence fails', () => {
    const existing = {
      id: 'custom-existing-atomic',
      name: 'Original Name',
      source: SIMPLE_SOURCE,
      createdAt: 1,
      updatedAt: 1,
    };
    storage.set(CUSTOM_FORMULAS_STORAGE_KEY, JSON.stringify([existing]));
    const hook = renderHook(() => useCustomFormulas());
    expect(hook.result.current.formulas[0]?.name).toBe('Original Name');
    expect(pluginRegistry.hasFormula(existing.id)).toBe(true);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: () => {
        throw new Error('storage blocked');
      },
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });

    act(() => {
      expect(
        hook.result.current.renameFormula(existing.id, 'Lost Rename')
      ).toEqual({ success: false, code: 'storage-unavailable' });
    });
    expect(hook.result.current.formulas[0]?.name).toBe('Original Name');
    expect(pluginRegistry.hasFormula(existing.id)).toBe(true);

    act(() => {
      expect(hook.result.current.deleteFormula(existing.id)).toEqual({
        success: false,
        code: 'storage-unavailable',
      });
    });
    expect(hook.result.current.formulas).toHaveLength(1);
    expect(pluginRegistry.hasFormula(existing.id)).toBe(true);
    expect(storage.get(CUSTOM_FORMULAS_STORAGE_KEY)).toBe(
      JSON.stringify([existing])
    );
    consoleSpy.mockRestore();
  });

  it('accepts the 50th stored formula and rejects a 51st formula', () => {
    const records = Array.from({ length: MAX_CUSTOM_FORMULAS }, (_, index) => ({
      id: `custom-limit-${index}`,
      name: `Formula ${index}`,
      source: SIMPLE_SOURCE,
      createdAt: index,
      updatedAt: index,
    }));
    storage.set(CUSTOM_FORMULAS_STORAGE_KEY, JSON.stringify(records));
    const hook = renderHook(() => useCustomFormulas());

    expect(hook.result.current.formulas).toHaveLength(MAX_CUSTOM_FORMULAS);
    act(() => {
      expect(
        hook.result.current.saveFormula('Formula 51', SIMPLE_SOURCE)
      ).toEqual({ success: false, code: 'max-count' });
    });
    expect(hook.result.current.formulas).toHaveLength(MAX_CUSTOM_FORMULAS);
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
