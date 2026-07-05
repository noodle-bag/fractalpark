import type { FormulaPlugin } from '../../types';

export const burningShipQuarticPlugin: FormulaPlugin = {
  id: 'burningShipQuartic',
  category: 'formula',
  name: 'explore.controls.formula.burningShipQuartic',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'burning-ship',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 p = vec2(abs(z.x), abs(z.y));
  return complexPow(p, 4.0) + c;
}
`,
};
