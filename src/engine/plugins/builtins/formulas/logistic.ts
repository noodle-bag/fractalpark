import type { FormulaPlugin } from '../../types';

export const logisticPlugin: FormulaPlugin = {
  id: 'logistic',
  category: 'formula',
  name: 'explore.controls.formula.logistic',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  initGlsl: `
    if (length(z) < 1e-10) {
      z = vec2(0.5, 0.0);
    }
  `,
  family: 'classic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Logistic map: z = c * z * (1 - z)
  vec2 oneMinusZ = vec2(1.0, 0.0) - z;
  return complexMul(c, complexMul(z, oneMinusZ));
}
`,
};
