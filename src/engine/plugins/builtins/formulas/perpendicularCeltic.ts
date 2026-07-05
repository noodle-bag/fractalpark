import type { FormulaPlugin } from '../../types';

export const perpendicularCelticPlugin: FormulaPlugin = {
  id: 'perpendicularCeltic',
  category: 'formula',
  name: 'explore.controls.formula.perpendicularCeltic',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'classic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 p = vec2(abs(z.x), z.y);
  vec2 z2 = complexSqr(p);
  return vec2(abs(z2.x), z2.y) + c;
}
`,
};
