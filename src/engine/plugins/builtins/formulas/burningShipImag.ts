import type { FormulaPlugin } from '../../types';

export const burningShipImagPlugin: FormulaPlugin = {
  id: 'burningShipImag',
  category: 'formula',
  name: 'explore.controls.formula.burningShipImag',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'burning-ship',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  z = vec2(z.x, -abs(z.y));
  return complexSqr(z) + c;
}
`,
};
