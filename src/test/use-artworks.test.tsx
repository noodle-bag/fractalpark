import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FractalDocument } from '@/engine/document';
import { useArtworks } from '@/hooks/useArtworks';
import { ARTWORK_STORAGE_KEY, LEGACY_ARTWORK_STORAGE_KEY } from '@/lib/artwork-repository';
import { CUSTOM_FORMULAS_STORAGE_KEY } from '@/hooks/useCustomFormulas';
import documentV2 from './fixtures/documents/document-v2.json';
import legacyFixture from './fixtures/documents/legacy-saved-fractal.json';

describe('useArtworks', () => {
  let storage: Map<string, string>;
  let failWrites: boolean;

  beforeEach(() => {
    storage = new Map();
    failWrites = false;
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (failWrites) {
          throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
        }
        storage.set(key, value);
      },
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001'
    );
  });

  it('reads legacy items and writes new documents to the current key', async () => {
    storage.set(LEGACY_ARTWORK_STORAGE_KEY, JSON.stringify([legacyFixture]));
    const { result } = renderHook(() => useArtworks());

    expect(result.current.artworks).toHaveLength(1);
    expect(result.current.artworks[0].storageFormat).toBe('legacy');

    await act(async () => {
      const saveResult = await result.current.saveDocument(
        'New Document',
        documentV2 as unknown as FractalDocument,
        'data:image/jpeg;base64,new'
      );
      expect(saveResult.success).toBe(true);
    });

    await waitFor(() => expect(result.current.artworks).toHaveLength(2));
    expect(storage.get(LEGACY_ARTWORK_STORAGE_KEY)).toBe(
      JSON.stringify([legacyFixture])
    );
    expect(JSON.parse(storage.get(ARTWORK_STORAGE_KEY) ?? '[]')).toHaveLength(1);
  });

  it('does not add an item when the current-key write fails', async () => {
    const { result } = renderHook(() => useArtworks());
    failWrites = true;

    await act(async () => {
      const saveResult = await result.current.saveDocument(
        'Quota Failure',
        documentV2 as unknown as FractalDocument,
        ''
      );
      expect(saveResult).toMatchObject({
        success: false,
        errors: [{ code: 'quota-exceeded' }],
      });
    });

    expect(result.current.artworks).toEqual([]);
    expect(storage.has(ARTWORK_STORAGE_KEY)).toBe(false);
  });

  it('embeds the active custom FRM source in the saved envelope', async () => {
    const customDocument = structuredClone(documentV2) as unknown as FractalDocument;
    customDocument.formula.formulaId = 'custom-local';
    storage.set(
      CUSTOM_FORMULAS_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'custom-local',
          name: 'Local Formula',
          source: `LocalFormula {
init:
  z = pixel
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`,
          createdAt: 1,
          updatedAt: 1,
        },
      ])
    );
    const { result } = renderHook(() => useArtworks());

    await act(async () => {
      expect(
        (await result.current.saveDocument('Custom Save', customDocument, '')).success
      ).toBe(true);
    });

    const stored = JSON.parse(storage.get(ARTWORK_STORAGE_KEY) ?? '[]');
    expect(stored[0].envelope.assets.formulas[0]).toMatchObject({
      id: 'custom-local',
      language: 'frm',
      name: 'Local Formula',
    });
    expect(stored[0].envelope.assets.formulas[0].hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
