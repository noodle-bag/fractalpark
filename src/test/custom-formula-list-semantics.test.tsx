/**
 * CustomFormulaList semantics badge and Upgrade & Compare UI tests
 * (v0.4.18 slice 2, commit 6).
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CustomFormulaList } from '@/components/fractal/CustomFormulaList';
import type { CloudCustomFormulaSummary } from '@/lib/cloud/client';

vi.mock('next-intl', () => ({
  useTranslations: () => ((key: string) => key),
  useLocale: () => 'en',
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/components/cloud/CloudSessionProvider', () => ({
  useCloudSession: () => ({
    state: { status: 'authenticated', user: { id: 'user-1' } },
    openSignIn: vi.fn(),
  }),
}));

const changeSemanticsMock = vi.fn(async () => ({ ok: true as const }));

let formulasFixture: CloudCustomFormulaSummary[] = [];

vi.mock('@/hooks/useCloudFormulaLibrary', () => ({
  useCloudFormulaLibrary: () => ({
    formulas: formulasFixture,
    isLoading: false,
    error: '',
    refresh: vi.fn(),
    saveFormula: vi.fn(),
    deleteFormula: vi.fn(),
    renameFormula: vi.fn(),
    changeSemantics: changeSemanticsMock,
  }),
}));

vi.mock('@/lib/formula-resolver', async () => {
  const actual = await vi.importActual<typeof import('@/lib/formula-resolver')>(
    '@/lib/formula-resolver',
  );
  return {
    ...actual,
    resolveFormulaReference: vi.fn(),
    readSessionFormulaAssets: vi.fn(() => ({})),
  };
});

vi.mock('@/components/fractal/FormulaEditor', () => ({
  FormulaEditor: () => null,
}));

vi.mock('@/components/ui/alert-dialog', async () => {
  const actual = await vi.importActual<typeof import('@/components/ui/alert-dialog')>(
    '@/components/ui/alert-dialog',
  );
  // Keep the real components; jsdom portals render in place under RTL.
  return actual;
});

function summary(version: 1 | 2 | undefined, id: string): CloudCustomFormulaSummary {
  return {
    id,
    name: `Formula ${id}`,
    revision: 1,
    sourceBytes: 40,
    hasExperienceHint: false,
    frmSemanticsVersion: version,
    createdAt: '2026-08-03T00:00:00Z',
    updatedAt: '2026-08-03T00:00:00Z',
  } as CloudCustomFormulaSummary;
}

const bounds = { centerX: -0.5, centerY: 0, zoom: 0.4, rotation: 0 };

describe('CustomFormulaList semantics UI (Upgrade & Compare)', () => {
  it('shows the strict badge and revert action for a v2 formula', () => {
    formulasFixture = [summary(2, 'f-v2')];
    render(<CustomFormulaList currentBounds={bounds} />);
    expect(screen.getByText('badgeV2')).toBeTruthy();
    expect(screen.getByText('revertButton')).toBeTruthy();
    expect(screen.queryByText('upgradeButton')).toBeNull();
  });

  it('shows the legacy badge and upgrade action for a v1 formula', () => {
    formulasFixture = [summary(1, 'f-v1')];
    render(<CustomFormulaList currentBounds={bounds} />);
    expect(screen.getByText('badgeV1')).toBeTruthy();
    expect(screen.getByText('upgradeButton')).toBeTruthy();
    expect(screen.queryByText('revertButton')).toBeNull();
  });

  it('treats a missing version as legacy v1', () => {
    formulasFixture = [summary(undefined, 'f-missing')];
    render(<CustomFormulaList currentBounds={bounds} />);
    expect(screen.getByText('badgeV1')).toBeTruthy();
    expect(screen.getByText('upgradeButton')).toBeTruthy();
  });

  it('opens the confirmation dialog from the upgrade action', () => {
    formulasFixture = [summary(1, 'f-dialog')];
    render(<CustomFormulaList currentBounds={bounds} />);
    fireEvent.click(screen.getByText('upgradeButton'));
    expect(screen.getByText('upgradeTitle')).toBeTruthy();
    expect(screen.getByText('confirmUpgrade')).toBeTruthy();
    expect(screen.getByText('cancel')).toBeTruthy();
  });
});
