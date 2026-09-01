// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CANONICAL_SOURCE_PREVIEW_LINES,
  CanonicalSourceWorkspace,
} from '@/components/formulas/CanonicalSourceWorkspace';
import type {
  PublishedFormulaSourceLoadResultV1,
  PublishedFormulaSourceReferenceV1,
} from '@/lib/published-formula-source';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values?.name === undefined ? key : `${key}:${String(values.name)}`,
}));

vi.mock('@/components/formulas/CanonicalSourceEditor', () => ({
  CanonicalSourceEditor: ({ label, source }: { label: string; source: string }) => (
    <pre aria-label={label} aria-readonly="true" data-testid="mock-source-editor">
      {source}
    </pre>
  ),
}));

const REFERENCE: PublishedFormulaSourceReferenceV1 = {
  formulaId: '00000000-0000-5000-8000-000000000001',
  sourceRevision: 'a'.repeat(64),
  semanticHash: 'b'.repeat(64),
  href: `/formula-library/v1/runtime/published/definitions/${'a'.repeat(64)}.frm`,
};
const SOURCE = Array.from({ length: 10 }, (_, index) => `line ${index + 1}`).join('\n');

function success(
  reference: PublishedFormulaSourceReferenceV1,
  source = SOURCE,
): PublishedFormulaSourceLoadResultV1 {
  return {
    ok: true,
    value: {
      ...reference,
      source,
      byteLength: new TextEncoder().encode(source).byteLength,
      lineCount: source.split('\n').length,
    },
  };
}

afterEach(cleanup);

describe('CanonicalSourceWorkspace', () => {
  it('shows a seven-line Explore preview and opens a responsive read-only workspace', async () => {
    const loadSource = vi.fn(async () => success(REFERENCE));
    render(
      <CanonicalSourceWorkspace
        displayName="Test Formula"
        loadSource={loadSource}
        reference={REFERENCE}
        remixHref="/en/explore?open=standard-formula&formula=test&intent=remix"
        variant="explore"
      />,
    );

    const preview = await screen.findByTestId('canonical-source-preview');
    expect(preview).toHaveAttribute(
      'data-preview-lines',
      String(CANONICAL_SOURCE_PREVIEW_LINES),
    );
    expect(preview.textContent?.split('\n')).toEqual(
      Array.from({ length: 7 }, (_, index) => `line ${index + 1}`),
    );
    expect(preview).not.toHaveTextContent('line 8');

    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    const drawer = await screen.findByTestId('canonical-source-drawer');
    expect(drawer).toHaveClass('w-screen', 'sm:max-w-5xl');
    expect(screen.getByTestId('mock-source-editor')).toHaveAttribute(
      'aria-readonly',
      'true',
    );
    expect(screen.getByTestId('mock-source-editor')).toHaveTextContent('line 10');
    expect(screen.getByRole('link', { name: 'remix' })).toHaveAttribute(
      'href',
      '/en/explore?open=standard-formula&formula=test&intent=remix',
    );
    const download = screen.getByRole('link', { name: 'download' });
    expect(download).toHaveAttribute('download', `${REFERENCE.formulaId}.frm`);
    const downloadHref = download.getAttribute('href');
    expect(downloadHref).toMatch(/^data:text\/plain;charset=utf-8,/);
    expect(decodeURIComponent(downloadHref?.split(',', 2)[1] ?? '')).toBe(SOURCE);
    expect(download).not.toHaveAttribute('href', REFERENCE.href);
    expect(loadSource).toHaveBeenCalledTimes(1);
  });

  it('renders the complete verified source inline on a Formula Record', async () => {
    render(
      <CanonicalSourceWorkspace
        displayName="Record Formula"
        loadSource={vi.fn(async () => success(REFERENCE))}
        reference={REFERENCE}
        remixHref="/en/explore?intent=remix"
        variant="record"
      />,
    );

    expect(await screen.findByTestId('mock-source-editor')).toHaveTextContent('line 10');
    expect(screen.queryByRole('button', { name: 'open' })).not.toBeInTheDocument();
    expect(screen.getByTestId('canonical-source-workspace')).toHaveAttribute(
      'data-source-variant',
      'record',
    );
  });

  it('ignores a stale source response when the current formula changes', async () => {
    let resolveFirst!: (value: PublishedFormulaSourceLoadResultV1) => void;
    let resolveSecond!: (value: PublishedFormulaSourceLoadResultV1) => void;
    const secondReference: PublishedFormulaSourceReferenceV1 = {
      ...REFERENCE,
      formulaId: '00000000-0000-5000-8000-000000000002',
      sourceRevision: 'c'.repeat(64),
      semanticHash: 'd'.repeat(64),
      href: `/formula-library/v1/runtime/published/definitions/${'c'.repeat(64)}.frm`,
    };
    const loadSource = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<PublishedFormulaSourceLoadResultV1>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<PublishedFormulaSourceLoadResultV1>((resolve) => {
            resolveSecond = resolve;
          }),
      );

    const { rerender } = render(
      <CanonicalSourceWorkspace
        displayName="First"
        loadSource={loadSource}
        reference={REFERENCE}
        remixHref="/first?intent=remix"
        variant="explore"
      />,
    );
    rerender(
      <CanonicalSourceWorkspace
        displayName="Second"
        loadSource={loadSource}
        reference={secondReference}
        remixHref="/second?intent=remix"
        variant="explore"
      />,
    );

    resolveFirst(success(REFERENCE, 'stale source'));
    resolveSecond(success(secondReference, 'current source'));
    await waitFor(() =>
      expect(screen.getByTestId('canonical-source-preview')).toHaveTextContent(
        'current source',
      ),
    );
    expect(screen.queryByText('stale source')).not.toBeInTheDocument();
  });
});
