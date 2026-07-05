import type { FormulaPlugin } from '../../types';

export const buffaloPlugin: FormulaPlugin = {
  id: 'buffalo',
  category: 'formula',
  name: 'explore.controls.formula.buffalo',
  source: 'builtin',
  supportsPower: true,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'exotic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Buffalo: z = abs(re)^2 - abs(im)^2 + c (similar to Celtic but different)
  float x2 = abs(z.x) * abs(z.x);
  float y2 = abs(z.y) * abs(z.y);
  return vec2(x2 - y2, 2.0 * z.x * abs(z.y)) + c;
}
`,
};
