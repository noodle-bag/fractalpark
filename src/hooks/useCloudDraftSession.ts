'use client';

/**
 * v0.4.16 cloud-authoritative draft session (ADR 0006, spec §17): the
 * cloud draft is the only artwork persistence. This hook owns the draft
 * identity for one Explore session — loading `?draft=` sessions, creating
 * and patching owner drafts, and the conflict branch — with the frozen
 * first-frame semantics: loading never impersonates content, failures
 * never fake success.
 */

import { useCallback, useRef, useState } from 'react';

import type { FractalDocument } from '@/engine/document';
import {
  readFractalDocumentEnvelope,
  type FractalDocumentEnvelopeV1,
} from '@/engine/document-envelope';
import { CloudClientError, createDraft, getDraft, updateDraft } from '@/lib/cloud/client';
import { createFractalDocumentEnvelope } from '@/lib/fractal-file';
import type { LocalFormulaAsset } from '@/lib/fractal-file';

export interface CloudDraftIdentity {
  id: string;
  revision: number;
}

export type DraftLoadState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'not_found'
  | 'unavailable';

export type DraftSavePhase =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'conflict'
  | 'quota'
  | 'offline'
  | 'session_expired'
  | 'failed';

export interface LoadedDraft {
  document: FractalDocument;
  title: string;
  remixSource: { type: string; id: string } | null;
  formulaAssets: LocalFormulaAsset[];
}

interface SaveInput {
  name: string;
  document: FractalDocument;
  thumbnail: string;
  formulaAssets: LocalFormulaAsset[];
}

export function useCloudDraftSession() {
  const [identity, setIdentity] = useState<CloudDraftIdentity | null>(null);
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<DraftLoadState>('idle');
  const [savePhase, setSavePhase] = useState<DraftSavePhase>('idle');
  // Latest envelope/remix facts captured at load time for conflict reloads.
  const loadedRef = useRef<LoadedDraft | null>(null);
  // Provenance for a draft that has never been saved (anonymous transient
  // remix): attached to the very first create, then cleared.
  const pendingRemixSourceRef = useRef<{ type: string; id: string } | null>(null);

  const setPendingRemixSource = useCallback((source: { type: string; id: string } | null) => {
    pendingRemixSourceRef.current = source;
  }, []);

  const loadDraft = useCallback(async (draftId: string): Promise<LoadedDraft | null> => {
    setLoadState('loading');
    try {
      const detail = await getDraft(draftId);
      const read = readFractalDocumentEnvelope(detail.envelope);
      if (read.mode !== 'editable') {
        // readonly-future means this app is older than the draft's format;
        // editing it silently would corrupt the save contract. Honest
        // unavailable, never a fake default (rollback-compat note, ADR 0006).
        setLoadState('unavailable');
        return null;
      }
      const loaded: LoadedDraft = {
        document: read.envelope.document,
        title: detail.title,
        remixSource: detail.remixSource ?? null,
        formulaAssets: (read.envelope.assets?.formulas ?? []).map((asset) => ({
          id: asset.id,
          name: asset.name ?? asset.id,
          source: asset.source,
        })),
      };
      loadedRef.current = loaded;
      setIdentity({ id: detail.id, revision: detail.revision });
      setDraftTitle(detail.title);
      setLoadState('ready');
      return loaded;
    } catch (error) {
      if (error instanceof CloudClientError && error.code === 'not_found') {
        setLoadState('not_found');
      } else {
        setLoadState('unavailable');
      }
      return null;
    }
  }, []);

  const saveDraft = useCallback(
    async (
      input: SaveInput,
      identityOverride?: CloudDraftIdentity | null,
    ): Promise<
      { ok: true; identity: CloudDraftIdentity } | { ok: false; phase: DraftSavePhase }
    > => {
      // identityOverride lets save-as-new pass null synchronously — React
      // state would still hold the old identity within this tick.
      const currentIdentity = identityOverride !== undefined ? identityOverride : identity;
      setSavePhase('saving');
      const envelopeResult = await createFractalDocumentEnvelope(input.document, input.formulaAssets);
      if (!envelopeResult.success) {
        setSavePhase('failed');
        return { ok: false, phase: 'failed' };
      }
      const envelope: FractalDocumentEnvelopeV1 = envelopeResult.value;
      try {
        if (!currentIdentity) {
          const result = await createDraft({
            envelope,
            thumbnailBase64: input.thumbnail || undefined,
            remixSourceType:
              loadedRef.current?.remixSource?.type ?? pendingRemixSourceRef.current?.type,
            remixSourceId:
              loadedRef.current?.remixSource?.id ?? pendingRemixSourceRef.current?.id,
          });
          pendingRemixSourceRef.current = null;
          const next = { id: result.draftId, revision: result.revision };
          setIdentity(next);
          setDraftTitle(input.name);
          setSavePhase('saved');
          return { ok: true, identity: next };
        }
        const result = await updateDraft(currentIdentity.id, {
          envelope,
          expectedRevision: currentIdentity.revision,
          thumbnailBase64: input.thumbnail || undefined,
        });
        const next = { id: currentIdentity.id, revision: result.revision };
        setIdentity(next);
        setDraftTitle(input.name);
        setSavePhase('saved');
        return { ok: true, identity: next };
      } catch (error) {
        if (error instanceof CloudClientError) {
          switch (error.code) {
            case 'revision_conflict':
              setSavePhase('conflict');
              return { ok: false, phase: 'conflict' };
            case 'quota_exceeded':
              setSavePhase('quota');
              return { ok: false, phase: 'quota' };
            case 'unauthenticated':
              setSavePhase('session_expired');
              return { ok: false, phase: 'session_expired' };
            case 'offline':
              setSavePhase('offline');
              return { ok: false, phase: 'offline' };
            default:
              break;
          }
        }
        setSavePhase('failed');
        return { ok: false, phase: 'failed' };
      }
    },
    [identity],
  );

  /** Conflict exit: re-read the remote draft, adopt its revision, and hand
   *  the remote document back for loading. */
  const reloadConflictDraft = useCallback(async (): Promise<LoadedDraft | null> => {
    if (!identity) return null;
    const loaded = await loadDraft(identity.id);
    if (loaded) setSavePhase('idle');
    return loaded;
  }, [identity, loadDraft]);

  /** Conflict exit: keep the local document, write it as a brand-new draft. */
  const saveAsNewDraft = useCallback(
    async (input: SaveInput) => {
      setIdentity(null);
      return saveDraft(input, null);
    },
    [saveDraft],
  );

  const clearIdentity = useCallback(() => {
    setIdentity(null);
    setDraftTitle(null);
    loadedRef.current = null;
    pendingRemixSourceRef.current = null;
    setSavePhase('idle');
    setLoadState('idle');
  }, []);

  const resetSavePhase = useCallback(() => setSavePhase('idle'), []);

  return {
    identity,
    draftTitle,
    loadState,
    savePhase,
    loadDraft,
    saveDraft,
    reloadConflictDraft,
    saveAsNewDraft,
    clearIdentity,
    resetSavePhase,
    setPendingRemixSource,
  };
}
