// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FormulaNumberDraftInput } from '@/components/fractal/FormulaNumberDraftInput';

const labels = {
  ariaLabel: 'Parameter',
  invalidMessage: 'Enter a valid finite number.',
  increaseLabel: 'Increase',
  decreaseLabel: 'Decrease',
};

describe('FormulaNumberDraftInput', () => {
  it('preserves decimal and scientific-notation drafts until an explicit commit', () => {
    const onCommit = vi.fn();
    render(<FormulaNumberDraftInput {...labels} value={1} onCommit={onCommit} />);
    const input = screen.getByRole('spinbutton', { name: 'Parameter' });

    for (const draft of ['-', '.', '0.', '1e-']) {
      fireEvent.change(input, { target: { value: draft } });
      expect(input).toHaveValue(draft);
      expect(onCommit).not.toHaveBeenCalled();
    }

    fireEvent.change(input, { target: { value: '1e-2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(0.01);
    expect(input).toHaveValue('0.01');
  });

  it('clamps valid drafts only on blur or Enter and accepts pasted decimal spellings', () => {
    const onCommit = vi.fn();
    const { rerender } = render(
      <FormulaNumberDraftInput {...labels} value={0.5} min={-1} max={1} onCommit={onCommit} />,
    );
    const input = screen.getByRole('spinbutton', { name: 'Parameter' });

    fireEvent.change(input, { target: { value: '2' } });
    expect(input).toHaveValue('2');
    expect(input).toHaveAttribute('aria-valuenow', '1');
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenLastCalledWith(1);
    expect(input).toHaveValue('1');

    rerender(
      <FormulaNumberDraftInput {...labels} value={1} min={-1} max={1} onCommit={onCommit} />,
    );
    fireEvent.change(input, { target: { value: '-0.125' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenLastCalledWith(-0.125);
    expect(input).toHaveValue('-0.125');
  });

  it('restores the last legal value and announces an invalid commit accessibly', () => {
    const onCommit = vi.fn();
    render(
      <FormulaNumberDraftInput {...labels} value={0.5} min={-1} max={1} onCommit={onCommit} />,
    );
    const input = screen.getByRole('spinbutton', { name: 'Parameter' });

    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(1);
    expect(input).toHaveValue('1');

    onCommit.mockClear();
    fireEvent.change(input, { target: { value: 'not-a-number' } });
    fireEvent.blur(input);

    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue('1');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid finite number.');
  });

  it('commits custom spinner and Arrow key changes in exact 0.1 steps', () => {
    const commits: number[] = [];

    function Harness() {
      const [value, setValue] = useState(0.2);
      return (
        <FormulaNumberDraftInput
          {...labels}
          value={value}
          onCommit={(next) => {
            commits.push(next);
            setValue(next);
          }}
        />
      );
    }

    render(<Harness />);
    const input = screen.getByRole('spinbutton', { name: 'Parameter' });
    expect(input).toHaveAttribute('step', '0.1');

    fireEvent.click(screen.getByRole('button', { name: 'Parameter Increase' }));
    expect(input).toHaveValue('0.3');
    fireEvent.click(screen.getByRole('button', { name: 'Parameter Decrease' }));
    expect(input).toHaveValue('0.2');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveValue('0.1');

    expect(commits).toEqual([0.3, 0.2, 0.1]);
  });
});
