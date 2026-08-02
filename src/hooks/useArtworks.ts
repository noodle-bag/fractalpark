'use client';

import { useCallback, useMemo, useState } from 'react';

import type { FractalDocument } from '@/engine/document';
import type { FractalDocumentEnvelopeV1 } from '@/engine/document-envelope';
import {
  ArtworkRepository,
  type ArtworkCloudBinding,
  type ArtworkGalleryItem,
  type ArtworkRepositoryResult,
  type ArtworkRepositorySnapshot,
} from '@/lib/artwork-repository';
import {
  createFractalDocumentEnvelope,
} from '@/lib/fractal-file';
import { readLocalFormulaAssets } from '@/lib/custom-formula-storage';

export function useArtworks() {
  const [repository] = useState(() => new ArtworkRepository());
  const [snapshot, setSnapshot] = useState<ArtworkRepositorySnapshot>(() =>
    repository.readAll()
  );

  const refresh = useCallback(() => {
    setSnapshot(repository.readAll());
  }, [repository]);

  const saveEnvelope = useCallback(
    (
      name: string,
      envelope: FractalDocumentEnvelopeV1,
      thumbnail: string
    ): ArtworkRepositoryResult<ArtworkGalleryItem> => {
      const result = repository.save({ name, envelope, thumbnail });
      if (result.success) refresh();
      return result;
    },
    [refresh, repository]
  );

  const saveDocument = useCallback(
    async (
      name: string,
      document: FractalDocument,
      thumbnail: string
    ): Promise<ArtworkRepositoryResult<ArtworkGalleryItem>> => {
      const envelopeResult = await createFractalDocumentEnvelope(
        document,
        readLocalFormulaAssets()
      );
      if (!envelopeResult.success) {
        return {
          success: false,
          errors: envelopeResult.errors.map((error) => ({
            code: 'invalid-artwork',
            message: error.message,
          })),
        };
      }
      return saveEnvelope(name, envelopeResult.value, thumbnail);
    },
    [saveEnvelope]
  );

  const remove = useCallback(
    (id: string) => {
      const result = repository.remove(id);
      if (result.success) refresh();
      return result;
    },
    [refresh, repository]
  );

  const rename = useCallback(
    (id: string, name: string) => {
      const result = repository.rename(id, name);
      if (result.success) refresh();
      return result;
    },
    [refresh, repository]
  );

  const toggleStar = useCallback(
    (id: string) => {
      const result = repository.toggleStar(id);
      if (result.success) refresh();
      return result;
    },
    [refresh, repository]
  );

  const updateArtwork = useCallback(
    (id: string, name: string, envelope: FractalDocumentEnvelopeV1, thumbnail: string) => {
      const result = repository.updateArtwork(id, { name, envelope, thumbnail });
      if (result.success) refresh();
      return result;
    },
    [refresh, repository]
  );

  const bindCloud = useCallback(
    (id: string, binding: ArtworkCloudBinding | null) => {
      const result = repository.bindCloud(id, binding);
      if (result.success) refresh();
      return result;
    },
    [refresh, repository]
  );

  const readById = useCallback(
    (id: string): ArtworkGalleryItem | undefined => repository.readById(id),
    [repository]
  );

  const starred = useMemo(
    () => snapshot.items.filter((item) => item.starred),
    [snapshot.items]
  );

  return {
    artworks: snapshot.items,
    starred,
    errors: snapshot.errors,
    saveDocument,
    saveEnvelope,
    remove,
    rename,
    toggleStar,
    updateArtwork,
    bindCloud,
    readById,
    storageInfo: {
      count: snapshot.items.length,
      usedBytes: snapshot.usedBytes,
    },
    refresh,
  };
}
