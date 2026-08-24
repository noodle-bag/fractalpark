// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FormulaRecordPanel } from '@/components/formulas/FormulaRecordPanel';
import {
  FORMULA_ROUTE_RECORD_REVISION_V1,
  buildFormulaRouteRecordV1,
} from '@/lib/formula-routes';
import type { FormulaIdV1 } from '@/engine/formulas/v1/types';

vi.mock('next-intl/server', () => ({
  getTranslations: async () =>
    (key: string) => key,
}));

vi.mock('next/image', () => ({
  default: (
    input: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean },
  ) => {
    const { alt = '', unoptimized, ...props } = input;
    void unoptimized;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img alt={alt} {...props} />
    );
  },
}));

vi.mock('@/components/formulas/CanonicalSourceWorkspace', () => ({
  CanonicalSourceWorkspace: ({ remixHref }: { remixHref: string }) => (
    <div data-testid="canonical-source-workspace">
      <a href={remixHref}>remix</a>
      <button type="button">download</button>
    </div>
  ),
}));

const PUBLISHED_FORMULA_ID = '00e14aa8-b766-54ea-a359-3f5d20d329b7';
const HELD_FORMULA_ID = '00cb5763-13e1-5c93-a283-d99905acccee';

async function record(formulaId: string) {
  const route = await buildFormulaRouteRecordV1(
    formulaId as FormulaIdV1,
    FORMULA_ROUTE_RECORD_REVISION_V1,
    'en',
  );
  if (!route) throw new Error(`Missing Formula Record fixture: ${formulaId}`);
  return route.formulaRecord;
}

describe('streamlined Formula Record panel', () => {
  it('keeps one canonical source module and hides published governance fields', async () => {
    const published = await record(PUBLISHED_FORMULA_ID);
    render(await FormulaRecordPanel({ locale: 'en', record: published }));

    expect(screen.getByTestId('canonical-source-workspace')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'remix' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'openExplore' })).toBeInTheDocument();
    expect(screen.getByTestId('formula-record-rights-attribution')).toHaveTextContent(
      'rightsAttribution',
    );
    expect(screen.getByText('formulaId')).toBeInTheDocument();

    for (const hidden of [
      'sourceRevision',
      'semanticHash',
      'decision',
      'reason',
      'reviewed',
      'leakage',
    ]) {
      expect(screen.queryByText(hidden)).not.toBeInTheDocument();
    }
  });

  it('renders a known held UUID as the minimal N1 page', async () => {
    const held = await record(HELD_FORMULA_ID);
    render(await FormulaRecordPanel({ locale: 'en', record: held }));

    expect(screen.getByTestId('formula-record')).toHaveAttribute(
      'data-formula-record-availability',
      'hold',
    );
    expect(screen.getByText(HELD_FORMULA_ID)).toBeInTheDocument();
    expect(screen.getByText('unavailableSummary')).toBeInTheDocument();
    expect(screen.queryByTestId('canonical-source-workspace')).not.toBeInTheDocument();
    expect(screen.queryByTestId('formula-record-rights-attribution')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'openExplore' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'remix' })).not.toBeInTheDocument();
    expect(screen.queryByText('source')).not.toBeInTheDocument();
    expect(screen.queryByText('takedown')).not.toBeInTheDocument();
  });
});
