import type { FormulaPlugin } from '../../types';

export const newtonSinPlugin: FormulaPlugin = {
  id: 'newtonSin',
  category: 'formula',
  name: 'explore.controls.formula.newtonSin',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: false,
  bailout: 65536.0,
  family: 'newton',
  escapeType: 'converge',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Newton's method for sin(z) = 0
  // z = z - sin(z)/cos(z) = z - tan(z)
  vec2 sinZ = complexSin(z);
  vec2 cosZ = complexCos(z);
  return z - complexDiv(sinZ, cosZ);
}
`,
};
