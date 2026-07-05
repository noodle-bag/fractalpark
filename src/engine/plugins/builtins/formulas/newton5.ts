import type { FormulaPlugin } from '../../types';

export const newton5Plugin: FormulaPlugin = {
  id: 'newton5',
  category: 'formula',
  name: 'explore.controls.formula.newton5',
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
  vec2 z4 = complexPow(z, 4.0);
  vec2 z5 = complexMul(z4, z);
  vec2 fp = 5.0 * z4;
  if (dot(fp, fp) < 1e-10) {
    return z;
  }
  return z - complexDiv(z5 - vec2(1.0, 0.0), fp);
}
`,
};
