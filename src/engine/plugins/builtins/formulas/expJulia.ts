import type { FormulaPlugin } from '../../types';

export const expJuliaPlugin: FormulaPlugin = {
  id: 'expJulia',
  category: 'formula',
  name: 'explore.controls.formula.expJulia',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'transcendental',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Exp Julia: z = exp(z) + c
  return complexExp(z) + c;
}
`,
};
