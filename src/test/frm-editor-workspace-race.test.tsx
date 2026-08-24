import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrmEditorWorkspace } from '@/components/fractal/FrmEditorWorkspace';
import type {
  CloudCustomFormulaDetail,
  CloudCustomFormulaSummary,
} from '@/lib/cloud/client';

const mocks = vi.hoisted(() => ({
  compile: vi.fn(),
  getDetail: vi.fn(),
  replace: vi.fn(),
  restore: vi.fn(),
}));

let formulasFixture: CloudCustomFormulaSummary[] = [];

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations:
    () =>
    (key: string, values?: Record<string, unknown>) =>
      typeof values?.name === 'string' ? `${key}:${values.name}` : key,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/cloud/CloudSessionProvider', () => ({
  useCloudSession: () => ({
    state: { status: 'authenticated', user: { id: 'user-1' } },
    openSignIn: vi.fn(),
  }),
}));

vi.mock('@/hooks/useCloudFormulaLibrary', () => ({
  useCloudFormulaLibrary: () => ({
    formulas: formulasFixture,
    isLoading: false,
    saveFormula: vi.fn(),
    getDetail: mocks.getDetail,
    refresh: vi.fn(),
  }),
}));

vi.mock('@/components/fractal/FormulaEditor', () => ({
  FormulaEditor: ({
    formulaId,
    initialExperienceHint,
    initialLastSuccessfulExperienceHint,
    initialLastSuccessfulSource,
    initialSource,
    mode,
  }: {
    formulaId?: string;
    initialExperienceHint?: unknown;
    initialLastSuccessfulExperienceHint?: unknown;
    initialLastSuccessfulSource?: string | null;
    initialSource?: string;
    mode?: string;
  }) => (
    <div
      data-active-hint={JSON.stringify(initialLastSuccessfulExperienceHint)}
      data-active-source={initialLastSuccessfulSource ?? ''}
      data-formula-id={formulaId}
      data-hint={JSON.stringify(initialExperienceHint)}
      data-mode={mode}
      data-source={initialSource}
      data-testid="workspace-formula-editor"
    />
  ),
}));

vi.mock('@/components/fractal/FractalCanvas', () => ({
  default: ({ bounds, formula }: { bounds: unknown; formula: string }) => (
    <div
      data-bounds={JSON.stringify(bounds)}
      data-formula={formula}
      data-testid="workspace-fractal-canvas"
    />
  ),
}));

vi.mock('@/components/fractal/FrmCompatStatusCard', () => ({
  FrmCompatStatusCard: () => <div data-testid="compat-status" />,
}));

vi.mock('@/lib/published-formula-remix', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/published-formula-remix')
  >('@/lib/published-formula-remix');
  return {
    ...actual,
    compileMineRemixSourceV1: mocks.compile,
    restoreFrozenMineFormulaRemixV1: mocks.restore,
  };
});

const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BOUNDS_A = { centerX: -1, centerY: 0, zoom: 0.5, rotation: 0 };
const BOUNDS_B = { centerX: 0.25, centerY: -0.5, zoom: 1.5, rotation: 0.2 };

function summary(id: string, name: string): CloudCustomFormulaSummary {
  return {
    id,
    name,
    revision: 2,
    sourceBytes: 120,
    hasExperienceHint: true,
    frmSemanticsVersion: 2,
    createdAt: '2026-08-25T00:00:00Z',
    updatedAt: '2026-08-25T00:00:00Z',
  };
}

function lifecycleDetail(
  formula: CloudCustomFormulaSummary,
  suffix: 'A' | 'B',
  bounds: typeof BOUNDS_A,
): CloudCustomFormulaDetail {
  return {
    ...formula,
    source: `EDITABLE ${suffix}`,
    experienceHint: { bounds },
    lifecycle: {
      editableHeadRevisionId: `editable-${suffix}`,
      activeRunnableRevisionId: `active-${suffix}`,
      editableDefinition: { formulaId: formula.id, suffix },
      editableProfile: { formulaId: formula.id, bounds },
      remixedFromFormulaId: 'cccccccc-cccc-5ccc-8ccc-cccccccccccc',
      lineageSourceRevision: suffix.repeat(64).toLowerCase(),
      lineageProfileRevision: suffix.repeat(64).toLowerCase(),
      diagnostics: [],
      activeRunnableSource: `ACTIVE ${suffix}`,
      activeRunnableExperienceHint: { bounds },
    },
  };
}

beforeEach(() => {
  formulasFixture = [summary(ID_A, 'Formula A'), summary(ID_B, 'Formula B')];
  mocks.compile.mockReset();
  mocks.getDetail.mockReset();
  mocks.replace.mockReset();
  mocks.restore.mockReset();
  mocks.restore.mockImplementation((input: Record<string, unknown>) => ({
    formulaId: input.formulaId,
    parentFormulaId: input.remixedFromFormulaId,
    parentSourceRevision: input.lineageSourceRevision,
    parentProfileRevision: input.lineageProfileRevision,
    displayName: input.displayName,
    family: 'test',
    source: input.source,
    experienceHint: (input.profile as { bounds?: unknown })?.bounds
      ? { bounds: (input.profile as { bounds: unknown }).bounds }
      : {},
    parentProfile: input.profile,
  }));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FrmEditorWorkspace Mine detail supersession', () => {
  it('keeps B source, lineage, preview, bounds, and notice after A compile finishes late', async () => {
    let resolveA!: (value: CloudCustomFormulaDetail | null) => void;
    let resolveB!: (value: CloudCustomFormulaDetail | null) => void;
    let resolveCompileA!: (value: { success: boolean; plugin?: { id: string } }) => void;
    mocks.getDetail.mockImplementation(
      (formulaId: string) =>
        new Promise((resolve) => {
          if (formulaId === ID_A) resolveA = resolve;
          else resolveB = resolve;
        }),
    );
    mocks.compile.mockImplementation(
      ({ source }: { source: string }) =>
        source === 'ACTIVE A'
          ? new Promise((resolve) => {
              resolveCompileA = resolve;
            })
          : Promise.resolve({
              success: true,
              plugin: { id: `custom-${ID_B}` },
            }),
    );
    render(<FrmEditorWorkspace />);

    fireEvent.click(screen.getByText('Formula A').closest('button')!);
    await act(async () => resolveA(lifecycleDetail(formulasFixture[0], 'A', BOUNDS_A)));
    await waitFor(() =>
      expect(mocks.compile).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'ACTIVE A' }),
      ),
    );

    fireEvent.click(screen.getByText('Formula B').closest('button')!);
    await act(async () => resolveB(lifecycleDetail(formulasFixture[1], 'B', BOUNDS_B)));

    const editor = await screen.findByTestId('workspace-formula-editor');
    await waitFor(() => expect(editor).toHaveAttribute('data-source', 'EDITABLE B'));
    expect(editor).toHaveAttribute('data-formula-id', `custom-${ID_B}`);
    expect(editor).toHaveAttribute('data-mode', 'remix');
    expect(editor).toHaveAttribute('data-active-source', 'ACTIVE B');
    expect(editor.getAttribute('data-hint')).toBe(JSON.stringify({ bounds: BOUNDS_B }));
    expect(editor.getAttribute('data-active-hint')).toBe(
      JSON.stringify({ bounds: BOUNDS_B }),
    );
    const canvas = screen.getByTestId('workspace-fractal-canvas');
    expect(canvas).toHaveAttribute('data-formula', `custom-${ID_B}`);
    expect(canvas.getAttribute('data-bounds')).toBe(JSON.stringify(BOUNDS_B));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await act(async () => resolveCompileA({ success: false }));
    await waitFor(() =>
      expect(screen.getByTestId('workspace-formula-editor')).toHaveAttribute(
        'data-source',
        'EDITABLE B',
      ),
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('saveError')).not.toBeInTheDocument();
  });

  it('ignores an older null detail after B has become current', async () => {
    let resolveA!: (value: CloudCustomFormulaDetail | null) => void;
    let resolveB!: (value: CloudCustomFormulaDetail | null) => void;
    mocks.getDetail.mockImplementation(
      (formulaId: string) =>
        new Promise((resolve) => {
          if (formulaId === ID_A) resolveA = resolve;
          else resolveB = resolve;
        }),
    );
    mocks.compile.mockResolvedValue({
      success: true,
      plugin: { id: `custom-${ID_B}` },
    });
    render(<FrmEditorWorkspace />);

    fireEvent.click(screen.getByText('Formula A').closest('button')!);
    fireEvent.click(screen.getByText('Formula B').closest('button')!);
    await act(async () => resolveB(lifecycleDetail(formulasFixture[1], 'B', BOUNDS_B)));
    await waitFor(() =>
      expect(screen.getByTestId('workspace-formula-editor')).toHaveAttribute(
        'data-source',
        'EDITABLE B',
      ),
    );

    await act(async () => resolveA(null));
    expect(screen.getByTestId('workspace-formula-editor')).toHaveAttribute(
      'data-source',
      'EDITABLE B',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('saveError')).not.toBeInTheDocument();
  });
});
