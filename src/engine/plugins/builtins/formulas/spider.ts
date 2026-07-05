import type { FormulaPlugin } from '../../types';

export const spiderPlugin: FormulaPlugin = {
  id: 'spider',
  category: 'formula',
  name: 'explore.controls.formula.spider',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'exotic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Spider: hybrid Mandelbrot/Julia with conditional
  // z = z^2 + c/z
  vec2 z2 = complexSqr(z);
  if (length(z) > 0.001) {
    return z2 + complexDiv(c, z);
  }
  return z2 + c;
}
`,
};
