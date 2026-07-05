import type { FormulaPlugin } from '../../types';

export const phoenixMultiPlugin: FormulaPlugin = {
  id: 'phoenixMulti',
  category: 'formula',
  name: 'explore.controls.formula.phoenixMulti',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'phoenix',
  uniforms: [
    {
      name: 'u_phoenixMultiP',
      type: 'float',
      default: 0.5,
      min: -2.0,
      max: 2.0,
      step: 0.01,
      label: 'explore.controls.phoenixMultiP',
    },
  ],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Multi-Phoenix: z = z^2 + c + p*zPrev
  vec2 z2 = complexSqr(z);
  return z2 + c + u_phoenixMultiP * zPrev;
}
`,
};
