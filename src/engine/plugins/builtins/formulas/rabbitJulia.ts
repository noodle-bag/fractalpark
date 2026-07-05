import type { FormulaPlugin } from '../../types';

export const rabbitJuliaPlugin: FormulaPlugin = {
  id: 'rabbitJulia',
  category: 'formula',
  name: 'explore.controls.formula.rabbitJulia',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: false,
  bailout: 65536.0,
  family: 'classic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Fixed Douady rabbit Julia portrait
  vec2 rabbitC = vec2(-0.123, 0.745);
  return complexSqr(z) + rabbitC;
}
`,
};
