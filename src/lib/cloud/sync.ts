/**
 * Local/cloud save orchestration for the creation workflow (spec: local
 * recovery copy first, cloud save layered on; cloud failure never erases a
 * local success). Framework-free so the state machine is unit-testable
 * without a DOM; hooks and components translate outcomes into UI.
 */

import type { ArtworkCloudBinding } from '@/lib/artwork-repository';
import {
  CloudClientError,
  createDraft,
  deleteDraft,
  getDraft,
  updateDraft,
} from './client';

export type CloudSaveOutcome =
  | { kind: 'synced'; binding: ArtworkCloudBinding }
  | { kind: 'conflict' }
  | { kind: 'quota' }
  | { kind: 'disabled' }
  | { kind: 'failed'; reason: CloudClientError['code']; retryAfter?: number };

/** Strip a data URL down to raw base64 for the draft thumbnail field. */
export function thumbnailToBase64(thumbnail: string): string | undefined {
  if (thumbnail.length === 0) return undefined;
  const marker = ';base64,';
  const index = thumbnail.indexOf(marker);
  return index === -1 ? thumbnail : thumbnail.slice(index + marker.length);
}

/**
 * Save the current artwork to the cloud: create when unbound, update with
 * the recorded revision when bound. Callers persist the returned binding
 * onto the local recovery copy only after a synced outcome.
 */
export async function syncArtworkToCloud(args: {
  envelope: unknown;
  thumbnail: string;
  binding: ArtworkCloudBinding | null;
}): Promise<CloudSaveOutcome> {
  const thumbnailBase64 = thumbnailToBase64(args.thumbnail);
  try {
    if (args.binding) {
      const result = await updateDraft(args.binding.draftId, {
        envelope: args.envelope,
        expectedRevision: args.binding.revision,
        thumbnailBase64,
      });
      return {
        kind: 'synced',
        binding: { draftId: result.draftId, revision: result.revision, syncedAt: Date.now() },
      };
    }
    const result = await createDraft({ envelope: args.envelope, thumbnailBase64 });
    return {
      kind: 'synced',
      binding: { draftId: result.draftId, revision: result.revision, syncedAt: Date.now() },
    };
  } catch (error) {
    if (error instanceof CloudClientError) {
      switch (error.code) {
        case 'cloud_disabled':
          return { kind: 'disabled' };
        case 'quota_exceeded':
          return { kind: 'quota' };
        case 'revision_conflict':
          return { kind: 'conflict' };
        case 'not_found':
          // The bound draft vanished elsewhere (deleted on another device):
          // surface as a generic failure; the next save recreates a draft
          // only from an explicit user action, never silently.
          return { kind: 'failed', reason: 'not_found' };
        default:
          return { kind: 'failed', reason: error.code, retryAfter: error.retryAfter };
      }
    }
    return { kind: 'failed', reason: 'unavailable' };
  }
}

/**
 * Import a local recovery copy to the cloud as a new draft. Returns the
 * fresh binding on success.
 */
export async function importArtworkToCloud(args: {
  envelope: unknown;
  thumbnail: string;
}): Promise<CloudSaveOutcome> {
  return syncArtworkToCloud({ ...args, binding: null });
}

/**
 * Open a cloud draft: fetch the authoritative envelope and the detail the
 * caller needs to hydrate the local recovery copy. Throws CloudClientError
 * (not_found is uniform and intentional).
 */
export async function openCloudDraft(draftId: string): Promise<{
  envelope: unknown;
  revision: number;
  title: string;
}> {
  const detail = await getDraft(draftId);
  return { envelope: detail.envelope, revision: detail.revision, title: detail.title };
}

export { deleteDraft };
