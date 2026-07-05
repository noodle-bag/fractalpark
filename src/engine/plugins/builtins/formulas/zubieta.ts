import type { FormulaPlugin } from '../../types';

export const zubietaPlugin: FormulaPlugin = {
  id: 'zubieta',
  category: 'formula',
  name: 'explore.controls.formula.zubieta',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'exotic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Zubieta: z = abs(z^2 + c)
  vec2 z2 = complexSqr(z);
  return abs(z2 + c);
}
`,
};
