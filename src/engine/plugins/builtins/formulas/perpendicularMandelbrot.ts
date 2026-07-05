import type { FormulaPlugin } from '../../types';

export const perpendicularMandelbrotPlugin: FormulaPlugin = {
  id: 'perpendicularMandelbrot',
  category: 'formula',
  name: 'explore.controls.formula.perpendicularMandelbrot',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'classic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 p = vec2(z.y, abs(z.x));
  return complexSqr(p) + c;
}
`,
};
