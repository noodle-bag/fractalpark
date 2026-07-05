import type { FormulaPlugin } from '../../types';

export const newtonCosPlugin: FormulaPlugin = {
  id: 'newtonCos',
  category: 'formula',
  name: 'explore.controls.formula.newtonCos',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: false,
  bailout: 65536.0,
  family: 'newton',
  escapeType: 'converge',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Newton for cos(z) - z = 0
  vec2 denom = complexSin(z) + vec2(1.0, 0.0);
  if (dot(denom, denom) < 1e-10) {
    return z;
  }
  return z + complexDiv(complexCos(z) - z, denom);
}
`,
};
