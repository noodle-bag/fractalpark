// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FormulaExperienceHint } from '@/engine/frm/authoring';
import { CloudClientError } from '@/lib/cloud/client';

const cloudMocks = vi.hoisted(() => ({
  changeCustomFormulaSemantics: vi.fn(),
  createCustomFormula: vi.fn(),
  deleteCustomFormula: vi.fn(),
  getCustomFormula: vi.fn(),
  listCustomFormulas: vi.fn(),
  updateCustomFormula: vi.fn(),
}));

vi.mock('@/components/cloud/CloudSessionProvider', () => ({
  useCloudSession: () => ({
    state: { status: 'authenticated', userId: 'owner-1' },
    openSignIn: vi.fn(),
  }),
}));

vi.mock('@/lib/cloud/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cloud/client')>();
  return {
    ...actual,
    ...cloudMocks,
  };
});

import { useCloudFormulaLibrary } from '@/hooks/useCloudFormulaLibrary';
import { readSessionFormulaAssets } from '@/lib/formula-resolver';

const NEW_SOURCE = `HookNew {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

const LEGACY_SOURCE = `HookLegacy {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

const HINT: FormulaExperienceHint = {
  bounds: { centerX: -0.75, centerY: 0.1, zoom: 80, rotation: 0 },
  coloring: {
    outsideColoringId: 'smooth',
    insideColoringId: 'solid',
    paletteIndex: 3,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCloudFormulaLibrary session registration', () => {
  it('registers a newly saved formula as strict v2 with its experience hint even if refresh fails', async () => {
    cloudMocks.listCustomFormulas
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('refresh unavailable'));
    cloudMocks.createCustomFormula.mockResolvedValueOnce({
      formulaId: 'hook-new-v2',
      revision: 1,
    });

    const { result } = renderHook(() => useCloudFormulaLibrary());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      const saved = await result.current.saveFormula({
        name: 'Hook new',
        source: NEW_SOURCE,
        experienceHint: HINT,
      });
      expect(saved).toMatchObject({
        success: true,
        code: 'ok',
        formulaId: 'hook-new-v2',
      });
    });

    expect(
      readSessionFormulaAssets().find((asset) => asset.id === 'hook-new-v2'),
    ).toEqual({
      id: 'hook-new-v2',
      source: NEW_SOURCE,
      experienceHint: HINT,
      frmSemanticsVersion: 2,
    });
  });

  it('keeps a legacy formula on v1 and registers the saved experience hint even if refresh fails', async () => {
    cloudMocks.listCustomFormulas
      .mockResolvedValueOnce([
        {
          id: 'hook-legacy-v1',
          name: 'Hook legacy',
          revision: 3,
          sourceBytes: LEGACY_SOURCE.length,
          hasExperienceHint: false,
          frmSemanticsVersion: 1,
          createdAt: '2026-08-12T00:00:00.000Z',
          updatedAt: '2026-08-12T00:00:00.000Z',
        },
      ])
      .mockRejectedValueOnce(new Error('refresh unavailable'));
    cloudMocks.updateCustomFormula.mockResolvedValueOnce({
      formulaId: 'hook-legacy-v1',
      revision: 4,
    });

    const { result } = renderHook(() => useCloudFormulaLibrary());
    await waitFor(() => expect(result.current.formulas).toHaveLength(1));

    await act(async () => {
      const saved = await result.current.saveFormula({
        name: 'Hook legacy edited',
        source: LEGACY_SOURCE,
        experienceHint: HINT,
        formulaId: 'hook-legacy-v1',
      });
      expect(saved).toMatchObject({
        success: true,
        code: 'ok',
        formulaId: 'hook-legacy-v1',
      });
    });

    expect(cloudMocks.updateCustomFormula).toHaveBeenCalledWith(
      'hook-legacy-v1',
      expect.objectContaining({
        expectedRevision: 3,
        experienceHint: HINT,
      }),
    );
    expect(
      readSessionFormulaAssets().find(
        (asset) => asset.id === 'hook-legacy-v1',
      ),
    ).toEqual({
      id: 'hook-legacy-v1',
      source: LEGACY_SOURCE,
      experienceHint: HINT,
      frmSemanticsVersion: 1,
    });
  });

  it('never registers stale bytes as v2 when a semantics write conflicts', async () => {
    cloudMocks.listCustomFormulas.mockResolvedValueOnce([
      {
        id: 'hook-race-v1',
        name: 'Hook race',
        revision: 1,
        sourceBytes: LEGACY_SOURCE.length,
        hasExperienceHint: false,
        frmSemanticsVersion: 1,
        createdAt: '2026-08-12T00:00:00.000Z',
        updatedAt: '2026-08-12T00:00:00.000Z',
      },
    ]);
    cloudMocks.getCustomFormula.mockResolvedValueOnce({
      id: 'hook-race-v1',
      name: 'Hook race',
      revision: 1,
      sourceBytes: LEGACY_SOURCE.length,
      hasExperienceHint: false,
      frmSemanticsVersion: 1,
      createdAt: '2026-08-12T00:00:00.000Z',
      updatedAt: '2026-08-12T00:00:00.000Z',
      source: LEGACY_SOURCE,
      experienceHint: null,
    });
    cloudMocks.changeCustomFormulaSemantics.mockRejectedValueOnce(
      new CloudClientError('revision_conflict'),
    );

    const { result } = renderHook(() => useCloudFormulaLibrary());
    await waitFor(() => expect(result.current.formulas).toHaveLength(1));

    await act(async () => {
      const changed = await result.current.changeSemantics(
        'hook-race-v1',
        'upgradeSemantics',
      );
      expect(changed).toMatchObject({ success: false, code: 'conflict' });
    });

    expect(
      readSessionFormulaAssets().find((asset) => asset.id === 'hook-race-v1'),
    ).toBeUndefined();
  });
});
