import type { FormulaPlugin } from '../../types';

export const chebyshev2Plugin: FormulaPlugin = {
  id: 'chebyshev2',
  category: 'formula',
  name: 'explore.controls.formula.chebyshev2',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'classic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  return 2.0 * complexSqr(z) - vec2(1.0, 0.0) + c;
}
`,
};
