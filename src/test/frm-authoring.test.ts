import { describe, expect, it } from 'vitest';
import {
  formulaMetadataToExperienceHint,
  mergeFormulaExperienceHints,
} from '@/engine/frm/authoring';
import type { FormulaMetadata } from '@/engine/frm/ast';

describe('FRM authoring bridges', () => {
  it('maps FormulaMetadata default view and coloring into experience hints', () => {
    const metadata: FormulaMetadata = {
      dialect: 'myfrac-native',
      defaultView: {
        centerX: -0.7435,
        centerY: 0.1314,
        zoom: 88,
        rotation: 0.2,
      },
      defaultColoringHint: {
        outsideColoringId: 'orbitEcho',
        insideColoringId: 'finalOrbit',
        paletteIndex: 4,
      },
    };

    expect(formulaMetadataToExperienceHint(metadata)).toEqual({
      bounds: {
        centerX: -0.7435,
        centerY: 0.1314,
        zoom: 88,
        rotation: 0.2,
      },
      coloring: {
        outsideColoringId: 'orbitEcho',
        insideColoringId: 'finalOrbit',
        paletteIndex: 4,
      },
    });
  });

  it('prefers explicit experience hints over metadata fallback values', () => {
    const merged = mergeFormulaExperienceHints(
      {
        bounds: {
          centerX: -0.5,
          centerY: 0,
          zoom: 0.4,
          rotation: 0,
        },
        coloring: {
          outsideColoringId: 'smooth',
        },
      },
      {
        bounds: {
          centerX: -0.7435,
          centerY: 0.1314,
          zoom: 88,
          rotation: 0.2,
        },
        coloring: {
          outsideColoringId: 'orbitEcho',
          insideColoringId: 'finalOrbit',
          paletteIndex: 4,
        },
      },
    );

    expect(merged).toEqual({
      bounds: {
        centerX: -0.5,
        centerY: 0,
        zoom: 0.4,
        rotation: 0,
      },
      coloring: {
        outsideColoringId: 'smooth',
        insideColoringId: 'finalOrbit',
        paletteIndex: 4,
      },
    });
  });

  it('falls back to metadata-only partial fields when explicit hint omits them', () => {
    const merged = mergeFormulaExperienceHints(
      {
        coloring: {
          paletteIndex: 2,
        },
      },
      {
        bounds: {
          centerX: -0.2,
          centerY: 0.05,
          zoom: 3,
          rotation: 0,
        },
        coloring: {
          outsideColoringId: 'orbitEcho',
          insideColoringId: 'finalOrbit',
          paletteIndex: 4,
        },
      },
    );

    expect(merged).toEqual({
      bounds: {
        centerX: -0.2,
        centerY: 0.05,
        zoom: 3,
        rotation: 0,
      },
      coloring: {
        outsideColoringId: 'orbitEcho',
        insideColoringId: 'finalOrbit',
        paletteIndex: 2,
      },
    });
  });
});
