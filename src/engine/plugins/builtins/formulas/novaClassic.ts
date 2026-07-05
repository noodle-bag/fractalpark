import type { FormulaPlugin } from '../../types';

export const novaClassicPlugin: FormulaPlugin = {
  id: 'novaClassic',
  category: 'formula',
  name: 'explore.controls.formula.novaClassic',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: false,
  bailout: 65536.0,
  family: 'newton',
  escapeType: 'converge',
  uniforms: [],
  initGlsl: `
    if (length(z) < 1e-5) {
      z = vec2(1e-5, 0.0);
    }
  `,
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Nova-style spiral basin around z^3 - 1 = 0
  vec2 z2 = complexSqr(z);
  vec2 z3 = complexMul(z2, z);
  vec2 f = z3 - vec2(1.0, 0.0);
  vec2 fp = 3.0 * z2;
  vec2 correction = complexDiv(f, fp);
  vec2 twist = complexMul(correction, vec2(0.0, 0.12));
  return z - correction + twist;
}
`,
};
