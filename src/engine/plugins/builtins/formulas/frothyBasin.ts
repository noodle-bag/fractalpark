import type { FormulaPlugin } from '../../types';

export const frothyBasinPlugin: FormulaPlugin = {
  id: 'frothyBasin',
  category: 'formula',
  name: 'explore.controls.formula.frothyBasin',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'exotic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Frothy Basin: z^2 - conj(z)*c + c
  return complexSqr(z) - complexMul(complexConj(z), c) + c;
}
`,
};
