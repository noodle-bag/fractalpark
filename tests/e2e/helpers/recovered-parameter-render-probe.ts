import { compilePublishedFormulaPluginV1, type PublishedFormulaPluginInputV1 } from '@/engine/formulas/v1/published-adapter';
import { bindPublishedRenderingSourceV1 } from '@/engine/formulas/v1/published-rendering-source-v1';
import { resolveRecoveredPublishedRenderingPluginV1 } from '@/engine/formulas/v1/recovered-quantization-rendering-v1';
import { mandelboxPlugin } from '@/engine/plugins/builtins/formulas/mandelbox';
import { registerBuiltins } from '@/engine/plugins/builtins';
import { FractalRenderer } from '@/engine/fractals/renderer';
import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import { projectDocumentToRuntimeParams } from '@/engine/document-adapter';

export async function probe(input: PublishedFormulaPluginInputV1) {
  registerBuiltins({ quiet: true });
  const compiled = await compilePublishedFormulaPluginV1(input);
  if (!compiled.ok) throw new Error(compiled.code);
  const plugin = resolveRecoveredPublishedRenderingPluginV1(bindPublishedRenderingSourceV1(compiled.value), mandelboxPlugin);
  // Independent native reference: remove only the orbit-rounding call.
  const reference = { ...mandelboxPlugin, glsl: mandelboxPlugin.glsl.replace(
    'recoveredAmplifiedQuantize(u_mandelboxScale * z + c, 16.0)',
    'u_mandelboxScale * z + c',
  ) };
  const canvas = document.createElement('canvas');
  canvas.width = 80;
  canvas.height = 60;
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
  if (!gl) throw new Error('webgl-unavailable');
  const native = new FractalRenderer(gl, { formulaPlugin: reference });
  const published = new FractalRenderer(gl, { formulaPlugin: plugin });
  const base = { ...projectDocumentToRuntimeParams(DEFAULT_FRACTAL_DOCUMENT),
    maxIterations: 60, adaptiveIterations: false, useSSAA: false,
    bounds: { centerX: 0, centerY: 0, zoom: 0.4, rotation: 0 },
  };
  const draw = async (adapted: boolean, scale: number, isJulia: boolean, juliaC: [number, number], tiled = false,
    bounds = base.bounds, maxIterations = base.maxIterations) => {
    const params = { ...base, bounds, maxIterations, formula: adapted ? plugin.id : reference.id, isJulia, juliaC,
      pluginParams: adapted ? { frmV1_mandelboxScale: [scale, 0] } : { u_mandelboxScale: scale },
      ...(tiled ? { _tileInfo: { fullWidth: 80, fullHeight: 60, offsetX: 0, offsetY: 0 } } : {}),
    };
    if (!await (adapted ? published : native).render(params)) throw new Error('render-superseded');
    const pixels = new Uint8Array(80 * 60 * 4);
    gl.readPixels(0, 0, 80, 60, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('webgl-error');
    const location = gl.getUniformLocation(gl.getParameter(gl.CURRENT_PROGRAM), adapted ? 'frmV1_mandelboxScale' : 'u_mandelboxScale');
    const delivered = gl.getUniform(gl.getParameter(gl.CURRENT_PROGRAM), location);
    if (adapted ? delivered[0] !== Math.fround(scale) || delivered[1] !== 0 : delivered !== Math.fround(scale)) {
      throw new Error('uniform-value-mismatch');
    }
    return pixels;
  };
  const differences = (a: Uint8Array, b: Uint8Array) => a.reduce((sum, value, i) => sum + Number(value !== b[i]), 0);
  try {
    const comparisons = [];
    for (const isJulia of [false, true]) {
      for (const scale of [-2, 1.5, 2, 2.5]) {
        const before = await draw(false, scale, isJulia, [2, -2]);
        const after = await draw(true, scale, isJulia, [2, -2]);
        comparisons.push(differences(before, after));
      }
    }
    const first = await draw(true, 2, true, [2, -2]);
    const scaleChanged = await draw(true, 1.5, true, [2, -2]);
    const juliaChanged = await draw(true, 2, true, [0.2, 0.3]);
    const restored = await draw(true, 2, true, [2, -2]);
    const exported = await draw(true, 2, true, [2, -2], true);
    const sceneComparisons = [];
    let deepSceneColors = 0;
    // Deep preset keyframe, initial-outside, final-step escape and threshold
    // boundary witnesses share exactly the same native lifecycle reference.
    for (const scene of [
      { x: 1.1835240095, y: -0.8611806143, zoom: 1594.56, julia: true, scale: 2, iterations: 200 },
      { x: 300, y: 0, zoom: 1e6, julia: true, scale: 0, iterations: 1 },
      { x: 300, y: 0, zoom: 1e6, julia: false, scale: 2, iterations: 1 },
      { x: 256, y: 0, zoom: 1e6, julia: false, scale: 0, iterations: 2 },
      { x: 0, y: 0, zoom: 0.0481, julia: false, scale: 2, iterations: 200 },
    ]) {
      const bounds = { centerX: scene.x, centerY: scene.y, zoom: scene.zoom, rotation: 0 };
      const actual = await draw(true, scene.scale, scene.julia, [2, -2], false, bounds, scene.iterations);
      if (scene.zoom === 1594.56) {
        const colors = new Set<number>();
        for (let i = 0; i < actual.length; i += 4) {
          colors.add((actual[i] << 16) | (actual[i + 1] << 8) | actual[i + 2]);
        }
        deepSceneColors = colors.size;
      }
      sceneComparisons.push(differences(
        await draw(false, scene.scale, scene.julia, [2, -2], false, bounds, scene.iterations),
        actual,
      ));
    }
    return { comparisons, sceneComparisons, deepSceneColors, scaleChanged: differences(first, scaleChanged), juliaChanged: differences(first, juliaChanged),
      restored: differences(first, restored), exported: differences(first, exported) };
  } finally {
    native.dispose();
    published.dispose();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
