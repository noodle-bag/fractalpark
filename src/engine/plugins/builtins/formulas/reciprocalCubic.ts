import type { FormulaPlugin } from '../../types';

export const reciprocalCubicPlugin: FormulaPlugin = {
  id: 'reciprocalCubic',
  category: 'formula',
  name: 'explore.controls.formula.reciprocalCubic',
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
  vec2 denom = complexPow(z, 3.0) + c;
  if (dot(denom, denom) < 1e-10) {
    denom += vec2(1e-5, 0.0);
  }
  return complexDiv(vec2(1.0, 0.0), denom);
}
`,
};
