import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ComplexPlanePicker } from '@/components/fractal/ComplexPlanePicker';

const AXIS = { min: -2, max: 2 } as const;

function renderPicker(
  value: [number, number],
  onChange: (next: [number, number]) => void,
) {
  return render(
    <ComplexPlanePicker
      value={value}
      onChange={onChange}
      realAxis={AXIS}
      imaginaryAxis={AXIS}
      pointerStep={0.01}
      keyboardStep={0.01}
      realLabel="Re"
      imaginaryLabel="Im"
      ariaLabel="offset plane"
      resetLabel="offset reset"
      size={200}
    />,
  );
}

describe('ComplexPlanePicker', () => {
  it('maps pointer coordinates to a snapped complex value', () => {
    const onChange = vi.fn();
    renderPicker([0, 0], onChange);
    const picker = screen.getByRole('group', { name: 'offset plane' }).querySelector('svg');
    expect(picker).not.toBeNull();
    if (!picker) return;
    vi.spyOn(picker, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 200,
      bottom: 200,
      left: 0,
      width: 200,
      height: 200,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(picker, { clientX: 180, clientY: 100, pointerId: 1 });

    expect(onChange).toHaveBeenCalledWith([1.6, 0]);
  });

  it('supports keyboard adjustment and reset without emitting no-op changes', () => {
    const onChange = vi.fn();
    const { rerender } = renderPicker([0, -0.3], onChange);
    const picker = screen.getByRole('group', { name: 'offset plane' });

    fireEvent.keyDown(picker, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenCalledWith([0, -0.31]);

    rerender(
      <ComplexPlanePicker
        value={[1.6, 0]}
        onChange={onChange}
        realAxis={AXIS}
        imaginaryAxis={AXIS}
        pointerStep={0.01}
        keyboardStep={0.01}
        realLabel="Re"
        imaginaryLabel="Im"
        ariaLabel="offset plane"
        resetLabel="offset reset"
        size={200}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'offset reset' }));
    expect(onChange).toHaveBeenLastCalledWith([0, 0]);

    onChange.mockClear();
    rerender(
      <ComplexPlanePicker
        value={[0, 0]}
        onChange={onChange}
        realAxis={AXIS}
        imaginaryAxis={AXIS}
        pointerStep={0.01}
        keyboardStep={0.01}
        realLabel="Re"
        imaginaryLabel="Im"
        ariaLabel="offset plane"
        resetLabel="offset reset"
        size={200}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'offset reset' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('displays an exact external value without mutating it into the picker range', () => {
    const onChange = vi.fn();
    renderPicker([2.3456789, -3.25], onChange);

    expect(screen.getByText('Re: 2.346')).toBeInTheDocument();
    expect(screen.getByText('Im: -3.250')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
