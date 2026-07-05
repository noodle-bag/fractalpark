import type { FormulaPlugin } from '../../types';

export const newtonSinhPlugin: FormulaPlugin = {
  id: 'newtonSinh',
  category: 'formula',
  name: 'explore.controls.formula.newtonSinh',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: false,
  bailout: 65536.0,
  family: 'newton',
  escapeType: 'converge',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 denom = complexCoshVec(z);
  if (dot(denom, denom) < 1e-10) {
    return z;
  }
  return z - complexDiv(complexSinhVec(z), denom);
}
`,
};
