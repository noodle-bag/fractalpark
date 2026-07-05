import type { FormulaPlugin } from '../../types';

export const mcMullen23Plugin: FormulaPlugin = {
  id: 'mcMullen23',
  category: 'formula',
  name: 'explore.controls.formula.mcMullen23',
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
  vec2 z3 = complexPow(z, 3.0);
  vec2 denom = z3;
  if (dot(denom, denom) < 1e-10) {
    denom += vec2(1e-5, 0.0);
  }
  return complexSqr(z) + complexDiv(c, denom);
}
`,
};
