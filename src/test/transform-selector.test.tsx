import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { TransformSelector } from '@/components/fractal/TransformSelector';
import messages from '../../messages/en.json';

vi.mock('@/engine/plugins/registry', () => ({
  pluginRegistry: { listTransforms: () => ['none', 'inversion', 'kaleidoscope'].map(id => ({ id })) },
}));

describe('TransformSelector presentation', () => {
  it('keeps complete labels, selection and the original transform callback', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <TransformSelector currentTransform="inversion" onTransformChange={onChange} />
      </NextIntlClientProvider>,
    );
    const selected = screen.getByRole('button', { name: 'Inversion' });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(selected).toHaveClass('min-h-11');
    const label = screen.getByText('Kaleidoscope');
    expect(label).toHaveClass('text-control', 'whitespace-normal');
    expect(label.className).not.toContain('line-clamp');
    fireEvent.click(screen.getByRole('button', { name: 'Kaleidoscope' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('kaleidoscope');
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <TransformSelector currentTransform="kaleidoscope" onTransformChange={onChange} />
      </NextIntlClientProvider>,
    );
    expect(selected).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Kaleidoscope' })).toHaveAttribute('aria-pressed', 'true');
  });
});
