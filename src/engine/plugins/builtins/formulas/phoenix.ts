import type { FormulaPlugin } from '../../types';

export const phoenixPlugin: FormulaPlugin = {
  id: 'phoenix',
  category: 'formula',
  name: 'explore.controls.formula.phoenix',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'phoenix',
  uniforms: [
    {
      name: 'u_phoenixP',
      type: 'float',
      default: -0.5,
      min: -2,
      max: 2,
      step: 0.01,
      label: 'explore.controls.phoenixP',
    },
  ],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 z2 = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y);
  return z2 + c + u_phoenixP * zPrev;  // Scalar multiplication, not component-wise
}
`,
};
