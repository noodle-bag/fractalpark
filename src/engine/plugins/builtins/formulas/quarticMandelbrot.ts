import type { FormulaPlugin } from '../../types';

export const quarticMandelbrotPlugin: FormulaPlugin = {
  id: 'quarticMandelbrot',
  category: 'formula',
  name: 'explore.controls.formula.quarticMandelbrot',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'classic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Quartic: z = z^4 + c
  vec2 z2 = complexSqr(z);
  return complexSqr(z2) + c;
}
`,
};
