import { describe, expect, it } from 'vitest';
import { docFromPreset, docFromSaved, docFromUrl, docToUrl } from '@/cli/doc-commands';
import type { SavedFractal } from '@/engine/types';

describe('myfrac cli doc commands', () => {
  it('builds a normalized document from a full explore URL', () => {
    const result = docFromUrl({
      url: 'https://fractalpark.com/zh/explore?cx=-0.5&cy=0.25&z=12.5&fm=burningShip&oc=st&julia=1&jre=-0.62&jim=0.41',
    });

    expect(result.ok).toBe(true);
    expect(result.data.document.scene.bounds.centerX).toBeCloseTo(-0.5, 10);
    expect(result.data.document.formula.formulaId).toBe('burningShip');
    expect(result.data.document.formula.isJulia).toBe(true);
    expect(result.data.document.coloring.outsideColoringId).toBe('stripe');
    expect(result.data.source.query).toContain('cx=-0.5');
  });

  it('round-trips document to canonical href and query', () => {
    const fromUrl = docFromUrl({
      query: 'cx=-0.5&cy=0.25&z=12.5&fm=burningShip&oc=st&julia=1&jre=-0.62&jim=0.41',
    });

    const toUrl = docToUrl({
      document: fromUrl.data.document,
      locale: 'en',
      baseUrl: 'https://fractalpark.com',
    });

    expect(toUrl.ok).toBe(true);
    expect(toUrl.data.href.startsWith('/en/explore?')).toBe(true);
    expect(toUrl.data.url.startsWith('https://fractalpark.com/en/explore?')).toBe(true);
    expect(toUrl.data.query).toContain('fm=bs');
    expect(toUrl.data.query).toContain('oc=st');
  });

  it('loads a preset document from gallery-presets.json', () => {
    const result = docFromPreset({
      id: 'preset-newton-deep-spiral',
    });

    expect(result.ok).toBe(true);
    expect(result.data.source.type).toBe('preset');
    expect(result.data.source.id).toBe('preset-newton-deep-spiral');
    expect(result.data.document.formula.formulaId).toBeTruthy();
  });

  it('accepts legacy saved fractal payloads', () => {
    const saved: SavedFractal = {
      id: 'saved-1',
      name: 'Saved',
      params: {
        maxIterations: 300,
        paletteIndex: 2,
        bounds: { centerX: -0.25, centerY: 0.1, zoom: 3, rotation: 0.2 },
        isJulia: false,
        juliaC: [-0.7, 0.27],
        power: 2,
        customGradient: null,
        formula: 'mandelbrot',
        outsideColoring: 'smooth',
        insideColoring: 'black',
        transformId: 'none',
        pluginParams: {},
        orbitTrap: { shape: 'point', point: [0, 0], radius: 0.35, width: 0.02 },
        useSSAA: false,
        adaptiveIterations: false,
        lighting: { enabled: false, mode: 'normalMap', azimuth: 45, elevation: 35, intensity: 0.65 },
      },
      createdAt: 1,
      thumbnail: '',
      starred: false,
      animation: {
        keyframes: [
          { id: 'a', bounds: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 } },
          { id: 'b', bounds: { centerX: 0.5, centerY: -0.5, zoom: 4, rotation: 0.3 } },
        ],
      },
    };

    const result = docFromSaved({ payload: saved });

    expect(result.ok).toBe(true);
    expect(result.data.source.sourceFormat).toBe('saved-fractal');
    expect(result.data.document.metadata?.name).toBe('Saved');
    expect(result.data.document.animation?.keyframes).toHaveLength(2);
  });

  it('accepts FractalDocument payloads for from-saved', () => {
    const fromUrl = docFromUrl({ query: 'cx=-0.5&cy=0.25&z=12.5&fm=burningShip' });
    const result = docFromSaved({ payload: fromUrl.data.document });

    expect(result.ok).toBe(true);
    expect(result.data.source.sourceFormat).toBe('document');
    expect(result.data.document.formula.formulaId).toBe('burningShip');
  });

  it('rejects invalid explore URLs', () => {
    try {
      docFromUrl({ url: 'not-a-url' });
      throw new Error('Expected docFromUrl to throw.');
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_URL' });
    }
  });

  it('requires locale for doc to-url', () => {
    const fromUrl = docFromUrl({ query: 'cx=-0.5&cy=0.25&z=12.5&fm=burningShip' });

    try {
      docToUrl({
        document: fromUrl.data.document,
        locale: '',
      });
      throw new Error('Expected docToUrl to throw.');
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_INPUT' });
    }
  });

  it('reports preset not found for unknown preset ids', () => {
    try {
      docFromPreset({
        id: 'preset-does-not-exist',
      });
      throw new Error('Expected docFromPreset to throw.');
    } catch (error) {
      expect(error).toMatchObject({ code: 'PRESET_NOT_FOUND' });
    }
  });
});
