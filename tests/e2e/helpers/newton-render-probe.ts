import { registerBuiltins } from '@/engine/plugins/builtins';
import { newtonCoshPlugin } from '@/engine/plugins/builtins/formulas/newtonCosh';
import { FractalRenderer } from '@/engine/fractals/renderer';
import { buildTimeline, totalDuration, interpolateAtTime } from '@/engine/animation/interpolate';
import { resolveFormulaReference } from '@/lib/formula-resolver';
import { resolvePublishedArtworkRuntime } from '@/lib/published-artwork-runtime';
import { buildPublishedArtworkCollection, buildPublishedArtworkPlayback } from '@/lib/published-artworks';
import { compilePublishedFormulaPluginV1, type PublishedFormulaPluginInputV1 } from '@/engine/formulas/v1/published-adapter';
import { bindPublishedRenderingSourceV1 } from '@/engine/formulas/v1/published-rendering-source-v1';
import { resolveRecoveredPublishedRenderingPluginV1 } from '@/engine/formulas/v1/recovered-quantization-rendering-v1';
import presets from '../../../public/gallery-presets.json';

export async function probe(input: PublishedFormulaPluginInputV1) {
  registerBuiltins({ quiet: true });
  const artwork = buildPublishedArtworkCollection(presets, 'en').find(row => row.name === 'Ember Meridian')!;
  const playback = buildPublishedArtworkPlayback(artwork);
  const gallery = await resolvePublishedArtworkRuntime(playback);
  const native = resolveFormulaReference('newtonCosh', []);
  const compiled = await compilePublishedFormulaPluginV1(input);
  if (!gallery.ok || !native.success || !compiled.ok || !gallery.value.formulaPlugin) throw new Error('runtime-resolution');
  const published = resolveRecoveredPublishedRenderingPluginV1(bindPublishedRenderingSourceV1(compiled.value), native.plugin);
  // Independent pre-recovery step; use the current renderer and identical guards.
  const reference = { ...newtonCoshPlugin, glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 denom = complexSinhVec(z);
  if (dot(denom, denom) < 1e-10) return z;
  return z - complexDiv(complexCoshVec(z) - vec2(1.0, 0.0), denom);
}` };
  const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 100;
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
  if (!gl) throw new Error('webgl-unavailable');
  const plugins = [reference, gallery.value.formulaPlugin, native.plugin, published, native.plugin];
  const renderers = plugins.map((formulaPlugin, index) => new FractalRenderer(gl, index === 4 ? {} : { formulaPlugin }));
  const timeline = buildTimeline(playback.animation.keyframes), duration = totalDuration(timeline);
  const differences = (a: Uint8Array, b: Uint8Array) => a.reduce((sum, value, i) => sum + Number(value !== b[i]), 0);
  const samples = [];
  try {
    for (const useSSAA of [false, true]) {
      for (const time of [0, 0.25, 0.5, 0.75, 1]) {
        const buffers = [];
        for (let i = 0; i < renderers.length; i++) {
          const params = { ...playback.params, formula: plugins[i].id,
            bounds: interpolateAtTime(timeline, duration, time * duration),
            isJulia: false, maxIterations: 200, adaptiveIterations: false, useSSAA,
            ...(i === 4 ? { _tileInfo: { fullWidth: 160, fullHeight: 100, offsetX: 0, offsetY: 0 } } : {}),
          };
          if (!await renderers[i].render(params)) throw new Error('render-failed');
          const pixels = new Uint8Array(160 * 100 * 4);
          gl.readPixels(0, 0, 160, 100, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          if (gl.getError() !== gl.NO_ERROR) throw new Error('webgl-error');
          buffers.push(pixels);
        }
        samples.push({ time, useSSAA, differences: buffers.slice(1).map(buffer => differences(buffer, buffers[0])), png: canvas.toDataURL() });
      }
    }
    return samples;
  } finally {
    renderers.forEach(renderer => renderer.dispose());
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
