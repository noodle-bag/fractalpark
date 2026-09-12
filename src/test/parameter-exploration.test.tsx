import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ParameterExplorationControl, ParameterRangeControl } from '@/components/fractal/ParameterExplorationControl';
import { explorationWindow, fromPolar } from '@/lib/parameter-exploration';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

describe('parameter exploration', () => {
  it('keeps the saved imaginary component when adjusting a real projection', () => {
    const onChange = vi.fn();
    render(<ParameterExplorationControl kind="real" label="limit" value={[3, 7.123456789]}
      onChange={onChange} initiallyOpen />);
    fireEvent.change(screen.getByRole('slider', { name: 'limit complexReal' }), { target: { value: '4' } });
    expect(onChange).toHaveBeenCalledWith([4, 7.123456789]);
  });

  it('retains an angle chosen at zero without emitting a false parameter change', () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState<[number, number]>([0, 0]);
      return <ParameterExplorationControl kind="polar" label="rate" value={value} initiallyOpen
        onChange={(next) => { onChange(next); setValue(next); }} />;
    }
    render(<Harness />);
    fireEvent.change(screen.getByRole('slider', { name: 'rate angle' }), { target: { value: '90' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('slider', { name: 'rate magnitude' }), { target: { value: '1' } });
    expect(onChange.mock.calls[0][0][0]).toBeCloseTo(0, 10);
    expect(onChange.mock.calls[0][0][1]).toBeCloseTo(1, 10);
  });

  it('changes the exploration window without altering values and recenters restored values', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ParameterExplorationControl kind="plane" label="offset"
      value={[1, 0]} onChange={onChange} initiallyOpen />);
    fireEvent.click(screen.getByRole('button', { name: 'widen' }));
    expect(onChange).not.toHaveBeenCalled();
    rerender(<ParameterExplorationControl kind="plane" label="offset"
      value={[123.456789, -44]} onChange={onChange} initiallyOpen />);
    fireEvent.click(screen.getByRole('button', { name: 'showCurrent' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('group', { name: 'offset complexPlane' }), { key: 'ArrowRight' });
    expect(onChange.mock.calls[0][0][0]).toBeGreaterThan(123.456789);
    expect(onChange.mock.calls[0][0][1]).toBe(-44);
    fireEvent.click(screen.getByRole('button', { name: 'offset resetComplex' }));
    expect(onChange).toHaveBeenLastCalledWith([0, 0]);
  });

  it('uses integer pointer and keyboard steps for trigger iterations', () => {
    const onChange = vi.fn();
    render(<ParameterRangeControl value={3} label="trigger" integer onChange={onChange} />);
    const slider = screen.getByRole('slider', { name: 'trigger' });
    fireEvent.change(slider, { target: { value: '4.7' } });
    expect(onChange).toHaveBeenLastCalledWith(5);
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(4);
  });

  it('exposes an out-of-window scalar without silently clamping it', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ParameterRangeControl value={0} label="value" onChange={onChange} />);
    rerender(<ParameterRangeControl value={100.123456789} label="value" onChange={onChange} />);
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'showCurrent' }));
    expect(screen.getByRole('slider')).toHaveValue('100.123456789');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejects unusable windows and preserves finite polar conversion', () => {
    expect(explorationWindow(Infinity)).toBeNull();
    expect(explorationWindow(0, 0)).toBeNull();
    expect(explorationWindow(Number.MAX_VALUE)).toBeNull();
    expect(fromPolar(-1, 0)).toBeNull();
    expect(fromPolar(1, Infinity)).toBeNull();
    expect(fromPolar(0, 90)).toEqual([0, 0]);
  });
});
