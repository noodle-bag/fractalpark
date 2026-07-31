import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FrmCodeBlock } from '@/components/content/FrmCodeBlock';
import { MathBlock } from '@/components/content/MathBlock';
import { highlightFrmSource } from '@/lib/frm-highlight';
import { renderMathToHtml } from '@/lib/math';

const FRM_SOURCE = `SafeExample {
init:
  z = pixel ; keep <script> & text inert
loop:
  z = sqr(z) + (0.25, -0.10)
bailout:
  |z| < 16
}`;

const COPY_LABELS = {
  copy: 'Copy code',
  copied: 'Copied',
  error: 'Copy failed',
};

describe('shared math and FRM content primitives', () => {
  it('renders trusted TeX as server HTML and MathML', () => {
    const markup = renderMathToHtml('z_{n+1}=z_n^2+c');

    expect(markup).toContain('katex-html');
    expect(markup).toContain('katex-mathml');
    expect(markup).toContain('<math');
  });

  it('rejects invalid TeX and missing plain-text fallback', () => {
    expect(() => renderMathToHtml('\\notARealCommand{')).toThrow();
    expect(() =>
      render(<MathBlock tex="z^2+c" plainText=" " />)
    ).toThrow('Math plain-text fallback must be non-empty');
  });

  it('includes accessible plain text in MathBlock server output', () => {
    const markup = renderToStaticMarkup(
      <MathBlock
        tex="z_{n+1}=z_n^2+c"
        plainText="z(n+1) = z(n)^2 + c"
      />
    );

    expect(markup).toContain('role="math"');
    expect(markup).toContain('z(n+1) = z(n)^2 + c');
    expect(markup).toContain('katex-mathml');
  });

  it('uses the shared FRM language tokens without changing source text', () => {
    const segments = highlightFrmSource(FRM_SOURCE);

    expect(segments.map((segment) => segment.text).join('')).toBe(FRM_SOURCE);
    expect(segments.some((segment) => segment.className === 'tok-keyword')).toBe(
      true
    );
    expect(segments.some((segment) => segment.className === 'tok-comment')).toBe(
      true
    );
    expect(segments.some((segment) => segment.className === 'tok-number')).toBe(
      true
    );
  });

  it('renders escaped, source-faithful SSR code with plain-text fallback', () => {
    const { container, rerender } = render(
      <FrmCodeBlock source={FRM_SOURCE} label="FRM" />
    );
    const code = container.querySelector('pre code');
    const pre = container.querySelector('pre');

    expect(code?.textContent).toBe(FRM_SOURCE);
    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(pre).toHaveAttribute('data-highlighted', 'true');

    rerender(
      <FrmCodeBlock source={FRM_SOURCE} highlight={false} label="FRM" />
    );

    expect(container.querySelector('pre code')?.textContent).toBe(FRM_SOURCE);
    expect(container.querySelector('pre')).toHaveAttribute(
      'data-highlighted',
      'false'
    );
  });

  it('keeps copy as an optional client enhancement', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const { rerender } = render(<FrmCodeBlock source={FRM_SOURCE} />);
    expect(
      screen.queryByRole('button', { name: COPY_LABELS.copy })
    ).not.toBeInTheDocument();

    rerender(
      <FrmCodeBlock source={FRM_SOURCE} copyLabels={COPY_LABELS} />
    );
    fireEvent.click(screen.getByRole('button', { name: COPY_LABELS.copy }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(FRM_SOURCE);
      expect(screen.getByText(COPY_LABELS.copied)).toBeInTheDocument();
    });
  });
});
