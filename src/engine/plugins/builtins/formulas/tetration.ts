import type { FormulaPlugin } from '../../types';

export const tetrationPlugin: FormulaPlugin = {
  id: 'tetration',
  category: 'formula',
  name: 'explore.controls.formula.tetration',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'exotic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Tetration: z = c^z = exp(z * log(c))
  return complexExp(complexMul(z, complexLog(c)));
}
`,
};
