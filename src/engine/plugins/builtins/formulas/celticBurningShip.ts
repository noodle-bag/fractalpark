import type { FormulaPlugin } from '../../types';

export const celticBurningShipPlugin: FormulaPlugin = {
  id: 'celticBurningShip',
  category: 'formula',
  name: 'explore.controls.formula.celticBurningShip',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'burning-ship',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 p = vec2(abs(z.x), abs(z.y));
  vec2 z2 = complexSqr(p);
  return vec2(abs(z2.x), z2.y) + c;
}
`,
};
