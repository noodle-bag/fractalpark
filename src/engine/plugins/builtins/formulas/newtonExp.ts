import type { FormulaPlugin } from '../../types';

export const newtonExpPlugin: FormulaPlugin = {
  id: 'newtonExp',
  category: 'formula',
  name: 'explore.controls.formula.newtonExp',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: false,
  bailout: 65536.0,
  family: 'newton',
  escapeType: 'converge',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Newton's method for exp(z) - 1 = 0: z = z - 1 + 1/exp(z)
  return z - vec2(1.0, 0.0) + complexDiv(vec2(1.0, 0.0), complexExp(z));
}
`,
};
