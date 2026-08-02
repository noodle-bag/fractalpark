import type { FractalDocument } from '@/engine/document';
import {
  readFractalDocumentEnvelope,
  type FractalDocumentEnvelopeV1,
} from '@/engine/document-envelope';
import { documentToRuntimeParams } from '@/engine/document-adapter';
import { migrateFractalDocument, normalizeRuntimeFractalParams } from '@/engine/document-migrate';
import type { KeyframeAnimation, SavedFractal } from '@/engine/types';

export const LEGACY_ARTWORK_STORAGE_KEY = 'myfrac-saved-fractals';
export const ARTWORK_STORAGE_KEY = 'fractalpark-artworks-v1';
export const ARTWORK_RECORD_VERSION = 1 as const;
export const ARTWORK_RECORD_VERSION_V2 = 2 as const;

export interface StoredArtworkRecordV1 {
  recordVersion: typeof ARTWORK_RECORD_VERSION;
  id: string;
  name: string;
  envelope: FractalDocumentEnvelopeV1;
  createdAt: number;
  updatedAt?: number;
  thumbnail: string;
  starred: boolean;
}

/**
 * Cloud binding of a local recovery copy (spec: local/cloud binding). The
 * local record stays the durable recovery fact; the binding only records
 * which cloud draft it mirrors and at which revision.
 */
export interface ArtworkCloudBinding {
  draftId: string;
  revision: number;
  syncedAt: number;
}

export interface StoredArtworkRecordV2 extends Omit<StoredArtworkRecordV1, 'recordVersion'> {
  recordVersion: typeof ARTWORK_RECORD_VERSION_V2;
  cloud: ArtworkCloudBinding | null;
}

export interface ArtworkGalleryItem extends SavedFractal {
  document: FractalDocument;
  storageFormat: 'legacy' | 'document';
  readOnly: boolean;
  updatedAt?: number;
  cloud: ArtworkCloudBinding | null;
}

export type ArtworkStorageErrorCode =
  | 'storage-unavailable'
  | 'invalid-storage-data'
  | 'invalid-artwork'
  | 'quota-exceeded'
  | 'serialization-failed'
  | 'write-failed'
  | 'not-found';

export interface ArtworkStorageError {
  code: ArtworkStorageErrorCode;
  message: string;
  key?: string;
  itemId?: string;
}

export type ArtworkRepositoryResult<T> =
  | { success: true; value: T }
  | { success: false; errors: ArtworkStorageError[] };

export interface ArtworkRepositorySnapshot {
  items: ArtworkGalleryItem[];
  errors: ArtworkStorageError[];
  usedBytes: number;
}

export interface SaveArtworkInput {
  name: string;
  envelope: FractalDocumentEnvelopeV1;
  thumbnail: string;
}

export interface ArtworkRepositoryOptions {
  storage?: Storage;
  createId?: () => string;
  now?: () => number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isQuotaError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'QuotaExceededError') ||
    (isObject(error) && error.name === 'QuotaExceededError')
  );
}

function byteLength(value: string | null): number {
  return value ? new TextEncoder().encode(value).byteLength : 0;
}

function getAnimation(document: FractalDocument): KeyframeAnimation | undefined {
  return document.animation?.viewKeyframes
    ? { keyframes: document.animation.viewKeyframes }
    : undefined;
}

function sortArtworkItems(items: ArtworkGalleryItem[]): ArtworkGalleryItem[] {
  return [...items].sort((a, b) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    return (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt);
  });
}

function readArray(
  storage: Storage,
  key: string
): { raw: unknown[]; serialized: string | null; errors: ArtworkStorageError[] } {
  let serialized: string | null;
  try {
    serialized = storage.getItem(key);
  } catch {
    return {
      raw: [],
      serialized: null,
      errors: [{ code: 'storage-unavailable', message: 'Browser storage is unavailable.', key }],
    };
  }
  if (!serialized) {
    return { raw: [], serialized, errors: [] };
  }

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) {
      return {
        raw: [],
        serialized,
        errors: [{
          code: 'invalid-storage-data',
          message: 'Stored artwork data must be an array.',
          key,
        }],
      };
    }
    return { raw: parsed, serialized, errors: [] };
  } catch {
    return {
      raw: [],
      serialized,
      errors: [{
        code: 'invalid-storage-data',
        message: 'Stored artwork data is not valid JSON.',
        key,
      }],
    };
  }
}

function projectLegacyArtwork(value: unknown): ArtworkGalleryItem | undefined {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.createdAt !== 'number' ||
    typeof value.thumbnail !== 'string' ||
    typeof value.starred !== 'boolean' ||
    !isObject(value.params)
  ) {
    return undefined;
  }

  const legacy = {
    ...value,
    params: normalizeRuntimeFractalParams(value.params),
  } as unknown as SavedFractal;
  const document = migrateFractalDocument(legacy);

  return {
    ...legacy,
    document,
    storageFormat: 'legacy',
    readOnly: false,
    cloud: null,
  };
}

function readCloudBinding(value: unknown): ArtworkCloudBinding | null {
  if (!isObject(value)) return null;
  if (
    typeof value.draftId === 'string' &&
    typeof value.revision === 'number' &&
    Number.isInteger(value.revision) &&
    value.revision >= 1 &&
    typeof value.syncedAt === 'number'
  ) {
    return { draftId: value.draftId, revision: value.revision, syncedAt: value.syncedAt };
  }
  return null;
}

function projectCurrentArtwork(value: unknown): ArtworkGalleryItem | undefined {
  if (
    !isObject(value) ||
    (value.recordVersion !== ARTWORK_RECORD_VERSION &&
      value.recordVersion !== ARTWORK_RECORD_VERSION_V2) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.createdAt !== 'number' ||
    (value.updatedAt !== undefined && typeof value.updatedAt !== 'number') ||
    typeof value.thumbnail !== 'string' ||
    typeof value.starred !== 'boolean'
  ) {
    return undefined;
  }

  const envelopeResult = readFractalDocumentEnvelope(value.envelope);
  if (envelopeResult.mode === 'invalid') {
    return undefined;
  }
  const document =
    envelopeResult.mode === 'editable'
      ? envelopeResult.envelope.document
      : envelopeResult.document;

  return {
    id: value.id,
    name: value.name,
    params: documentToRuntimeParams(document),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt as number | undefined,
    thumbnail: value.thumbnail,
    starred: value.starred,
    animation: getAnimation(document),
    document,
    storageFormat: 'document',
    readOnly: envelopeResult.mode === 'readonly-future',
    cloud: value.recordVersion === ARTWORK_RECORD_VERSION_V2 ? readCloudBinding(value.cloud) : null,
  };
}

export class ArtworkRepository {
  private readonly storage?: Storage;
  private readonly createId: () => string;
  private readonly now: () => number;

  constructor(options: ArtworkRepositoryOptions = {}) {
    this.storage =
      options.storage ??
      (typeof window !== 'undefined' ? window.localStorage : undefined);
    this.createId = options.createId ?? (() => crypto.randomUUID());
    this.now = options.now ?? (() => Date.now());
  }

  readAll(): ArtworkRepositorySnapshot {
    if (!this.storage) {
      return {
        items: [],
        usedBytes: 0,
        errors: [{
          code: 'storage-unavailable',
          message: 'Browser storage is unavailable.',
        }],
      };
    }

    const legacy = readArray(this.storage, LEGACY_ARTWORK_STORAGE_KEY);
    const current = readArray(this.storage, ARTWORK_STORAGE_KEY);
    const errors = [...legacy.errors, ...current.errors];
    const items: ArtworkGalleryItem[] = [];

    for (const value of legacy.raw) {
      const item = projectLegacyArtwork(value);
      if (item) {
        items.push(item);
      } else {
        errors.push({
          code: 'invalid-artwork',
          message: 'A legacy saved artwork could not be read.',
          key: LEGACY_ARTWORK_STORAGE_KEY,
          itemId: isObject(value) && typeof value.id === 'string' ? value.id : undefined,
        });
      }
    }
    for (const value of current.raw) {
      const item = projectCurrentArtwork(value);
      if (item) {
        items.push(item);
      } else {
        errors.push({
          code: 'invalid-artwork',
          message: 'A Document artwork could not be read.',
          key: ARTWORK_STORAGE_KEY,
          itemId: isObject(value) && typeof value.id === 'string' ? value.id : undefined,
        });
      }
    }

    return {
      items: sortArtworkItems(items),
      errors,
      usedBytes: byteLength(legacy.serialized) + byteLength(current.serialized),
    };
  }

  readById(id: string): ArtworkGalleryItem | undefined {
    const items = this.readAll().items.filter((item) => item.id === id);
    return (
      items.find((item) => item.storageFormat === 'document') ??
      items[0]
    );
  }

  save(input: SaveArtworkInput): ArtworkRepositoryResult<ArtworkGalleryItem> {
    if (!this.storage) {
      return {
        success: false,
        errors: [{ code: 'storage-unavailable', message: 'Browser storage is unavailable.' }],
      };
    }

    const envelopeResult = readFractalDocumentEnvelope(input.envelope);
    if (envelopeResult.mode !== 'editable') {
      return {
        success: false,
        errors: [{
          code: 'invalid-artwork',
          message: 'Only editable current-version envelopes can be saved.',
        }],
      };
    }

    const current = readArray(this.storage, ARTWORK_STORAGE_KEY);
    if (current.errors.length > 0) {
      return { success: false, errors: current.errors };
    }

    const createdAt = this.now();
    const id = this.createId();
    const document = envelopeResult.envelope.document;
    const record: StoredArtworkRecordV2 = {
      recordVersion: ARTWORK_RECORD_VERSION_V2,
      id,
      name: input.name,
      envelope: {
        ...envelopeResult.envelope,
        document: {
          ...document,
          metadata: {
            ...document.metadata,
            name: input.name,
            createdAt,
            updatedAt: createdAt,
            source:
              document.metadata?.source === 'remix' ? 'remix' : 'saved',
          },
        },
      },
      createdAt,
      updatedAt: createdAt,
      thumbnail: input.thumbnail,
      starred: false,
      cloud: null,
    };

    const writeResult = this.write(ARTWORK_STORAGE_KEY, [...current.raw, record]);
    if (!writeResult.success) {
      return writeResult;
    }

    const item = projectCurrentArtwork(record);
    return item
      ? { success: true, value: item }
      : {
          success: false,
          errors: [{ code: 'invalid-artwork', message: 'Saved artwork could not be projected.' }],
        };
  }

  remove(id: string): ArtworkRepositoryResult<void> {
    return this.updateById(id, () => undefined);
  }

  /** Record, refresh, or clear (null) the cloud binding of a local copy. */
  bindCloud(id: string, binding: ArtworkCloudBinding | null): ArtworkRepositoryResult<void> {
    return this.updateById(id, (value, format) => {
      if (format === 'legacy') return value;
      return {
        ...value,
        recordVersion: ARTWORK_RECORD_VERSION_V2,
        cloud: binding
          ? { draftId: binding.draftId, revision: binding.revision, syncedAt: binding.syncedAt }
          : null,
      };
    });
  }

  /**
   * Overwrite the content of a document record in place (save-again of a
   * bound draft, or hydration when a cloud draft is opened). The binding,
   * star, and identity are preserved; only artwork facts move.
   */
  updateArtwork(
    id: string,
    input: SaveArtworkInput,
  ): ArtworkRepositoryResult<void> {
    const envelopeResult = readFractalDocumentEnvelope(input.envelope);
    if (envelopeResult.mode !== 'editable') {
      return {
        success: false,
        errors: [{
          code: 'invalid-artwork',
          message: 'Only editable current-version envelopes can be saved.',
        }],
      };
    }
    return this.updateById(id, (value, format) => {
      if (format === 'legacy') return value;
      const updatedAt = this.now();
      const document = envelopeResult.envelope.document;
      return {
        ...value,
        recordVersion: ARTWORK_RECORD_VERSION_V2,
        name: input.name,
        envelope: {
          ...envelopeResult.envelope,
          document: {
            ...document,
            metadata: {
              ...document.metadata,
              name: input.name,
              updatedAt,
            },
          },
        },
        updatedAt,
        thumbnail: input.thumbnail,
      };
    });
  }

  rename(id: string, name: string): ArtworkRepositoryResult<void> {
    return this.updateById(id, (value, format) => {
      if (format === 'legacy') {
        return { ...value, name };
      }
      const updatedAt = this.now();
      return {
        ...value,
        name,
        updatedAt,
        envelope: isObject(value.envelope)
          ? {
              ...value.envelope,
              document: isObject(value.envelope.document)
                ? {
                    ...value.envelope.document,
                    metadata: {
                      ...(isObject(value.envelope.document.metadata)
                        ? value.envelope.document.metadata
                        : {}),
                      name,
                      updatedAt,
                    },
                  }
                : value.envelope.document,
            }
          : value.envelope,
      };
    });
  }

  toggleStar(id: string): ArtworkRepositoryResult<void> {
    return this.updateById(id, (value, format) => ({
      ...value,
      starred: !value.starred,
      ...(format === 'document' ? { updatedAt: this.now() } : {}),
    }));
  }

  private updateById(
    id: string,
    updater: (
      value: Record<string, unknown>,
      format: 'legacy' | 'document'
    ) => Record<string, unknown> | undefined
  ): ArtworkRepositoryResult<void> {
    if (!this.storage) {
      return {
        success: false,
        errors: [{ code: 'storage-unavailable', message: 'Browser storage is unavailable.' }],
      };
    }

    for (const [key, format] of [
      [ARTWORK_STORAGE_KEY, 'document'],
      [LEGACY_ARTWORK_STORAGE_KEY, 'legacy'],
    ] as const) {
      const records = readArray(this.storage, key);
      if (records.errors.length > 0) {
        return { success: false, errors: records.errors };
      }
      const index = records.raw.findIndex(
        (value) => isObject(value) && value.id === id
      );
      if (index === -1) continue;

      const current = records.raw[index] as Record<string, unknown>;
      const updated = updater(current, format);
      const next = updated
        ? records.raw.map((value, itemIndex) => (itemIndex === index ? updated : value))
        : records.raw.filter((_, itemIndex) => itemIndex !== index);
      return this.write(key, next);
    }

    return {
      success: false,
      errors: [{ code: 'not-found', message: `Artwork not found: ${id}.`, itemId: id }],
    };
  }

  private write(key: string, value: unknown): ArtworkRepositoryResult<void> {
    if (!this.storage) {
      return {
        success: false,
        errors: [{ code: 'storage-unavailable', message: 'Browser storage is unavailable.' }],
      };
    }

    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      return {
        success: false,
        errors: [{ code: 'serialization-failed', message: 'Artwork data could not be serialized.', key }],
      };
    }

    try {
      this.storage.setItem(key, serialized);
      return { success: true, value: undefined };
    } catch (error) {
      return {
        success: false,
        errors: [{
          code: isQuotaError(error) ? 'quota-exceeded' : 'write-failed',
          message: isQuotaError(error)
            ? 'Browser storage quota was exceeded.'
            : 'Artwork data could not be written.',
          key,
        }],
      };
    }
  }
}

export function readArtworkDocumentById(id: string): FractalDocument | undefined {
  return new ArtworkRepository().readById(id)?.document;
}
