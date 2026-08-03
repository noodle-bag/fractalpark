'use client';

import { useCallback, useRef, useState } from 'react';

import { trackEvent } from '@/components/analytics/PageViewTracker';
import { useCloudSession } from '@/components/cloud/CloudSessionProvider';
import type { FractalDocument } from '@/engine/document';
import { createRenderSnapshot } from '@/engine/render-snapshot';
import type { CloudDraftIdentity } from '@/hooks/useCloudDraftSession';
import {
  getArtworkAnalyticsContext,
  getProjectFileSizeBucket,
} from '@/lib/artwork-analytics';
import { captureThumbnail } from '@/lib/capture-thumbnail';
import {
  readEffectiveFormulaAssets,
} from '@/lib/custom-formula-storage';
import { resolveCustomFormula } from '@/lib/formula-resolver';
import { exportFractal } from '@/lib/export-fractal';
import {
  FRACTAL_PROJECT_FILE_MAX_BYTES,
  createFractalDocumentEnvelope,
  createFractalProjectFilename,
  downloadFractalProjectFile,
  parseFractalProjectJson,
  serializeFractalProject,
  sha256Hex,
  type FractalProjectErrorCode,
  type LocalFormulaAsset,
} from '@/lib/fractal-file';


export type ArtworkOperation = 'save' | 'download' | 'import' | 'export';
export type ArtworkActionErrorCode =
  | FractalProjectErrorCode
  | 'future-document'
  | 'invalid-formula-storage'
  | 'formula-limit-reached'
  | 'formula-commit-failed'
  | 'save-failed'
  | 'cloud-unavailable'
  | 'download-failed'
  | 'export-failed';

export type CloudSyncPhase =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'failed'
  | 'conflict'
  | 'quota'
  | 'offline'
  | 'session-expired';

export type ArtworkActionStatus =
  | { phase: 'idle' }
  | { phase: 'pending'; operation: ArtworkOperation }
  | { phase: 'success'; operation: ArtworkOperation }
  | { phase: 'error'; operation: ArtworkOperation; code: ArtworkActionErrorCode };

interface SaveInput {
  name: string;
  document: FractalDocument;
  thumbnail: string;
  formulaAssets: LocalFormulaAsset[];
}

/** Cloud-draft save surface owned by useCloudDraftSession (spec §17). */
export interface CloudDraftSaveSurface {
  identity: CloudDraftIdentity | null;
  saveDraft: (
    input: SaveInput,
  ) => Promise<
    | { ok: true; identity: CloudDraftIdentity }
    | {
        ok: false;
        phase:
          | 'failed'
          | 'conflict'
          | 'quota'
          | 'offline'
          | 'session_expired'
          | 'idle'
          | 'saving'
          | 'saved';
      }
  >;
  savePhase:
    | 'idle'
    | 'saving'
    | 'saved'
    | 'conflict'
    | 'quota'
    | 'offline'
    | 'session_expired'
    | 'failed';
}

interface UseArtworkActionsOptions {
  document: FractalDocument;
  effectiveIterations: number;
  getCanvas: () => HTMLCanvasElement | null;
  loadDocument: (document: FractalDocument) => void;
  /** Cloud-authoritative save surface; save writes the draft and nothing else. */
  cloudDraft: CloudDraftSaveSurface;
  /** Called after a brand-new draft is created so the owner can pin `?draft=`. */
  onDraftCreated?: (identity: CloudDraftIdentity) => void;
}

export function useArtworkActions({
  document,
  effectiveIterations,
  getCanvas,
  loadDocument,
  cloudDraft,
  onDraftCreated,
}: UseArtworkActionsOptions) {
  const [status, setStatus] = useState<ArtworkActionStatus>({ phase: 'idle' });
  const [cloudPhase, setCloudPhase] = useState<CloudSyncPhase>('idle');
  const pendingRef = useRef(false);
  const { state: cloudSession, openSignIn } = useCloudSession();

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

  const resetCloudPhase = useCallback(() => setCloudPhase('idle'), []);

  const save = useCallback(async (name: string) => {
    if (!begin('save')) return false;
    setCloudPhase('idle');

    // Freeze the write at click time (DEC-0416-04): the envelope, title,
    // and thumbnail are captured now; an OTP round-trip or a retry later
    // reuses exactly these bytes, never a silently newer canvas.
    const canvas = getCanvas();
    const thumbnail = canvas ? captureThumbnail(canvas) : '';
    const input: SaveInput = {
      name,
      document,
      thumbnail,
      formulaAssets: readEffectiveFormulaAssets(),
    };

    const execute = async (): Promise<boolean> => {
      setCloudPhase('syncing');
      const hadIdentity = cloudDraft.identity !== null;
      const result = await cloudDraft.saveDraft(input);
      if (result.ok) {
        setCloudPhase('synced');
        trackEvent('save_fractal', {
          formula: document.formula.formulaId,
          ...getArtworkAnalyticsContext(document),
        });
        if (!hadIdentity) onDraftCreated?.(result.identity);
        succeed('save');
        return true;
      } else {
        // Mirror the phase the hook actually landed on — returned, not read
        // from render-time state (first-conflict classification bug, review).
        switch (result.phase) {
          case 'conflict':
            setCloudPhase('conflict');
            break;
          case 'quota':
            setCloudPhase('quota');
            break;
          case 'offline':
            setCloudPhase('offline');
            break;
          case 'session_expired':
            setCloudPhase('session-expired');
            break;
          default:
            setCloudPhase('failed');
        }
        fail('save', 'save-failed');
        return false;
      }
    };

    if (cloudSession.status === 'authenticated') {
      return execute();
    }
    if (cloudSession.status === 'anonymous') {
      // Single intent, React memory only: after OTP the exact frozen write
      // resumes. Returning true closes the name dialog; the OTP dialog
      // becomes the pending UI.
      pendingRef.current = false;
      setStatus({ phase: 'idle' });
      openSignIn(() => {
        void execute();
      });
      return true;
    }
    // unavailable / disabled / loading: never fake success, never fall back
    // to a local copy (spec §17 sole persistence).
    fail('save', 'cloud-unavailable');
    return false;
  }, [begin, cloudDraft, cloudSession.status, document, fail, getCanvas, onDraftCreated, openSignIn, succeed]);

  const download = useCallback(async () => {
    if (!begin('download')) return false;
    try {
      const envelope = await createFractalDocumentEnvelope(document, readEffectiveFormulaAssets());
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
      // Transient import (v0.4.16): formula assets register in memory for
      // this session only — nothing touches local formula storage. Hashes
      // are verified first (review follow-up): bytes must match the
      // envelope's claim before anything registers.
      for (const asset of parsed.value.envelope.assets?.formulas ?? []) {
        if (asset.hash && asset.hash !== (await sha256Hex(asset.source))) {
          fail('import', 'invalid-envelope');
          return false;
        }
        const resolved = resolveCustomFormula({ id: asset.id, source: asset.source });
        if (!resolved.success) {
          fail('import', 'asset-compile-failed');
          return false;
        }
      }
      trackEvent('project_import', {
        formula: parsed.value.envelope.document.formula.formulaId,
        custom_formula_count: parsed.value.envelope.assets?.formulas?.length ?? 0,
        file_size_bucket: getProjectFileSizeBucket(file.size),
        ...getArtworkAnalyticsContext(parsed.value.envelope.document),
      });
      loadDocument(parsed.value.envelope.document);
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
    cloudPhase,
    clearStatus,
    resetCloudPhase,
    save,
    download,
    importFile,
    exportPng,
  };
}
