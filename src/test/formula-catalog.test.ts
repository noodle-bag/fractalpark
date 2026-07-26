import { describe, it, expect, beforeAll } from 'vitest';
import {
  FORMULA_CATALOG,
  getDefaultBounds,
  getFormulaMetadata,
  getFormulaSelectionDefaults,
} from '@/engine/plugins/formula-catalog';
import { pluginRegistry } from '@/engine/plugins/registry';
import { registerBuiltins } from '@/engine/plugins/builtins/index';
import presetsFile from '../../public/gallery-presets.json';
import {
  buildFractalParamsFromPresetQuery,
  parseGalleryPresetsFile,
} from '@/lib/gallery-presets';

describe('Formula Catalog', () => {
  beforeAll(() => {
    registerBuiltins();
  });

  it('should provide metadata for every builtin formula', () => {
    const formulas = pluginRegistry.listFormulas();

    expect(FORMULA_CATALOG).toHaveLength(formulas.length);

    for (const formula of formulas) {
      const metadata = getFormulaMetadata(formula.id);

      expect(metadata, `missing metadata for ${formula.id}`).toBeDefined();
      expect(metadata?.id).toBe(formula.id);
      expect(metadata?.family).toBeTruthy();
      expect(metadata?.difficulty).toBeTruthy();
      expect(metadata?.description?.trim().length).toBeGreaterThan(0);
      expect(metadata?.defaultBounds.zoom).toBeGreaterThan(0);
    }
  });

  it('should not contain duplicate catalog entries', () => {
    const ids = FORMULA_CATALOG.map((metadata) => metadata.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('provides explicit profiles for every formula used by gallery presets', () => {
    const presetFormulaIds = new Set(
      parseGalleryPresetsFile(presetsFile).presets.map(
        (preset) => buildFractalParamsFromPresetQuery(preset.url).params.formula
      )
    );
    const missingProfiles = [...presetFormulaIds].filter(
      (formulaId) => !getFormulaMetadata(formulaId)?.defaultProfile
    );

    expect(presetFormulaIds.size).toBe(21);
    expect(missingProfiles).toEqual([]);
  });

  it('should classify burning ship and transcendental families distinctly', () => {
    expect(getFormulaMetadata('burningShip')?.family).toBe('burning-ship');
    expect(getFormulaMetadata('burningShipImag')?.family).toBe('burning-ship');
    expect(getFormulaMetadata('celticMandelbar')?.family).toBe('burning-ship');
    expect(getFormulaMetadata('expJulia')?.family).toBe('transcendental');
    expect(getFormulaMetadata('expMandelbrot')?.family).toBe('transcendental');
    expect(getFormulaMetadata('sineMandelb')?.family).toBe('transcendental');
    expect(getFormulaMetadata('cosJulia')?.family).toBe('transcendental');
  });

  it('should keep key descriptions specific and formula-correct', () => {
    expect(getFormulaMetadata('quarticMandelbrot')?.description).toBe('Quartic Mandelbrot (z^4 + c)');
    expect(getFormulaMetadata('chebyshev2')?.description).toContain('Chebyshev T2');
    expect(getFormulaMetadata('chebyshev3')?.description).toContain('Chebyshev T3');
    expect(getFormulaMetadata('chebyshev4')?.description).toContain('Chebyshev T4');
    expect(getFormulaMetadata('airship')?.description).toContain('Airship');
    expect(getFormulaMetadata('celticBurningShip')?.description).toContain('Celtic Burning Ship');
    expect(getFormulaMetadata('circleInversion')?.description).toContain('reciprocal quadratic');
    expect(getFormulaMetadata('cosMandelb')?.description).toContain('Cosine Mandelbrot');
    expect(getFormulaMetadata('rationalMap1')?.description).toContain('Rational map');
    expect(getFormulaMetadata('atanhMandelbrot')?.description).toContain('hyperbolic tangent');
    expect(getFormulaMetadata('cothJulia')?.description).toContain('Hyperbolic cotangent');
    expect(getFormulaMetadata('newton5')?.description).toContain('z^5 - 1');
    expect(getFormulaMetadata('novaSine')?.description).toContain('Nova-style sine');
    expect(getFormulaMetadata('novaClassic')?.description).toContain('Nova');
    expect(getFormulaMetadata('collatz')?.description).toContain('Collatz-inspired');
    expect(getFormulaMetadata('rings')?.description).toContain('reciprocal rings term');
  });

  it('should avoid generic template bounds for key catalog formulas', () => {
    expect(getFormulaMetadata('mandelbrot')?.defaultBounds).toEqual({
      centerX: -0.7231292093,
      centerY: -0.0331595167,
      zoom: 0.4,
      rotation: 1.57,
    });
    expect(getFormulaMetadata('burningShip')?.defaultBounds).toEqual({
      centerX: -1.7076963837,
      centerY: -0.037548424,
      zoom: 6.34,
      rotation: 3.1416,
    });
    expect(getFormulaMetadata('tricorn')?.defaultBounds).toEqual({
      centerX: -0.2481627018,
      centerY: 0.1162892546,
      zoom: 0.22,
    });
    expect(getFormulaMetadata('lambda')?.defaultBounds).toEqual({
      centerX: -0.0891190431,
      centerY: 0.1070002492,
      zoom: 0.24,
      rotation: 0,
    });
    expect(getFormulaMetadata('phoenix')?.defaultBounds).toEqual({ centerX: -0.35, centerY: 0, zoom: 0.55 });
    expect(getFormulaMetadata('quadJulia')?.defaultBounds).toEqual({
      centerX: 0,
      centerY: 0,
      zoom: 0.27,
      rotation: 0,
    });
    expect(getFormulaMetadata('cubicMandelbrot')?.defaultBounds).toEqual({ centerX: -0.15, centerY: 0, zoom: 0.55 });
    expect(getFormulaMetadata('quarticMandelbrot')?.defaultBounds).toEqual({ centerX: -0.1, centerY: 0, zoom: 0.6 });
    expect(getFormulaMetadata('mandelbox')?.defaultBounds).toEqual({
      centerX: 0,
      centerY: 0,
      zoom: 0.0481,
      rotation: 0,
    });
    expect(getFormulaMetadata('multicorn4')?.defaultBounds).toEqual({ centerX: -0.1, centerY: 0, zoom: 0.72 });
    expect(getFormulaMetadata('multicorn5')?.defaultBounds).toEqual({ centerX: -0.08, centerY: 0, zoom: 0.78 });
    expect(getFormulaMetadata('multicorn6')?.defaultBounds).toEqual({ centerX: -0.04, centerY: 0, zoom: 0.86 });
    expect(getFormulaMetadata('chebyshev2')?.defaultBounds).toEqual({ centerX: 0, centerY: 0, zoom: 0.78 });
    expect(getFormulaMetadata('chebyshev3')?.defaultBounds).toEqual({ centerX: -0.05, centerY: 0, zoom: 0.55 });
    expect(getFormulaMetadata('chebyshev4')?.defaultBounds).toEqual({ centerX: -0.02, centerY: 0, zoom: 0.7 });
    expect(getFormulaMetadata('perpendicularTricorn')?.defaultBounds).toEqual({ centerX: -0.45, centerY: 0, zoom: 0.28 });
    expect(getFormulaMetadata('perpendicularCeltic')?.defaultBounds).toEqual({
      centerX: -0.866069803,
      centerY: 0.0727679576,
      zoom: 0.45,
      rotation: 0,
    });
    expect(getFormulaMetadata('newton3')?.defaultBounds).toEqual({
      centerX: -0.1153994333,
      centerY: -0.0505423982,
      zoom: 0.56,
      rotation: 1.57,
    });
    expect(getFormulaMetadata('newton4')?.defaultBounds).toEqual({ centerX: 0.08, centerY: 0.08, zoom: 1.45 });
    expect(getFormulaMetadata('newtonSin')?.defaultBounds).toEqual({ centerX: 0.3, centerY: 0, zoom: 2.6 });
    expect(getFormulaMetadata('newtonCos')?.defaultBounds).toEqual({
      centerX: 8.4582681238,
      centerY: 0.1360182051,
      zoom: 0.11,
      rotation: 1.57,
    });
    expect(getFormulaMetadata('newton5')?.defaultBounds).toEqual({ centerX: 0, centerY: 0, zoom: 1.6 });
    expect(getFormulaMetadata('newtonSinh')?.defaultBounds).toEqual({ centerX: 0, centerY: 0, zoom: 1.8 });
    expect(getFormulaMetadata('newtonCosh')?.defaultBounds).toEqual({
      centerX: -0.0550671554,
      centerY: -3.1236598929,
      zoom: 0.17,
      rotation: 0,
    });
    expect(getFormulaMetadata('newtonExp')?.defaultBounds).toEqual({ centerX: 0, centerY: 0, zoom: 2 });
    expect(getFormulaMetadata('magnet1')?.defaultBounds).toEqual({
      centerX: 0,
      centerY: 0,
      zoom: 0.71,
      rotation: 1.57,
    });
    expect(getFormulaMetadata('magnet2')?.defaultBounds).toEqual({
      centerX: 9.2552403613,
      centerY: 0.5705914887,
      zoom: 0.0516,
      rotation: 0,
    });
    expect(getFormulaMetadata('phoenixMulti')?.defaultBounds).toEqual({
      centerX: -0.4402391627,
      centerY: -0.0091735985,
      zoom: 0.55,
      rotation: 1.57,
    });
    expect(getFormulaMetadata('collatz')?.defaultBounds).toEqual({ centerX: 0.25, centerY: 0.1, zoom: 2.4 });
    expect(getFormulaMetadata('spider')?.defaultBounds).toEqual({
      centerX: -0.0641099807,
      centerY: 0.0589811822,
      zoom: 0.4,
      rotation: 0,
    });
    expect(getFormulaMetadata('zaslavskyMap')?.defaultBounds).toEqual({
      centerX: -0.0036386858,
      centerY: -0.0036407475,
      zoom: 4,
      rotation: 0,
    });
    expect(getFormulaMetadata('zubieta')?.defaultBounds).toEqual({
      centerX: 0,
      centerY: 0,
      zoom: 0.41,
      rotation: 1.04,
    });
    expect(getFormulaMetadata('buffalo')?.defaultBounds).toEqual({
      centerX: -0.4320041803,
      centerY: -0.0265553773,
      zoom: 0.53,
      rotation: 1.57,
    });
    expect(getFormulaMetadata('expJulia')?.defaultBounds).toEqual({ centerX: -0.2, centerY: 0.15, zoom: 2.2 });
    expect(getFormulaMetadata('cosMandelb')?.defaultBounds).toEqual({ centerX: -1.2, centerY: 0, zoom: 0.25 });
    expect(getFormulaMetadata('expMandelbrot')?.defaultBounds).toEqual({ centerX: -0.3, centerY: 0, zoom: 1.6 });
    expect(getFormulaMetadata('sineMandelb')?.defaultBounds).toEqual({ centerX: -0.25, centerY: 0.12, zoom: 1.25 });
    expect(getFormulaMetadata('sineJulia')?.defaultBounds).toEqual({ centerX: 0.1, centerY: 0.12, zoom: 1.25 });
    expect(getFormulaMetadata('coshMandelb')?.defaultBounds).toEqual({
      centerX: -1.0953073803,
      centerY: -0.1848506655,
      zoom: 0.0694,
      rotation: 1.57,
    });
    expect(getFormulaMetadata('sinhMandelb')?.defaultBounds).toEqual({ centerX: -0.16, centerY: 0, zoom: 1.15 });
    expect(getFormulaMetadata('coshJulia')?.defaultBounds).toEqual({ centerX: 0.08, centerY: 0.14, zoom: 1.22 });
    expect(getFormulaMetadata('coshSinh')?.defaultBounds).toEqual({ centerX: 0, centerY: 0, zoom: 1.05 });
    expect(getFormulaMetadata('cosJulia')?.defaultBounds).toEqual({ centerX: 0.12, centerY: 0.18, zoom: 1.3 });
    expect(getFormulaMetadata('tanJulia')?.defaultBounds).toEqual({ centerX: 0.22, centerY: 0, zoom: 1.35 });
    expect(getFormulaMetadata('sinhJulia')?.defaultBounds).toEqual({ centerX: -0.18, centerY: 0.08, zoom: 1.25 });
    expect(getFormulaMetadata('biomorph')?.defaultBounds).toEqual({ centerX: -0.1, centerY: 0, zoom: 0.6 });
    expect(getFormulaMetadata('logistic')?.defaultBounds).toEqual({ centerX: 0, centerY: 0, zoom: 0.4 });
    expect(getFormulaMetadata('celticMandelbar')?.defaultBounds).toEqual({ centerX: -0.22, centerY: 0, zoom: 0.75 });
    expect(getFormulaMetadata('airship')?.defaultBounds).toEqual({
      centerX: -1.8875527835,
      centerY: 0.0131684739,
      zoom: 2.06,
      rotation: 3.1416,
    });
    expect(getFormulaMetadata('celticBurningShip')?.defaultBounds).toEqual({ centerX: -0.42, centerY: -0.18, zoom: 0.48 });
    expect(getFormulaMetadata('rationalMap1')?.defaultBounds).toEqual({
      centerX: 0.9567357576,
      centerY: 0.5114069535,
      zoom: 0.78,
      rotation: 2.09,
    });
    expect(getFormulaMetadata('atanhMandelbrot')?.defaultBounds).toEqual({ centerX: -0.12, centerY: 0, zoom: 1.22 });
    expect(getFormulaMetadata('rationalMap2')?.defaultBounds).toEqual({ centerX: -0.06, centerY: 0, zoom: 0.66 });
    expect(getFormulaMetadata('mcMullen23')?.defaultBounds).toEqual({
      centerX: -0.0025848194,
      centerY: -0.025641942,
      zoom: 0.4,
      rotation: 1.57,
    });
    expect(getFormulaMetadata('invertedLambda')?.defaultBounds).toEqual({
      centerX: -1.6265585674,
      centerY: -0.0012993735,
      zoom: 14.02,
      rotation: 1.57,
    });
    expect(getFormulaMetadata('tetration')?.defaultBounds).toEqual({ centerX: 0.18, centerY: 0, zoom: 1.15 });
    expect(getFormulaMetadata('circleInversion')?.defaultBounds).toEqual({
      centerX: -0.0535247115,
      centerY: -0.0033777731,
      zoom: 3.95,
      rotation: 0,
    });
    expect(getFormulaMetadata('frothyBasin')?.defaultBounds).toEqual({ centerX: 0, centerY: 0, zoom: 0.55 });
    expect(getFormulaMetadata('simonBrot')?.defaultBounds).toEqual({ centerX: -0.1, centerY: 0, zoom: 0.58 });
    expect(getFormulaMetadata('cothJulia')?.defaultBounds).toEqual({ centerX: 0, centerY: 0, zoom: 0.78 });
    expect(getFormulaMetadata('chebyshev6')).toBeUndefined();
    expect(getFormulaMetadata('multicorn8')).toBeUndefined();
    expect(getFormulaMetadata('burningShipQuintic')).toBeUndefined();
    expect(getFormulaMetadata('mcMullen24')).toBeUndefined();
    expect(getFormulaMetadata('rationalMap3')).toBeUndefined();
    expect(getFormulaMetadata('tanhMandelbrot')).toBeUndefined();
    expect(getFormulaMetadata('tanMandelb')).toBeUndefined();
    expect(getFormulaMetadata('duck')).toBeUndefined();
  });

  it('should return fallback bounds for unknown formulas', () => {
    expect(getDefaultBounds('unknown-formula')).toEqual({
      centerX: -0.5,
      centerY: 0,
      zoom: 0.4,
    });
  });

  it('provides the URL-derived formula and coloring defaults for Tricorn', () => {
    expect(getFormulaMetadata('tricorn')?.defaultProfile).toEqual({
      formula: {
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived formula and coloring defaults for Mandelbrot', () => {
    expect(getFormulaMetadata('mandelbrot')?.defaultProfile).toEqual({
      formula: {
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived formula and coloring defaults for Burning Ship', () => {
    expect(getFormulaMetadata('burningShip')?.defaultProfile).toEqual({
      formula: {
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 8,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived formula and coloring defaults for Quad Julia', () => {
    expect(getFormulaMetadata('quadJulia')?.defaultProfile).toEqual({
      formula: {
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived formula and coloring defaults for Mandelbox', () => {
    expect(getFormulaMetadata('mandelbox')?.defaultProfile).toEqual({
      formula: {
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 10,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived formula and coloring defaults for Perpendicular Celtic', () => {
    expect(getFormulaMetadata('perpendicularCeltic')?.defaultProfile).toEqual({
      formula: {
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 9,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived formula and coloring defaults for Airship', () => {
    expect(getFormulaMetadata('airship')?.defaultProfile).toEqual({
      formula: {
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 1,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived formula and coloring defaults for Newton 3', () => {
    expect(getFormulaMetadata('newton3')?.defaultProfile).toEqual({
      formula: {
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived formula and coloring defaults for Newton Cos', () => {
    expect(getFormulaMetadata('newtonCos')?.defaultProfile).toEqual({
      formula: {
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived Julia formula and coloring defaults for Magnet 1', () => {
    expect(getFormulaMetadata('magnet1')?.defaultProfile).toEqual({
      formula: {
        isJulia: true,
        juliaC: [-0.274821, 0.219727],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived formula and coloring defaults for Magnet 2', () => {
    expect(getFormulaMetadata('magnet2')?.defaultProfile).toEqual({
      formula: {
        isJulia: false,
        juliaC: [-0.274821, 0.219727],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 16,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived formula and coloring defaults for Phoenix Multi', () => {
    expect(getFormulaMetadata('phoenixMulti')?.defaultProfile).toEqual({
      formula: {
        isJulia: false,
        juliaC: [-0.274821, 0.219727],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 5,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
    expect(getFormulaMetadata('phoenixMulti')?.thumbnailParams).toEqual({ u_phoenixMultiP: 0.5 });
  });

  it('provides the URL-derived formula and coloring defaults for Cosh Mandelbrot', () => {
    expect(getFormulaMetadata('coshMandelb')?.defaultProfile).toEqual({
      formula: {
        isJulia: false,
        juliaC: [-0.274821, 0.219727],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived Julia formula and coloring defaults for Buffalo', () => {
    expect(getFormulaMetadata('buffalo')?.defaultProfile).toEqual({
      formula: {
        isJulia: true,
        juliaC: [-0.63273, 0.811849],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 8,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived formula and coloring defaults for Circle Inversion', () => {
    expect(getFormulaMetadata('circleInversion')?.defaultProfile).toEqual({
      formula: {
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 2,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived formula and coloring defaults for Inverted Lambda', () => {
    expect(getFormulaMetadata('invertedLambda')?.defaultProfile).toEqual({
      formula: {
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived Julia formula and coloring defaults for McMullen 2/3', () => {
    expect(getFormulaMetadata('mcMullen23')?.defaultProfile).toEqual({
      formula: {
        isJulia: true,
        juliaC: [-0.063151, 0.00472],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 10,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived Julia formula and coloring defaults for Rational Map 1', () => {
    expect(getFormulaMetadata('rationalMap1')?.defaultProfile).toEqual({
      formula: {
        isJulia: true,
        juliaC: [-1.234701, -0.64152],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived Julia formula and coloring defaults for Spider', () => {
    expect(getFormulaMetadata('spider')?.defaultProfile).toEqual({
      formula: {
        isJulia: true,
        juliaC: [-0.067463, 0.253011],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 10,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'atomDomain',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived formula and coloring defaults for Zaslavsky Map', () => {
    expect(getFormulaMetadata('zaslavskyMap')?.defaultProfile).toEqual({
      formula: {
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 10,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived Julia formula and coloring defaults for Zubieta', () => {
    expect(getFormulaMetadata('zubieta')?.defaultProfile).toEqual({
      formula: {
        isJulia: true,
        juliaC: [0.344158, -0.508382],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived formula and coloring defaults for Newton Cosh', () => {
    expect(getFormulaMetadata('newtonCosh')?.defaultProfile).toEqual({
      formula: {
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('provides the URL-derived formula and coloring defaults for Lambda', () => {
    expect(getFormulaMetadata('lambda')?.defaultProfile).toEqual({
      formula: {
        isJulia: false,
        juliaC: [-1.309408, 1.183512],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        pipelineVersion: 1,
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        orbitTrap: {
          shape: 'point',
          point: [0, 0],
          radius: 0.35,
          width: 0.02,
        },
        lighting: {
          enabled: false,
          mode: 'normalMap',
          azimuth: 45,
          elevation: 35,
          intensity: 0.65,
        },
        params: {
          outside: {},
          inside: {},
        },
      },
    });
  });

  it('builds clearing patches for explicit profiles and preserves fallback behavior', () => {
    expect(getFormulaSelectionDefaults('burningShip')).toMatchObject({
      bounds: { centerX: -1.7076963837, centerY: -0.037548424, zoom: 6.34, rotation: 3.1416 },
      formula: {
        formulaId: 'burningShip',
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 8,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('tricorn')).toMatchObject({
      bounds: { centerX: -0.2481627018, centerY: 0.1162892546, zoom: 0.22 },
      formula: {
        formulaId: 'tricorn',
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('quadJulia')).toMatchObject({
      bounds: { centerX: 0, centerY: 0, zoom: 0.27, rotation: 0 },
      formula: {
        formulaId: 'quadJulia',
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('mandelbox')).toMatchObject({
      bounds: { centerX: 0, centerY: 0, zoom: 0.0481, rotation: 0 },
      formula: {
        formulaId: 'mandelbox',
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 10,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('perpendicularCeltic')).toMatchObject({
      bounds: { centerX: -0.866069803, centerY: 0.0727679576, zoom: 0.45, rotation: 0 },
      formula: {
        formulaId: 'perpendicularCeltic',
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 9,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('airship')).toMatchObject({
      bounds: { centerX: -1.8875527835, centerY: 0.0131684739, zoom: 2.06, rotation: 3.1416 },
      formula: {
        formulaId: 'airship',
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 1,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('newton3')).toMatchObject({
      bounds: { centerX: -0.1153994333, centerY: -0.0505423982, zoom: 0.56, rotation: 1.57 },
      formula: {
        formulaId: 'newton3',
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('newtonCos')).toMatchObject({
      bounds: { centerX: 8.4582681238, centerY: 0.1360182051, zoom: 0.11, rotation: 1.57 },
      formula: {
        formulaId: 'newtonCos',
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('magnet1')).toMatchObject({
      bounds: { centerX: 0, centerY: 0, zoom: 0.71, rotation: 1.57 },
      formula: {
        formulaId: 'magnet1',
        isJulia: true,
        juliaC: [-0.274821, 0.219727],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('magnet2')).toMatchObject({
      bounds: { centerX: 9.2552403613, centerY: 0.5705914887, zoom: 0.0516, rotation: 0 },
      formula: {
        formulaId: 'magnet2',
        isJulia: false,
        juliaC: [-0.274821, 0.219727],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 16,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('phoenixMulti')).toMatchObject({
      bounds: { centerX: -0.4402391627, centerY: -0.0091735985, zoom: 0.55, rotation: 1.57 },
      formula: {
        formulaId: 'phoenixMulti',
        isJulia: false,
        juliaC: [-0.274821, 0.219727],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 5,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('coshMandelb')).toMatchObject({
      bounds: { centerX: -1.0953073803, centerY: -0.1848506655, zoom: 0.0694, rotation: 1.57 },
      formula: {
        formulaId: 'coshMandelb',
        isJulia: false,
        juliaC: [-0.274821, 0.219727],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('buffalo')).toMatchObject({
      bounds: { centerX: -0.4320041803, centerY: -0.0265553773, zoom: 0.53, rotation: 1.57 },
      formula: {
        formulaId: 'buffalo',
        isJulia: true,
        juliaC: [-0.63273, 0.811849],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 8,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('circleInversion')).toMatchObject({
      bounds: { centerX: -0.0535247115, centerY: -0.0033777731, zoom: 3.95, rotation: 0 },
      formula: {
        formulaId: 'circleInversion',
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 2,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('invertedLambda')).toMatchObject({
      bounds: { centerX: -1.6265585674, centerY: -0.0012993735, zoom: 14.02, rotation: 1.57 },
      formula: {
        formulaId: 'invertedLambda',
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('mcMullen23')).toMatchObject({
      bounds: { centerX: -0.0025848194, centerY: -0.025641942, zoom: 0.4, rotation: 1.57 },
      formula: {
        formulaId: 'mcMullen23',
        isJulia: true,
        juliaC: [-0.063151, 0.00472],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 10,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('rationalMap1')).toMatchObject({
      bounds: { centerX: 0.9567357576, centerY: 0.5114069535, zoom: 0.78, rotation: 2.09 },
      formula: {
        formulaId: 'rationalMap1',
        isJulia: true,
        juliaC: [-1.234701, -0.64152],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('spider')).toMatchObject({
      bounds: { centerX: -0.0641099807, centerY: 0.0589811822, zoom: 0.4, rotation: 0 },
      formula: {
        formulaId: 'spider',
        isJulia: true,
        juliaC: [-0.067463, 0.253011],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 10,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'atomDomain',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('zaslavskyMap')).toMatchObject({
      bounds: { centerX: -0.0036386858, centerY: -0.0036407475, zoom: 4, rotation: 0 },
      formula: {
        formulaId: 'zaslavskyMap',
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 10,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('zubieta')).toMatchObject({
      bounds: { centerX: 0, centerY: 0, zoom: 0.41, rotation: 1.04 },
      formula: {
        formulaId: 'zubieta',
        isJulia: true,
        juliaC: [0.344158, -0.508382],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('newtonCosh')).toMatchObject({
      bounds: { centerX: -0.0550671554, centerY: -3.1236598929, zoom: 0.17, rotation: 0 },
      formula: {
        formulaId: 'newtonCosh',
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('lambda')).toMatchObject({
      bounds: { centerX: -0.0891190431, centerY: 0.1070002492, zoom: 0.24, rotation: 0 },
      formula: {
        formulaId: 'lambda',
        isJulia: false,
        juliaC: [-1.309408, 1.183512],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('mandelbrot')).toMatchObject({
      bounds: { centerX: -0.7231292093, centerY: -0.0331595167, zoom: 0.4, rotation: 1.57 },
      formula: {
        formulaId: 'mandelbrot',
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        params: { formula: {} },
      },
      coloring: {
        paletteIndex: 0,
        customGradient: null,
        outsideColoringId: 'smooth',
        insideColoringId: 'black',
        params: {
          outside: {},
          inside: {},
          coloringScript: {},
        },
      },
    });

    expect(getFormulaSelectionDefaults('phoenix')).toEqual({
      bounds: { centerX: -0.35, centerY: 0, zoom: 0.55 },
      formula: { formulaId: 'phoenix' },
    });
  });
});
