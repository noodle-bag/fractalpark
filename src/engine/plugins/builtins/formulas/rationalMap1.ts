import type { FormulaPlugin } from '../../types';

export const rationalMap1Plugin: FormulaPlugin = {
  id: 'rationalMap1',
  category: 'formula',
  name: 'explore.controls.formula.rationalMap1',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'exotic',
  uniforms: [],
  initGlsl: `
    if (length(z) < 1e-5) {
      z = vec2(1e-5, 0.0);
    }
  `,
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 numer = complexSqr(z);
  vec2 denom = z + c;
  if (dot(denom, denom) < 1e-10) {
    denom += vec2(1e-5, 0.0);
  }
  return complexDiv(numer, denom);
}
`,
};
