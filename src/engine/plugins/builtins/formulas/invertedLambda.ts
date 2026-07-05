import type { FormulaPlugin } from '../../types';

export const invertedLambdaPlugin: FormulaPlugin = {
  id: 'invertedLambda',
  category: 'formula',
  name: 'explore.controls.formula.invertedLambda',
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
  vec2 oneMinusZ = vec2(1.0, 0.0) - z;
  vec2 lambdaTerm = complexMul(c, complexMul(z, oneMinusZ));
  vec2 denom = complexSqr(z) + c;
  if (dot(denom, denom) < 1e-10) {
    denom += vec2(1e-5, 0.0);
  }
  vec2 reciprocalTerm = complexDiv(vec2(0.18, 0.0), denom);
  return lambdaTerm + reciprocalTerm;
}
`,
};
