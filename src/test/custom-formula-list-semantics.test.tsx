/**
 * CustomFormulaList semantics badge and Upgrade & Compare behavior tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CustomFormulaList } from '@/components/fractal/CustomFormulaList';
import type {
  CloudCustomFormulaDetail,
  CloudCustomFormulaSummary,
} from '@/lib/cloud/client';

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

vi.mock('@/components/fractal/AnimatedFractalCanvas', () => ({
  default: () => <div data-testid="mock-semantics-preview" />,
}));

const changeSemanticsMock = vi.fn(async () => ({
  success: true as const,
  code: 'ok' as const,
  formulaId: 'f-dialog',
}));
const inspectDetailMock = vi.fn<
  (formulaId: string) => Promise<CloudCustomFormulaDetail | null>
>();

let formulasFixture: CloudCustomFormulaSummary[] = [];

vi.mock('@/hooks/useCloudFormulaLibrary', () => ({
  useCloudFormulaLibrary: () => ({
    formulas: formulasFixture,
    isLoading: false,
    refresh: vi.fn(),
    ensureRegistered: vi.fn(),
    getDetail: vi.fn(),
    inspectDetail: inspectDetailMock,
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
    readSessionFormulaAssets: vi.fn(() => []),
  };
});

vi.mock('@/components/fractal/FormulaEditor', () => ({
  FormulaEditor: () => null,
}));

const COMPATIBLE_SOURCE = `CompareCompatible {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  4 < |z|
}`;

const LEGACY_ONLY_SOURCE = `CompareLegacyOnly {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  tanh(|z|) < p1
}`;

function summary(
  version: 1 | 2 | undefined,
  id: string,
): CloudCustomFormulaSummary {
  return {
    id,
    name: `Formula ${id}`,
    revision: 1,
    sourceBytes: 40,
    hasExperienceHint: false,
    frmSemanticsVersion: version,
    createdAt: '2026-08-03T00:00:00Z',
    updatedAt: '2026-08-03T00:00:00Z',
  };
}

function detail(
  formula: CloudCustomFormulaSummary,
  source = COMPATIBLE_SOURCE,
): CloudCustomFormulaDetail {
  return {
    ...formula,
    source,
    experienceHint: null,
  };
}

const bounds = { centerX: -0.5, centerY: 0, zoom: 0.4, rotation: 0 };

beforeEach(() => {
  formulasFixture = [];
  changeSemanticsMock.mockClear();
  inspectDetailMock.mockReset();
});

describe('CustomFormulaList semantics UI (Upgrade & Compare)', () => {
  it('marks only the matching cloud runtime identity as Active', () => {
    const activeId = '88888888-8888-4888-8888-888888888888';
    const otherId = '99999999-9999-4999-8999-999999999999';
    formulasFixture = [summary(2, activeId), summary(2, otherId)];

    render(
      <CustomFormulaList
        currentBounds={bounds}
        currentFormula={`custom-${activeId}`}
      />,
    );

    expect(screen.getByTestId(`active-formula-${activeId}`)).toHaveTextContent(
      'formula.active',
    );
    expect(screen.queryByTestId(`active-formula-${otherId}`)).toBeNull();
  });

  it('shows strict/revert and legacy/upgrade states without fetching source', () => {
    formulasFixture = [summary(2, 'f-v2'), summary(1, 'f-v1')];
    render(<CustomFormulaList currentBounds={bounds} />);

    expect(screen.getByText('badgeV2')).toBeTruthy();
    expect(screen.getByText('revertButton')).toBeTruthy();
    expect(screen.getByText('badgeV1')).toBeTruthy();
    expect(screen.getByText('upgradeButton')).toBeTruthy();
    expect(inspectDetailMock).not.toHaveBeenCalled();
  });

  it('keeps formula identity above a wrapping, right-aligned action row', () => {
    formulasFixture = [summary(2, 'f-layout')];
    render(<CustomFormulaList currentBounds={bounds} />);

    const row = screen.getByTestId('custom-formula-row-f-layout');
    expect(row.className).not.toContain('justify-between');

    const name = screen.getByRole('button', { name: 'Formula f-layout' });
    expect(name.className).toContain('break-words');
    expect(name.className).not.toContain('truncate');

    const actions = screen.getByTestId('custom-formula-actions-f-layout');
    expect(actions.className).toContain('w-full');
    expect(actions.className).toContain('flex-wrap');
    expect(actions.className).toContain('justify-end');
    expect(actions.className).toContain('mt-2');
  });

  it('treats a missing version as legacy v1', () => {
    formulasFixture = [summary(undefined, 'f-missing')];
    render(<CustomFormulaList currentBounds={bounds} />);
    expect(screen.getByText('badgeV1')).toBeTruthy();
    expect(screen.getByText('upgradeButton')).toBeTruthy();
  });

  it('loads exact source read-only, renders both results, and writes only after final confirmation', async () => {
    const formula = summary(1, 'f-dialog');
    formulasFixture = [formula];
    inspectDetailMock.mockResolvedValue(detail(formula));
    render(<CustomFormulaList currentBounds={bounds} />);

    fireEvent.click(screen.getByText('upgradeButton'));
    expect(screen.getByTestId('semantics-comparison-loading')).toBeTruthy();
    expect(changeSemanticsMock).not.toHaveBeenCalled();

    await screen.findByTestId('frm-semantics-comparison');
    expect(inspectDetailMock).toHaveBeenCalledWith('f-dialog');
    expect(screen.getByTestId('semantics-comparison-v1')).toBeTruthy();
    expect(screen.getByTestId('semantics-comparison-v2')).toBeTruthy();
    expect(changeSemanticsMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('confirmUpgrade'));
    await waitFor(() =>
      expect(changeSemanticsMock).toHaveBeenCalledWith(
        'f-dialog',
        'upgradeSemantics',
      ),
    );
  });

  it('keeps confirmation disabled when strict v2 rejects the stored source', async () => {
    const formula = summary(1, 'f-blocked');
    formulasFixture = [formula];
    inspectDetailMock.mockResolvedValue(detail(formula, LEGACY_ONLY_SOURCE));
    render(<CustomFormulaList currentBounds={bounds} />);

    fireEvent.click(screen.getByText('upgradeButton'));
    await screen.findByText('upgradeBlocked');

    const confirm = screen.getByText('confirmUpgrade').closest('button');
    expect(confirm).toBeDisabled();
    expect(changeSemanticsMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('semantics-comparison-v1')).toBeTruthy();
    expect(screen.getByTestId('semantics-comparison-v2')).toBeTruthy();
  });

  it('invalidates a late source response after cancellation', async () => {
    const formula = summary(1, 'f-cancel');
    formulasFixture = [formula];
    let resolveDetail!: (value: CloudCustomFormulaDetail | null) => void;
    inspectDetailMock.mockReturnValue(
      new Promise((resolve) => {
        resolveDetail = resolve;
      }),
    );
    render(<CustomFormulaList currentBounds={bounds} />);

    fireEvent.click(screen.getByText('upgradeButton'));
    fireEvent.click(screen.getByText('cancel'));
    resolveDetail(detail(formula));

    await waitFor(() =>
      expect(screen.queryByText('upgradeTitle')).not.toBeInTheDocument(),
    );
    expect(changeSemanticsMock).not.toHaveBeenCalled();
  });
});
