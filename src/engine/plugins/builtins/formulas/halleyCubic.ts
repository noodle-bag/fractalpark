import type { FormulaPlugin } from '../../types';

export const halleyCubicPlugin: FormulaPlugin = {
  id: 'halleyCubic',
  category: 'formula',
  name: 'explore.controls.formula.halleyCubic',
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
  // Halley's method for z^3 - 1 = 0
  vec2 z2 = complexSqr(z);
  vec2 z3 = complexMul(z2, z);
  vec2 f = z3 - vec2(1.0, 0.0);
  vec2 fp = 3.0 * z2;
  vec2 fpp = 6.0 * z;
  vec2 denom = 2.0 * complexMul(fp, fp) - complexMul(f, fpp);
  if (dot(denom, denom) < 1e-10) {
    return z;
  }
  vec2 numer = 2.0 * complexMul(f, fp);
  return z - complexDiv(numer, denom);
}
`,
};
