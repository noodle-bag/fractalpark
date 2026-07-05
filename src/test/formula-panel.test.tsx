import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { registerBuiltins } from '@/engine/plugins/builtins/index';
import { compileFrm } from '@/engine/frm/compile';
import { pluginRegistry } from '@/engine/plugins/registry';
import { FormulaPanel } from '@/components/fractal/FormulaPanel';

vi.mock('next-intl', () => ({
  useTranslations: () => ((key: string) => key),
}));

describe('FormulaPanel', () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;

    registerBuiltins();
    const compiled = compileFrm(`FnSlotWeave {
init:
  z = pixel
loop:
  z = fn1(z) + p1
bailout:
  |z| < 24
}`, 'custom-fn-slot-weave');

    if (compiled.success && compiled.plugin) {
      pluginRegistry.register(compiled.plugin);
    }
  });

  it('renders builtin formula sliders from plugin descriptors', () => {
    render(
      <FormulaPanel
        isJulia={false}
        juliaC={[-0.7, 0.27]}
        currentFormula="phoenix"
        currentBounds={{ centerX: -0.5, centerY: 0, zoom: 0.4, rotation: 0 }}
        pluginParams={{ u_phoenixP: -0.35 }}
        onJuliaModeChange={() => {}}
        onJuliaCChange={() => {}}
        onFormulaChange={() => {}}
        onFormulaParamChange={() => {}}
      />
    );

    expect(screen.getByText('controls.formulaParameters')).toBeInTheDocument();
    expect(screen.getByText('explore.controls.phoenixP')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('renders custom fn slot select and complex inputs', () => {
    render(
      <FormulaPanel
        isJulia={false}
        juliaC={[-0.7, 0.27]}
        currentFormula="custom-fn-slot-weave"
        currentBounds={{ centerX: 0.12, centerY: 0.02, zoom: 1.18, rotation: 0 }}
        pluginParams={{ u_fn1: 2, u_p1: [0.25, -0.1] }}
        onJuliaModeChange={() => {}}
        onJuliaCChange={() => {}}
        onFormulaChange={() => {}}
        onFormulaParamChange={() => {}}
      />
    );

    expect(screen.getByText('fn1')).toBeInTheDocument();
    expect(screen.getByText('p1')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0.25')).toBeInTheDocument();
    expect(screen.getByDisplayValue('-0.1')).toBeInTheDocument();
  });
});
