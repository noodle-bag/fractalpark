import { describe, expect, it } from 'vitest';

import type { FractalDocument } from '@/engine/document';
import {
  getArtworkAnalyticsContext,
  getProjectFileSizeBucket,
} from '@/lib/artwork-analytics';
import documentV2 from './fixtures/documents/document-v2.json';

describe('artwork analytics', () => {
  it('reports document version and formula kind without exposing formula source', () => {
    const builtin = structuredClone(documentV2) as unknown as FractalDocument;
    const custom = {
      ...builtin,
      formula: { ...builtin.formula, formulaId: 'custom-private-formula' },
    };

    expect(getArtworkAnalyticsContext(builtin)).toEqual({
      document_version: 2,
      formula_kind: 'builtin',
    });
    expect(getArtworkAnalyticsContext(custom)).toEqual({
      document_version: 2,
      formula_kind: 'custom',
    });
  });

  it('uses stable coarse file-size buckets', () => {
    expect(getProjectFileSizeBucket(1024)).toBe('under-64-kib');
    expect(getProjectFileSizeBucket(64 * 1024)).toBe('64-to-256-kib');
    expect(getProjectFileSizeBucket(256 * 1024)).toBe('256-kib-to-1-mib');
    expect(getProjectFileSizeBucket(1024 * 1024 + 1)).toBe('over-1-mib');
  });
});
