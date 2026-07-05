import type { FormulaPlugin } from '../../types';

export const ringsPlugin: FormulaPlugin = {
  id: 'rings',
  category: 'formula',
  name: 'explore.controls.formula.rings',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'exotic',
  uniforms: [
    {
      name: 'u_ringsP',
      type: 'float',
      default: 0.5,
      min: -2.0,
      max: 2.0,
      step: 0.01,
      label: 'explore.controls.ringsP',
    },
  ],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Rings: z^2 + c + p/z
  float r2 = dot(z, z);
  if (r2 < 1e-10) return complexSqr(z) + c;
  return complexSqr(z) + c + complexDiv(vec2(u_ringsP, 0.0), z);
}
`,
};
