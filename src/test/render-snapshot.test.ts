import { describe, expect, it } from 'vitest';

import type { FractalDocument } from '@/engine/document';
import { createRenderSnapshot } from '@/engine/render-snapshot';
import documentV2 from './fixtures/documents/document-v2.json';

describe('render snapshots', () => {
  it('projects a document and applies export-only overrides without mutation', () => {
    const document = structuredClone(documentV2) as unknown as FractalDocument;
    const before = structuredClone(document);

    const snapshot = createRenderSnapshot(document, {
      maxIterations: 725,
      useSSAA: true,
      ssaaLevel: 9,
    });

    expect(snapshot).toMatchObject({
      formula: document.formula.formulaId,
      bounds: document.scene.bounds,
      paletteIndex: document.coloring.paletteIndex,
      maxIterations: 725,
      useSSAA: true,
      ssaaLevel: 9,
    });
    expect(document).toEqual(before);
    expect(document.render.maxIterations).not.toBe(snapshot.maxIterations);
  });
});
