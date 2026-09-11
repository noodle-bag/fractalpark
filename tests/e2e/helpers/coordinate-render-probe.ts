import { compilePublishedFormulaPluginV1, type PublishedFormulaPluginInputV1 } from '../../../src/engine/formulas/v1/published-adapter';
import { applyPublishedCoordinateParametersV1, fixedSeedModeV1 } from '../../../src/engine/formulas/v1/published-coordinate-parameters-v1';
import { FractalRenderer } from '../../../src/engine/fractals/renderer';
import { pluginRegistry } from '../../../src/engine/plugins/registry';
import { smoothColoring } from '../../../src/engine/plugins/builtins/coloring/smooth';
import { blackInsideColoring } from '../../../src/engine/plugins/builtins/coloring/inside-black';
import { noneTransform } from '../../../src/engine/plugins/builtins/transforms/none';
import { DEFAULT_FRACTAL_DOCUMENT } from '../../../src/engine/document';
import { projectDocumentToRuntimeParams } from '../../../src/engine/document-adapter';
import type { PluginParamRecord } from '../../../src/engine/types';

/** Full production renderer, small image: no loop-bound or shader substitutions. */
export async function probe(input: PublishedFormulaPluginInputV1) {
  const julia = fixedSeedModeV1(input.formulaId, input.sourceRevision) === 'julia';
  pluginRegistry.register(smoothColoring);
  pluginRegistry.register(blackInsideColoring);
  pluginRegistry.register(noneTransform);
  // Observe final state even when two trajectories share an escape color.
  pluginRegistry.register({
    id: 'coordinate-state-inside', category: 'insideColoring', source: 'builtin',
    name: 'Coordinate state audit', uniforms: [], needsOrbitStats: [],
    glsl: 'vec3 insideColor(OrbitStats s) { return vec3(0.5 + atan(s.finalZ.x) / 3.2, 0.5 + atan(s.finalZ.y) / 3.2, 0.5); }',
  });
  pluginRegistry.register({
    id: 'coordinate-state-outside', category: 'outsideColoring', source: 'builtin',
    name: 'Coordinate state audit', uniforms: [], needsOrbitStats: [],
    glsl: 'float outsideColor(float si, int iter, OrbitStats s) { return fract(0.5 + atan(s.finalZ.x) / 3.2 + atan(s.finalZ.y) / 9.0); }',
  });
  const baseline = await compilePublishedFormulaPluginV1(input);
  if (!baseline.ok) throw new Error(baseline.code);
  const extension = await applyPublishedCoordinateParametersV1(baseline.value);
  if (!extension.ok) throw new Error(extension.code);
  const canvas = document.createElement('canvas');
  canvas.width = 40;
  canvas.height = 30;
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
  if (!gl) throw new Error('webgl-unavailable');
  const before = new FractalRenderer(gl, { formulaPlugin: baseline.value.plugin });
  const after = new FractalRenderer(gl, { formulaPlugin: extension.value.plugin });
  const params = {
    ...projectDocumentToRuntimeParams(DEFAULT_FRACTAL_DOCUMENT),
    formula: input.formulaId, maxIterations: 16, adaptiveIterations: false,
    useSSAA: false, bounds: { centerX: 0, centerY: 0, zoom: 0.6, rotation: 0 },
  };
  const draw = async (renderer: FractalRenderer, pluginParams: PluginParamRecord, tiled = false, stateAudit = false) => {
    const fixed = pluginParams.frmV1_pixelSource;
    const coordinate = pluginParams.frmV1_pixelConstant;
    const didRender = await renderer.render({
      ...params, pluginParams,
      ...(julia ? { isJulia: Array.isArray(fixed) && fixed[0] === 1, juliaC: Array.isArray(coordinate) ? [coordinate[0], coordinate[1]] as [number, number] : [0, 0] as [number, number] } : {}),
      ...(stateAudit ? { maxIterations: 1, insideColoring: 'coordinate-state-inside', outsideColoring: 'coordinate-state-outside' } : {}),
      ...(tiled ? { _tileInfo: { fullWidth: 40, fullHeight: 30, offsetX: 0, offsetY: 0 } } : {}),
    });
    if (!didRender) throw new Error('render-superseded');
    const data = new Uint8Array(40 * 30 * 4);
    gl.readPixels(0, 0, 40, 30, gl.RGBA, gl.UNSIGNED_BYTE, data);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('webgl-readback-error');
    return data;
  };
  const differences = (a: Uint8Array, b: Uint8Array) => a.reduce((count, value, i) => count + Number(value !== b[i]), 0);
  try {
    const original = await draw(before, {});
    const defaults = await draw(after, {});
    // The additive reciprocal map needs a larger nonzero factor to escape its
    // radius-50 bound in this deliberately short 16-step image probe.
    const active: PluginParamRecord = Object.fromEntries(baseline.value.descriptor.parameters
      .filter(slot => slot.type !== 'function')
      .map(slot => [slot.uniformName, slot.slotName === 'factor' ? [3, 0] : [0.3, 0.1]]));
    const activeOriginal = await draw(before, active);
    const fixed: PluginParamRecord = { ...active, frmV1_pixelSource: [1, 0], frmV1_pixelConstant: [-0.7, 0.27] };
    const first = await draw(after, fixed);
    const repeated = await draw(after, fixed);
    const changed = await draw(after, { ...fixed, frmV1_pixelConstant: [0.2, -0.4] });
    const restored = await draw(after, { ...fixed, frmV1_pixelSource: [0, 0] });
    const exported = await draw(after, fixed, true);
    const stateA = await draw(after, fixed, false, true);
    const stateB = await draw(after, { ...fixed, frmV1_pixelConstant: [0.2, -0.4] }, false, true);
    return {
      ordinaryChangedChannels: differences(original, defaults),
      fixedChangedChannels: differences(first, changed),
      stateChangedChannels: differences(stateA, stateB),
      repeatedChangedChannels: differences(first, repeated),
      restoredChangedChannels: differences(activeOriginal, restored),
      exportChangedChannels: differences(first, exported),
      opaquePixels: first.filter((_, i) => i % 4 === 3 && first[i] === 255).length,
    };
  } finally {
    before.dispose();
    after.dispose();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
