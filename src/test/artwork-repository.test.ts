import { beforeEach, describe, expect, it } from 'vitest';

import type { FractalDocumentEnvelopeV1 } from '@/engine/document-envelope';
import {
  ARTWORK_STORAGE_KEY,
  ArtworkRepository,
  LEGACY_ARTWORK_STORAGE_KEY,
  type StoredArtworkRecordV1,
} from '@/lib/artwork-repository';
import envelopeFixture from './fixtures/documents/envelope-v1.json';
import legacyFixture from './fixtures/documents/legacy-saved-fractal.json';

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  failWrites = false;

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    }
    this.values.set(key, value);
  }
}

const ENVELOPE = envelopeFixture as unknown as FractalDocumentEnvelopeV1;

function currentRecord(
  overrides: Partial<StoredArtworkRecordV1> = {}
): StoredArtworkRecordV1 {
  return {
    recordVersion: 1,
    id: 'document-1',
    name: 'Document Artwork',
    envelope: ENVELOPE,
    createdAt: 200,
    updatedAt: 250,
    thumbnail: 'data:image/jpeg;base64,document',
    starred: false,
    ...overrides,
  };
}

describe('ArtworkRepository', () => {
  let storage: MemoryStorage;
  let repository: ArtworkRepository;

  beforeEach(() => {
    storage = new MemoryStorage();
    repository = new ArtworkRepository({
      storage,
      createId: () => 'new-artwork-id',
      now: () => 500,
    });
  });

  it('dual-reads legacy and Document records into one sorted model', () => {
    storage.setItem(
      LEGACY_ARTWORK_STORAGE_KEY,
      JSON.stringify([{ ...legacyFixture, starred: true, createdAt: 100 }])
    );
    storage.setItem(
      ARTWORK_STORAGE_KEY,
      JSON.stringify([
        currentRecord(),
        currentRecord({
          id: 'document-newer',
          name: 'Newer Document',
          createdAt: 300,
          updatedAt: 400,
        }),
      ])
    );

    const snapshot = repository.readAll();

    expect(snapshot.errors).toEqual([]);
    expect(snapshot.items.map((item) => item.id)).toEqual([
      'legacy-saved-1',
      'document-newer',
      'document-1',
    ]);
    expect(snapshot.items[0]).toMatchObject({
      storageFormat: 'legacy',
      readOnly: false,
    });
    expect(snapshot.items[1]).toMatchObject({
      storageFormat: 'document',
      readOnly: false,
      params: { formula: 'custom-fixture' },
    });
  });

  it('writes new artwork only to the current key and preserves the legacy key', () => {
    const legacyJson = JSON.stringify([legacyFixture]);
    storage.setItem(LEGACY_ARTWORK_STORAGE_KEY, legacyJson);

    const result = repository.save({
      name: 'New Artwork',
      envelope: ENVELOPE,
      thumbnail: 'data:image/jpeg;base64,new',
    });

    expect(result.success).toBe(true);
    expect(storage.getItem(LEGACY_ARTWORK_STORAGE_KEY)).toBe(legacyJson);
    const stored = JSON.parse(storage.getItem(ARTWORK_STORAGE_KEY) ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      recordVersion: 1,
      id: 'new-artwork-id',
      name: 'New Artwork',
      createdAt: 500,
      updatedAt: 500,
      starred: false,
      envelope: {
        envelopeVersion: 1,
        document: {
          schemaVersion: 2,
          metadata: {
            name: 'New Artwork',
            createdAt: 500,
            updatedAt: 500,
            source: 'saved',
          },
        },
      },
    });
  });

  it('updates records in their original storage keys without migrating them', () => {
    storage.setItem(LEGACY_ARTWORK_STORAGE_KEY, JSON.stringify([legacyFixture]));
    storage.setItem(ARTWORK_STORAGE_KEY, JSON.stringify([currentRecord()]));

    expect(repository.rename('legacy-saved-1', 'Renamed Legacy').success).toBe(true);
    expect(repository.toggleStar('document-1').success).toBe(true);

    const legacy = JSON.parse(storage.getItem(LEGACY_ARTWORK_STORAGE_KEY) ?? '[]');
    const current = JSON.parse(storage.getItem(ARTWORK_STORAGE_KEY) ?? '[]');
    expect(legacy[0].name).toBe('Renamed Legacy');
    expect(legacy[0]).not.toHaveProperty('recordVersion');
    expect(current[0].starred).toBe(true);
    expect(current[0].updatedAt).toBe(500);
  });

  it('removes only the explicitly selected legacy item', () => {
    storage.setItem(
      LEGACY_ARTWORK_STORAGE_KEY,
      JSON.stringify([legacyFixture, { ...legacyFixture, id: 'legacy-keep' }])
    );

    expect(repository.remove('legacy-saved-1').success).toBe(true);
    expect(JSON.parse(storage.getItem(LEGACY_ARTWORK_STORAGE_KEY) ?? '[]')).toEqual([
      expect.objectContaining({ id: 'legacy-keep' }),
    ]);
    expect(storage.getItem(ARTWORK_STORAGE_KEY)).toBeNull();
  });

  it('reports quota errors without exposing a successful save or changing storage', () => {
    storage.setItem(ARTWORK_STORAGE_KEY, JSON.stringify([currentRecord()]));
    const before = storage.getItem(ARTWORK_STORAGE_KEY);
    storage.failWrites = true;

    const result = repository.save({
      name: 'Will Fail',
      envelope: ENVELOPE,
      thumbnail: '',
    });

    expect(result).toMatchObject({
      success: false,
      errors: [{ code: 'quota-exceeded', key: ARTWORK_STORAGE_KEY }],
    });
    expect(storage.getItem(ARTWORK_STORAGE_KEY)).toBe(before);
  });

  it('returns read warnings for malformed records while preserving valid items', () => {
    storage.setItem(LEGACY_ARTWORK_STORAGE_KEY, '{broken');
    storage.setItem(
      ARTWORK_STORAGE_KEY,
      JSON.stringify([{ invalid: true }, currentRecord()])
    );

    const snapshot = repository.readAll();

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid-storage-data' }),
        expect.objectContaining({ code: 'invalid-artwork' }),
      ])
    );
  });

  it('projects future documents as readonly without rewriting their raw envelope', () => {
    const futureRecord = structuredClone(currentRecord()) as unknown as Record<string, unknown>;
    const envelope = futureRecord.envelope as Record<string, unknown>;
    const document = envelope.document as Record<string, unknown>;
    document.schemaVersion = 3;
    document.futureField = { preserved: true };
    storage.setItem(ARTWORK_STORAGE_KEY, JSON.stringify([futureRecord]));
    const before = storage.getItem(ARTWORK_STORAGE_KEY);

    const item = repository.readById('document-1');

    expect(item).toMatchObject({
      id: 'document-1',
      readOnly: true,
      document: { schemaVersion: 2 },
    });
    expect(storage.getItem(ARTWORK_STORAGE_KEY)).toBe(before);
  });

  it('prefers the current Document record if a legacy ID collides', () => {
    storage.setItem(
      LEGACY_ARTWORK_STORAGE_KEY,
      JSON.stringify([{ ...legacyFixture, id: 'shared-id' }])
    );
    storage.setItem(
      ARTWORK_STORAGE_KEY,
      JSON.stringify([currentRecord({ id: 'shared-id' })])
    );

    expect(repository.readById('shared-id')?.storageFormat).toBe('document');
  });
});
