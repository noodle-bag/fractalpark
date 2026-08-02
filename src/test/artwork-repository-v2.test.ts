import { beforeEach, describe, expect, it } from 'vitest';

import {
  ARTWORK_STORAGE_KEY,
  ArtworkRepository,
  type ArtworkCloudBinding,
} from '@/lib/artwork-repository';
import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => Array.from(map.keys())[index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  };
}

const ENVELOPE = { envelopeVersion: 1, document: DEFAULT_FRACTAL_DOCUMENT };
const BINDING: ArtworkCloudBinding = { draftId: 'd-1', revision: 3, syncedAt: 1234567890 };

describe('StoredArtworkRecordV2', () => {
  let storage: Storage;
  let repository: ArtworkRepository;

  beforeEach(() => {
    storage = memoryStorage();
    repository = new ArtworkRepository({ storage, createId: () => 'local-1', now: () => 1000 });
  });

  it('writes V2 records with a null binding and reads them back', () => {
    const saved = repository.save({ name: 'A', envelope: ENVELOPE, thumbnail: 'data:image/png;base64,x' });
    expect(saved.success).toBe(true);
    const raw = JSON.parse(storage.getItem(ARTWORK_STORAGE_KEY) as string) as Array<Record<string, unknown>>;
    expect(raw[0].recordVersion).toBe(2);
    expect(raw[0].cloud).toBeNull();
    expect(repository.readAll().items[0].cloud).toBeNull();
  });

  it('still reads V1 records and projects them without a binding', () => {
    storage.setItem(
      ARTWORK_STORAGE_KEY,
      JSON.stringify([
        {
          recordVersion: 1,
          id: 'v1-item',
          name: 'Old',
          envelope: ENVELOPE,
          createdAt: 1,
          thumbnail: '',
          starred: true,
        },
      ]),
    );
    const items = repository.readAll().items;
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('v1-item');
    expect(items[0].cloud).toBeNull();
    expect(items[0].starred).toBe(true);
  });

  it('binds and clears the cloud binding without touching artwork facts', () => {
    repository.save({ name: 'A', envelope: ENVELOPE, thumbnail: 'thumb' });
    const bound = repository.bindCloud('local-1', BINDING);
    expect(bound.success).toBe(true);
    const item = repository.readById('local-1');
    expect(item?.cloud).toEqual(BINDING);
    expect(item?.thumbnail).toBe('thumb');

    const cleared = repository.bindCloud('local-1', null);
    expect(cleared.success).toBe(true);
    expect(repository.readById('local-1')?.cloud).toBeNull();
  });

  it('updateArtwork overwrites content in place but preserves binding and star', () => {
    repository.save({ name: 'A', envelope: ENVELOPE, thumbnail: 'old' });
    repository.toggleStar('local-1');
    repository.bindCloud('local-1', BINDING);

    const renamed = { ...ENVELOPE, document: { ...DEFAULT_FRACTAL_DOCUMENT, metadata: { name: 'B' } } };
    const updated = repository.updateArtwork('local-1', { name: 'B', envelope: renamed, thumbnail: 'new' });
    expect(updated.success).toBe(true);

    const item = repository.readById('local-1');
    expect(item?.name).toBe('B');
    expect(item?.thumbnail).toBe('new');
    expect(item?.starred).toBe(true);
    expect(item?.cloud).toEqual(BINDING);
    // The storage array still holds exactly one record (no duplicate row).
    const raw = JSON.parse(storage.getItem(ARTWORK_STORAGE_KEY) as string) as unknown[];
    expect(raw).toHaveLength(1);
  });

  it('updateArtwork rejects readonly-future envelopes', () => {
    repository.save({ name: 'A', envelope: ENVELOPE, thumbnail: '' });
    const future = {
      envelopeVersion: 1,
      document: { ...DEFAULT_FRACTAL_DOCUMENT, schemaVersion: 999 },
    };
    const result = repository.updateArtwork('local-1', { name: 'B', envelope: future as never, thumbnail: '' });
    expect(result.success).toBe(false);
  });

  it('rejects malformed bindings on read instead of trusting them', () => {
    storage.setItem(
      ARTWORK_STORAGE_KEY,
      JSON.stringify([
        {
          recordVersion: 2,
          id: 'x',
          name: 'X',
          envelope: ENVELOPE,
          createdAt: 1,
          thumbnail: '',
          starred: false,
          cloud: { draftId: 42, revision: 'three', syncedAt: 'yesterday' },
        },
      ]),
    );
    expect(repository.readAll().items[0].cloud).toBeNull();
  });
});
