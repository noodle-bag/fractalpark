import type { FormulaPlugin } from '../../types';

export const biomorphPlugin: FormulaPlugin = {
  id: 'biomorph',
  category: 'formula',
  name: 'explore.controls.formula.biomorph',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'classic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Biomorph: z^3 + c
  return complexMul(complexSqr(z), z) + c;
}
`,
};
