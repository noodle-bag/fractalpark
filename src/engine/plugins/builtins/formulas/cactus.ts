import type { FormulaPlugin } from '../../types';

export const cactusPlugin: FormulaPlugin = {
  id: 'cactus',
  category: 'formula',
  name: 'explore.controls.formula.cactus',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'classic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Cactus: z^3 + (c-1)*z - c
  vec2 z3 = complexMul(complexSqr(z), z);
  vec2 cm1 = c - vec2(1.0, 0.0);
  return z3 + complexMul(cm1, z) - c;
}
`,
};
