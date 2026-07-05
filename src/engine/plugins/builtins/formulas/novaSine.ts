import type { FormulaPlugin } from '../../types';

export const novaSinePlugin: FormulaPlugin = {
  id: 'novaSine',
  category: 'formula',
  name: 'explore.controls.formula.novaSine',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'newton',
  escapeType: 'converge',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 denom = complexCos(z);
  if (dot(denom, denom) < 1e-10) {
    return z;
  }
  return z - complexDiv(complexSin(z), denom) + 0.18 * c;
}
`,
};
