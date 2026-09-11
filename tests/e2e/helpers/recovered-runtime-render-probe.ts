import { registerBuiltins } from '@/engine/plugins/builtins';
import { FractalRenderer } from '@/engine/fractals/renderer';
import { resolveFormulaReference } from '@/lib/formula-resolver';
import { resolvePublishedArtworkRuntime } from '@/lib/published-artwork-runtime';
import { buildPublishedArtworkCollection, buildPublishedArtworkPlayback } from '@/lib/published-artworks';
import presets from '../../../public/gallery-presets.json';

export async function probe(name: string) {
  registerBuiltins({ quiet: true });
  const artwork = buildPublishedArtworkCollection(presets, 'en').find(row => row.name === name)!;
  const playback = buildPublishedArtworkPlayback(artwork);
  const gallery = await resolvePublishedArtworkRuntime(playback);
  if (!gallery.ok || !gallery.value.formulaPlugin) throw new Error('gallery-resolution');
  const explore = resolveFormulaReference(playback.runtimeFormula!.runtimeId, []);
  if (!explore.success) throw new Error('explore-resolution');
  const canvas = document.createElement('canvas');
  canvas.width = 160; canvas.height = 100;
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
  if (!gl) throw new Error('webgl-unavailable');
  const native = new FractalRenderer(gl);
  const published = new FractalRenderer(gl, { formulaPlugin: gallery.value.formulaPlugin });
  const draw = async (canonical: boolean, isJulia: boolean, index: number, tiled = false) => {
    const base = canonical ? gallery.value.params : playback.params;
    const params = { ...base, formula: canonical ? base.formula : explore.plugin.id,
      isJulia, bounds: playback.animation.keyframes[index].bounds,
      maxIterations: 200, adaptiveIterations: false, useSSAA: false,
      ...(tiled ? { _tileInfo: { fullWidth: 160, fullHeight: 100, offsetX: 0, offsetY: 0 } } : {}),
    };
    if (!await (canonical ? published : native).render(params)) throw new Error('render-failed');
    const pixels = new Uint8Array(160 * 100 * 4);
    gl.readPixels(0, 0, 160, 100, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('webgl-error');
    return pixels;
  };
  const differences = (a: Uint8Array, b: Uint8Array) => a.reduce((sum, value, index) => sum + Number(value !== b[index]), 0);
  try {
    const differencesByMode = [];
    for (const isJulia of [false, true]) {
      for (let index = 0; index < playback.animation.keyframes.length; index++) {
        const frame = await draw(true, isJulia, index);
        differencesByMode.push(differences(frame, await draw(false, isJulia, index)));
        differencesByMode.push(differences(frame, await draw(true, isJulia, index, true)));
      }
    }
    return { differencesByMode, png: canvas.toDataURL() };
  } finally {
    native.dispose(); published.dispose();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
