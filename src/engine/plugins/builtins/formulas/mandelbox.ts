import type { FormulaPlugin } from '../../types';

export const mandelboxPlugin: FormulaPlugin = {
  id: 'mandelbox',
  category: 'formula',
  name: 'explore.controls.formula.mandelbox',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'classic',
  uniforms: [
    {
      name: 'u_mandelboxScale',
      type: 'float',
      default: 2.0,
      min: -3.0,
      max: 3.0,
      step: 0.1,
      label: 'explore.controls.mandelboxScale',
    },
  ],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Mandelbox: box fold + ball fold + scale
  // Box fold
  z = clamp(z, -1.0, 1.0) * 2.0 - z;
  
  // Ball fold
  float r2 = dot(z, z);
  if (r2 < 0.25) {
    z = z * 4.0;
  } else if (r2 < 1.0) {
    z = z / r2;
  }
  
  // Scale and add c
  return u_mandelboxScale * z + c;
}
`,
};
