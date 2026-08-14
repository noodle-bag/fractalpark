// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  FormulaBrowser,
  isBuiltinBrowserFormulaId,
  listBuiltinBrowserFormulas,
} from '@/components/fractal/FormulaBrowser';
import { registerBuiltins } from '@/engine/plugins/builtins';
import { pluginRegistry } from '@/engine/plugins/registry';
import type { FormulaPlugin } from '@/engine/plugins/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const CLOUD_ID = 'custom-77777777-7777-4777-8777-777777777777';
const IMPORTED_ID = 'frm-browser-import';
const LOCAL_ID = 'custom-browser-local';
const FAKE_BUILTIN_ID = 'dynamic-fake-builtin';
const DYNAMIC_IDS = [CLOUD_ID, IMPORTED_ID, LOCAL_ID, FAKE_BUILTIN_ID];

function dynamicFormula(
  id: string,
  name: string,
  source: FormulaPlugin['source'],
): FormulaPlugin {
  return {
    id,
    category: 'formula',
    name,
    source,
    glsl: 'vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) { return z; }',
    uniforms: [],
    supportsJulia: true,
  };
}

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  registerBuiltins({ quiet: true });
});

afterEach(() => {
  cleanup();
  for (const id of DYNAMIC_IDS) {
    pluginRegistry.unregister('formula', id);
  }
});

describe('FormulaBrowser built-in boundary', () => {
  it('filters dynamic registry entries at the source and catalog boundaries', async () => {
    pluginRegistry.register(dynamicFormula(CLOUD_ID, 'Cloud leak', 'frm'));
    pluginRegistry.register(dynamicFormula(LOCAL_ID, 'Local leak', 'custom'));
    pluginRegistry.register(
      dynamicFormula(FAKE_BUILTIN_ID, 'Fake built-in leak', 'builtin'),
    );

    const onFormulaChange = vi.fn();
    const view = render(
      <FormulaBrowser
        currentFormula="mandelbrot"
        onFormulaChange={onFormulaChange}
      />,
    );

    await screen.findByText('controls.formula.mandelbrot');
    expect(screen.queryByText('Cloud leak')).not.toBeInTheDocument();
    expect(screen.queryByText('Local leak')).not.toBeInTheDocument();
    expect(
      screen.queryByText(`controls.formula.${FAKE_BUILTIN_ID}`),
    ).not.toBeInTheDocument();

    act(() => {
      pluginRegistry.register(
        dynamicFormula(IMPORTED_ID, 'Late imported leak', 'frm'),
      );
    });
    await waitFor(() => {
      expect(screen.queryByText('Late imported leak')).not.toBeInTheDocument();
    });

    expect(listBuiltinBrowserFormulas().every((formula) => formula.source === 'builtin')).toBe(
      true,
    );
    expect(listBuiltinBrowserFormulas().map((formula) => formula.id)).not.toEqual(
      expect.arrayContaining(DYNAMIC_IDS),
    );
    expect(isBuiltinBrowserFormulaId(CLOUD_ID)).toBe(false);
    expect(isBuiltinBrowserFormulaId(FAKE_BUILTIN_ID)).toBe(false);

    const mandelbrotCard = screen
      .getByText('controls.formula.mandelbrot')
      .closest('button');
    expect(mandelbrotCard).not.toBeNull();
    fireEvent.click(mandelbrotCard!);
    expect(onFormulaChange).toHaveBeenCalledTimes(1);
    expect(onFormulaChange).toHaveBeenCalledWith('mandelbrot');
    view.unmount();
  });
});
