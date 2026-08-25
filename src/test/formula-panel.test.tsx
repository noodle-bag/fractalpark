import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { registerBuiltins } from '@/engine/plugins/builtins/index';
import { compileClassicFrmEntry, compileFrm } from '@/engine/frm/compile';
import { pluginRegistry } from '@/engine/plugins/registry';
import type { FormulaPlugin } from '@/engine/plugins/types';
import { FormulaPanel } from '@/components/fractal/FormulaPanel';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
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
    HTMLElement.prototype.scrollIntoView = vi.fn();

    registerBuiltins();
    const legacyMandelbrot = pluginRegistry.getFormula('mandelbrot');
    if (legacyMandelbrot) {
      const supportedJuliaPlugin: FormulaPlugin = {
        ...legacyMandelbrot,
        id: 'test-supported-julia',
        name: 'Test Supported Julia',
        supportsJulia: true,
      };
      pluginRegistry.register(supportedJuliaPlugin);
    }
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

    const classic = compileClassicFrmEntry(`ClassicSlots {
  z = p1:
  z = fn2(z) + p3
  |z| < 16
}`, undefined, 'classic-slots');
    if (classic.success && classic.plugin) {
      pluginRegistry.register(classic.plugin);
    }
  });

  it('highlights both formula modes without changing the switch semantics', () => {
    const props = {
      juliaC: [-0.7, 0.27] as [number, number],
      currentFormula: 'test-supported-julia',
      currentBounds: { centerX: -0.5, centerY: 0, zoom: 0.4, rotation: 0 },
      onJuliaModeChange: () => {},
      onJuliaCChange: () => {},
      onFormulaChange: () => {},
      onFormulaParamChange: () => {},
    };
    const { rerender } = render(<FormulaPanel {...props} isJulia={false} />);

    expect(screen.getByText('controls.mode.mandelbrot')).toHaveClass(
      'rainbow-text',
      'font-semibold'
    );
    expect(screen.getByRole('switch')).toHaveAccessibleName('controls.mode.label');

    rerender(<FormulaPanel {...props} isJulia />);

    expect(screen.getByText('controls.mode.julia')).toHaveClass(
      'rainbow-text',
      'font-semibold'
    );
    expect(screen.getByRole('switch')).toHaveAccessibleName('controls.mode.label');
  });

  it('hides Julia editing for a missing census row without mutating legacy props', () => {
    const onJuliaModeChange = vi.fn();
    render(
      <FormulaPanel
        isJulia
        juliaC={[-0.62, 0.41]}
        currentFormula="mandelbrot"
        currentBounds={{ centerX: 0, centerY: 0, zoom: 0.4, rotation: 0 }}
        onJuliaModeChange={onJuliaModeChange}
        onJuliaCChange={() => {}}
        onFormulaChange={() => {}}
        onFormulaParamChange={() => {}}
      />
    );

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('controls.juliaC.label')).not.toBeInTheDocument();
    expect(onJuliaModeChange).not.toHaveBeenCalled();
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

  it('renders only the used classic parameter and function uniforms', () => {
    render(
      <FormulaPanel
        isJulia={false}
        juliaC={[-0.7, 0.27]}
        currentFormula="classic-slots"
        currentBounds={{ centerX: 0, centerY: 0, zoom: 1, rotation: 0 }}
        pluginParams={{ u_p1: [0.1, 0.2], u_p3: [0.3, 0.4], u_fn2: 2 }}
        onJuliaModeChange={() => {}}
        onJuliaCChange={() => {}}
        onFormulaChange={() => {}}
        onFormulaParamChange={() => {}}
      />
    );

    expect(screen.getByText('p1')).toBeInTheDocument();
    expect(screen.getByText('p3')).toBeInTheDocument();
    expect(screen.getByText('fn2')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.queryByText('p2')).not.toBeInTheDocument();
    expect(screen.queryByText('fn1')).not.toBeInTheDocument();
  });

  it('renders and edits published parameters from their versioned descriptor types', async () => {
    const onFormulaParamChange = vi.fn();
    const renderPanel = (offset: [number, number] = [0.1, -0.2]) => (
      <FormulaPanel
        isJulia={false}
        juliaC={[-0.7, 0.27]}
        currentFormula="00000000-0000-4000-8000-000000000001"
        currentBounds={{ centerX: 0, centerY: 0, zoom: 1, rotation: 0 }}
        pluginParams={{
          frmV1_scale: [0.25, 0],
          frmV1_offset: offset,
          u_frm_fn1: 1,
        }}
        publishedDescriptor={{
          schema: 'fractalpark-published-formula-descriptor/v1',
          formulaId: '00000000-0000-4000-8000-000000000001',
          sourceRevision: 'a'.repeat(64),
          semanticHash: 'b'.repeat(64),
          parameters: [
            {
              slotName: 'scale',
              type: 'real',
              default: 0.5,
              hardDomain: [-1, 1],
              uniformName: 'frmV1_scale',
            },
            {
              slotName: 'offset',
              type: 'complex',
              default: [0, 0],
              uniformName: 'frmV1_offset',
            },
            {
              slotName: 'fn1',
              type: 'function',
              default: 'identity',
              uniformName: 'u_frm_fn1',
              options: ['identity', 'sin'],
            },
          ],
        }}
        onJuliaModeChange={() => {}}
        onJuliaCChange={() => {}}
        onFormulaChange={() => {}}
        onFormulaParamChange={onFormulaParamChange}
      />
    );
    const { rerender } = render(renderPanel());

    const scale = screen.getByLabelText('scale');
    const offsetReal = screen.getByLabelText('offset controls.complexReal');
    const offsetImaginary = screen.getByLabelText('offset controls.complexImaginary');
    expect(scale).toHaveValue('0.25');
    expect(offsetReal).toHaveValue('0.1');
    expect(offsetImaginary).toHaveValue('-0.2');
    expect(scale).toHaveAttribute('role', 'spinbutton');
    expect(scale).toHaveAttribute('step', '0.1');
    expect(screen.getByRole('combobox', { name: 'fn1' })).toHaveTextContent('sin');

    fireEvent.change(scale, { target: { value: '2' } });
    expect(scale).toHaveValue('2');
    expect(onFormulaParamChange).not.toHaveBeenCalled();
    fireEvent.blur(scale);
    expect(onFormulaParamChange).toHaveBeenCalledWith('frmV1_scale', [1, 0]);

    fireEvent.change(offsetReal, {
      target: { value: '0.' },
    });
    expect(offsetReal).toHaveValue('0.');
    expect(onFormulaParamChange).toHaveBeenCalledTimes(1);
    fireEvent.change(offsetReal, {
      target: { value: '4e-1' },
    });
    fireEvent.keyDown(offsetReal, { key: 'Enter' });
    expect(onFormulaParamChange).toHaveBeenCalledWith('frmV1_offset', [0.4, -0.2]);

    rerender(renderPanel());
    fireEvent.change(offsetImaginary, { target: { value: '6e-1' } });
    fireEvent.keyDown(offsetImaginary, { key: 'Enter' });
    expect(onFormulaParamChange).toHaveBeenCalledWith('frmV1_offset', [0.4, 0.6]);

    rerender(renderPanel([0.4, -0.2]));
    const rerenderedReal = screen.getByLabelText('offset controls.complexReal');
    fireEvent.change(rerenderedReal, { target: { value: '0.5' } });
    fireEvent.keyDown(rerenderedReal, { key: 'Enter' });
    expect(onFormulaParamChange).toHaveBeenCalledWith('frmV1_offset', [0.5, 0.6]);

    rerender(renderPanel([0.4, 0.6]));
    const pendingReal = screen.getByLabelText('offset controls.complexReal');
    expect(pendingReal).toHaveValue('0.5');
    fireEvent.click(screen.getByRole('button', { name: 'offset controls.complexReal controls.increase' }));
    expect(onFormulaParamChange).toHaveBeenCalledWith('frmV1_offset', [0.6, 0.6]);

    fireEvent.click(screen.getByRole('combobox', { name: 'fn1' }));
    fireEvent.click(await screen.findByRole('option', { name: 'identity' }));
    expect(onFormulaParamChange).toHaveBeenCalledWith('u_frm_fn1', 0);
  });
});
