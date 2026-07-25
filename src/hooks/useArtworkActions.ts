'use client';

import { useCallback, useRef, useState } from 'react';

import { trackEvent } from '@/components/analytics/PageViewTracker';
import type { FractalDocument } from '@/engine/document';
import { createRenderSnapshot } from '@/engine/render-snapshot';
import {
  getArtworkAnalyticsContext,
  getProjectFileSizeBucket,
} from '@/lib/artwork-analytics';
import { captureThumbnail } from '@/lib/capture-thumbnail';
import {
  commitPreparedFractalProjectImport,
  readLocalFormulaAssets,
} from '@/lib/custom-formula-storage';
import { exportFractal } from '@/lib/export-fractal';
import {
  FRACTAL_PROJECT_FILE_MAX_BYTES,
  createFractalDocumentEnvelope,
  createFractalProjectFilename,
  downloadFractalProjectFile,
  parseFractalProjectJson,
  prepareFractalProjectImport,
  serializeFractalProject,
  type FractalProjectErrorCode,
} from '@/lib/fractal-file';
import { useArtworks } from './useArtworks';

export type ArtworkOperation = 'save' | 'download' | 'import' | 'export';
export type ArtworkActionErrorCode =
  | FractalProjectErrorCode
  | 'future-document'
  | 'invalid-formula-storage'
  | 'formula-limit-reached'
  | 'formula-commit-failed'
  | 'save-failed'
  | 'download-failed'
  | 'export-failed';

export type ArtworkActionStatus =
  | { phase: 'idle' }
  | { phase: 'pending'; operation: ArtworkOperation }
  | { phase: 'success'; operation: ArtworkOperation }
  | { phase: 'error'; operation: ArtworkOperation; code: ArtworkActionErrorCode };

interface UseArtworkActionsOptions {
  document: FractalDocument;
  effectiveIterations: number;
  getCanvas: () => HTMLCanvasElement | null;
  loadDocument: (document: FractalDocument) => void;
}

export function useArtworkActions({
  document,
  effectiveIterations,
  getCanvas,
  loadDocument,
}: UseArtworkActionsOptions) {
  const [status, setStatus] = useState<ArtworkActionStatus>({ phase: 'idle' });
  const pendingRef = useRef(false);
  const { saveDocument, storageInfo } = useArtworks();

  const begin = useCallback((operation: ArtworkOperation) => {
    if (pendingRef.current) return false;
    pendingRef.current = true;
    setStatus({ phase: 'pending', operation });
    return true;
  }, []);

  const succeed = useCallback((operation: ArtworkOperation) => {
    pendingRef.current = false;
    setStatus({ phase: 'success', operation });
  }, []);

  const fail = useCallback((operation: ArtworkOperation, code: ArtworkActionErrorCode) => {
    pendingRef.current = false;
    setStatus({ phase: 'error', operation, code });
  }, []);

  const clearStatus = useCallback(() => {
    setStatus({ phase: 'idle' });
  }, []);

  const save = useCallback(async (name: string) => {
    if (!begin('save')) return false;
    try {
      const canvas = getCanvas();
      const thumbnail = canvas ? captureThumbnail(canvas) : '';
      const result = await saveDocument(name, document, thumbnail);
      if (!result.success) {
        fail('save', 'save-failed');
        return false;
      }
      trackEvent('save_fractal', {
        formula: document.formula.formulaId,
        ...getArtworkAnalyticsContext(document),
      });
      succeed('save');
      return true;
    } catch {
      fail('save', 'save-failed');
      return false;
    }
  }, [begin, document, fail, getCanvas, saveDocument, succeed]);

  const download = useCallback(async () => {
    if (!begin('download')) return false;
    try {
      const envelope = await createFractalDocumentEnvelope(document, readLocalFormulaAssets());
      if (!envelope.success) {
        fail('download', envelope.errors[0]?.code ?? 'download-failed');
        return false;
      }
      const serialized = serializeFractalProject(envelope.value);
      if (!serialized.success) {
        fail('download', serialized.errors[0]?.code ?? 'download-failed');
        return false;
      }
      downloadFractalProjectFile(
        serialized.value,
        createFractalProjectFilename(document.metadata?.name)
      );
      trackEvent('project_download', {
        formula: document.formula.formulaId,
        file_size_bucket: getProjectFileSizeBucket(
          new TextEncoder().encode(serialized.value).byteLength
        ),
        ...getArtworkAnalyticsContext(document),
      });
      succeed('download');
      return true;
    } catch {
      fail('download', 'download-failed');
      return false;
    }
  }, [begin, document, fail, succeed]);

  const importFile = useCallback(async (file: File) => {
    if (!begin('import')) return false;
    try {
      if (file.size > FRACTAL_PROJECT_FILE_MAX_BYTES) {
        fail('import', 'file-too-large');
        trackEvent('project_import_failed', {
          error_code: 'file-too-large',
          file_size_bucket: getProjectFileSizeBucket(file.size),
          ...getArtworkAnalyticsContext(document),
        });
        return false;
      }
      const parsed = parseFractalProjectJson(await file.text());
      if (!parsed.success) {
        const code = parsed.errors[0]?.code ?? 'invalid-envelope';
        fail('import', code);
        trackEvent('project_import_failed', {
          error_code: code,
          file_size_bucket: getProjectFileSizeBucket(file.size),
          ...getArtworkAnalyticsContext(document),
        });
        return false;
      }
      if (parsed.value.mode === 'readonly-future') {
        fail('import', 'future-document');
        trackEvent('project_import_failed', {
          error_code: 'future-document',
          file_size_bucket: getProjectFileSizeBucket(file.size),
          ...getArtworkAnalyticsContext(document),
        });
        return false;
      }
      const prepared = await prepareFractalProjectImport(
        parsed.value.envelope,
        readLocalFormulaAssets()
      );
      if (!prepared.success) {
        const code = prepared.errors[0]?.code ?? 'invalid-envelope';
        fail('import', code);
        trackEvent('project_import_failed', {
          error_code: code,
          file_size_bucket: getProjectFileSizeBucket(file.size),
          ...getArtworkAnalyticsContext(document),
        });
        return false;
      }
      const committed = commitPreparedFractalProjectImport(prepared.value, loadDocument);
      if (!committed.success) {
        fail('import', committed.code);
        trackEvent('project_import_failed', {
          error_code: committed.code,
          file_size_bucket: getProjectFileSizeBucket(file.size),
          ...getArtworkAnalyticsContext(document),
        });
        return false;
      }
      trackEvent('project_import', {
        formula: prepared.value.document.formula.formulaId,
        custom_formula_count: prepared.value.formulasToAdd.length,
        file_size_bucket: getProjectFileSizeBucket(file.size),
        ...getArtworkAnalyticsContext(prepared.value.document),
      });
      succeed('import');
      return true;
    } catch {
      fail('import', 'invalid-envelope');
      trackEvent('project_import_failed', {
        error_code: 'invalid-envelope',
        file_size_bucket: getProjectFileSizeBucket(file.size),
        ...getArtworkAnalyticsContext(document),
      });
      return false;
    }
  }, [begin, document, fail, loadDocument, succeed]);

  const exportPng = useCallback(async (scale: number, ssaaLevel: number) => {
    if (!begin('export')) return false;
    try {
      const canvas = getCanvas();
      const width = canvas?.clientWidth ?? 1200;
      const height = canvas?.clientHeight ?? 800;
      const snapshot = createRenderSnapshot(document, {
        maxIterations: effectiveIterations,
        useSSAA: ssaaLevel > 0,
        ssaaLevel,
      });
      await exportFractal(snapshot, width, height, scale);
      trackEvent('export_fractal', {
        scale,
        ssaa: ssaaLevel,
        formula: document.formula.formulaId,
        ...getArtworkAnalyticsContext(document),
      });
      succeed('export');
      return true;
    } catch {
      fail('export', 'export-failed');
      return false;
    }
  }, [begin, document, effectiveIterations, fail, getCanvas, succeed]);

  return {
    status,
    clearStatus,
    save,
    download,
    importFile,
    exportPng,
    savedCount: storageInfo.count,
  };
}
