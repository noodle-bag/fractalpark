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

const NEW_STORAGE_ID = '11111111-1111-4111-8111-111111111111';
const NEW_RUNTIME_ID = `custom-${NEW_STORAGE_ID}`;
const LEGACY_STORAGE_ID = '22222222-2222-4222-8222-222222222222';
const LEGACY_RUNTIME_ID = `custom-${LEGACY_STORAGE_ID}`;
const RACE_STORAGE_ID = '33333333-3333-4333-8333-333333333333';
const RACE_RUNTIME_ID = `custom-${RACE_STORAGE_ID}`;
const UPDATED_STORAGE_ID = '44444444-4444-4444-8444-444444444444';
const UPDATED_RUNTIME_ID = `custom-${UPDATED_STORAGE_ID}`;
const RESCUE_STORAGE_ID = '66666666-6666-4666-8666-666666666666';
const RESCUE_RUNTIME_ID = `custom-${RESCUE_STORAGE_ID}`;
const BROKEN_STORAGE_ID = '77777777-7777-4777-8777-777777777777';
const BROKEN_RUNTIME_ID = `custom-${BROKEN_STORAGE_ID}`;
const BROKEN_SOURCE = `BrokenCloud {
init:
  z = 0
loop:
  z = z^2 + nope
bailout:
  |z| < 4
}`;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCloudFormulaLibrary session registration', () => {
  it('rescues an Explore runtime ID through a bare-UUID API fetch', async () => {
    cloudMocks.listCustomFormulas.mockResolvedValueOnce([]);
    cloudMocks.getCustomFormula.mockResolvedValueOnce({
      id: RESCUE_STORAGE_ID,
      name: 'Rescued formula',
      revision: 1,
      sourceBytes: NEW_SOURCE.length,
      hasExperienceHint: true,
      frmSemanticsVersion: 2,
      createdAt: '2026-08-13T00:00:00.000Z',
      updatedAt: '2026-08-13T00:00:00.000Z',
      source: NEW_SOURCE,
      experienceHint: HINT,
    });

    const { result } = renderHook(() => useCloudFormulaLibrary());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      result.current.ensureRegistered(RESCUE_RUNTIME_ID),
    ).resolves.toBe(true);
    expect(cloudMocks.getCustomFormula).toHaveBeenCalledWith(RESCUE_STORAGE_ID);
    expect(
      readSessionFormulaAssets().find(
        (asset) => asset.id === RESCUE_RUNTIME_ID,
      ),
    ).toMatchObject({
      id: RESCUE_RUNTIME_ID,
      source: NEW_SOURCE,
      frmSemanticsVersion: 2,
    });
  });

  it('keeps an un-runnable cloud formula editable without registering it', async () => {
    cloudMocks.listCustomFormulas.mockResolvedValueOnce([]);
    cloudMocks.getCustomFormula.mockResolvedValue({
      id: BROKEN_STORAGE_ID,
      name: 'Broken but editable',
      revision: 1,
      sourceBytes: BROKEN_SOURCE.length,
      hasExperienceHint: false,
      frmSemanticsVersion: 2,
      createdAt: '2026-08-13T00:00:00.000Z',
      updatedAt: '2026-08-13T00:00:00.000Z',
      source: BROKEN_SOURCE,
      experienceHint: null,
    });

    const { result } = renderHook(() => useCloudFormulaLibrary());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      result.current.ensureRegistered(BROKEN_RUNTIME_ID),
    ).resolves.toBe(false);
    await expect(result.current.getDetail(BROKEN_RUNTIME_ID)).resolves.toMatchObject({
      id: BROKEN_STORAGE_ID,
      source: BROKEN_SOURCE,
    });
    expect(
      readSessionFormulaAssets().find(
        (asset) => asset.id === BROKEN_RUNTIME_ID,
      ),
    ).toBeUndefined();
    expect(cloudMocks.getCustomFormula).toHaveBeenNthCalledWith(
      1,
      BROKEN_STORAGE_ID,
    );
    expect(cloudMocks.getCustomFormula).toHaveBeenNthCalledWith(
      2,
      BROKEN_STORAGE_ID,
    );
  });

  it('registers a newly saved formula as strict v2 with its experience hint even if refresh fails', async () => {
    cloudMocks.listCustomFormulas
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('refresh unavailable'));
    cloudMocks.createCustomFormula.mockResolvedValueOnce({
      formulaId: NEW_STORAGE_ID,
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
        storageId: NEW_STORAGE_ID,
        runtimeId: NEW_RUNTIME_ID,
      });
    });

    expect(
      readSessionFormulaAssets().find((asset) => asset.id === NEW_RUNTIME_ID),
    ).toEqual({
      id: NEW_RUNTIME_ID,
      source: NEW_SOURCE,
      experienceHint: HINT,
      frmSemanticsVersion: 2,
    });
  });

  it('keeps a legacy formula on v1 and registers the saved experience hint even if refresh fails', async () => {
    cloudMocks.listCustomFormulas
      .mockResolvedValueOnce([
        {
          id: LEGACY_STORAGE_ID,
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
      formulaId: LEGACY_STORAGE_ID,
      revision: 4,
      frmSemanticsVersion: 1,
    });

    const { result } = renderHook(() => useCloudFormulaLibrary());
    await waitFor(() => expect(result.current.formulas).toHaveLength(1));

    await act(async () => {
      const saved = await result.current.saveFormula({
        name: 'Hook legacy edited',
        source: LEGACY_SOURCE,
        experienceHint: HINT,
        formulaId: LEGACY_RUNTIME_ID,
      });
      expect(saved).toMatchObject({
        success: true,
        code: 'ok',
        storageId: LEGACY_STORAGE_ID,
        runtimeId: LEGACY_RUNTIME_ID,
      });
    });

    expect(cloudMocks.updateCustomFormula).toHaveBeenCalledWith(
      LEGACY_STORAGE_ID,
      expect.objectContaining({
        expectedRevision: 3,
        experienceHint: HINT,
      }),
    );
    expect(
      readSessionFormulaAssets().find(
        (asset) => asset.id === LEGACY_RUNTIME_ID,
      ),
    ).toEqual({
      id: LEGACY_RUNTIME_ID,
      source: LEGACY_SOURCE,
      experienceHint: HINT,
      frmSemanticsVersion: 1,
    });
  });

  it('uses the authoritative PATCH semantics version when re-registering an edit', async () => {
    cloudMocks.listCustomFormulas
      .mockResolvedValueOnce([
        {
          id: UPDATED_STORAGE_ID,
          name: 'Updated elsewhere',
          revision: 7,
          sourceBytes: LEGACY_SOURCE.length,
          hasExperienceHint: false,
          frmSemanticsVersion: 1,
          createdAt: '2026-08-12T00:00:00.000Z',
          updatedAt: '2026-08-12T00:00:00.000Z',
        },
      ])
      .mockRejectedValueOnce(new Error('refresh unavailable'));
    cloudMocks.updateCustomFormula.mockResolvedValueOnce({
      formulaId: UPDATED_STORAGE_ID,
      revision: 8,
      frmSemanticsVersion: 2,
    });

    const { result } = renderHook(() => useCloudFormulaLibrary());
    await waitFor(() => expect(result.current.formulas).toHaveLength(1));

    await act(async () => {
      await expect(
        result.current.saveFormula({
          name: 'Edited after upgrade',
          source: NEW_SOURCE,
          formulaId: UPDATED_RUNTIME_ID,
        }),
      ).resolves.toMatchObject({ success: true, code: 'ok' });
    });

    expect(
      readSessionFormulaAssets().find(
        (asset) => asset.id === UPDATED_RUNTIME_ID,
      ),
    ).toMatchObject({
      source: NEW_SOURCE,
      frmSemanticsVersion: 2,
    });
  });

  it('sends Rename as a partial PATCH and accepts the authoritative version', async () => {
    const initial = {
      id: UPDATED_STORAGE_ID,
      name: 'Before rename',
      revision: 9,
      sourceBytes: NEW_SOURCE.length,
      hasExperienceHint: false,
      frmSemanticsVersion: 2 as const,
      createdAt: '2026-08-12T00:00:00.000Z',
      updatedAt: '2026-08-12T00:00:00.000Z',
    };
    cloudMocks.listCustomFormulas
      .mockResolvedValueOnce([initial])
      .mockResolvedValueOnce([{ ...initial, name: 'After rename', revision: 10 }]);
    cloudMocks.updateCustomFormula.mockResolvedValueOnce({
      formulaId: UPDATED_STORAGE_ID,
      revision: 10,
      frmSemanticsVersion: 2,
    });

    const { result } = renderHook(() => useCloudFormulaLibrary());
    await waitFor(() => expect(result.current.formulas).toHaveLength(1));

    await act(async () => {
      await expect(
        result.current.renameFormula(UPDATED_RUNTIME_ID, 'After rename'),
      ).resolves.toMatchObject({ success: true, code: 'ok' });
    });
    expect(cloudMocks.updateCustomFormula).toHaveBeenCalledWith(
      UPDATED_STORAGE_ID,
      { expectedRevision: 9, name: 'After rename' },
    );
  });

  it('never registers stale bytes as v2 when a semantics write conflicts', async () => {
    cloudMocks.listCustomFormulas.mockResolvedValueOnce([
      {
        id: RACE_STORAGE_ID,
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
      id: RACE_STORAGE_ID,
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
        RACE_RUNTIME_ID,
        'upgradeSemantics',
      );
      expect(changed).toMatchObject({ success: false, code: 'conflict' });
    });

    expect(
      readSessionFormulaAssets().find((asset) => asset.id === RACE_RUNTIME_ID),
    ).toBeUndefined();
  });
});
