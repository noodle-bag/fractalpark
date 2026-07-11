import type { FormulaPlugin } from '../../types';

export const mandelbrotPlugin: FormulaPlugin = {
  id: 'mandelbrot',
  category: 'formula',
  name: 'explore.controls.formula.mandelbrot',
  source: 'builtin',
  supportsPower: true,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'classic',
  distanceEstimate: 'quadratic-c',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  if (u_power == 2.0) {
    return vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
  }
  return complexPow(z, u_power) + c;
}
`,
};
