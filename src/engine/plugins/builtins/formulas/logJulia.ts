import type { FormulaPlugin } from '../../types';

export const logJuliaPlugin: FormulaPlugin = {
  id: 'logJulia',
  category: 'formula',
  name: 'explore.controls.formula.logJulia',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'transcendental',
  uniforms: [],
  initGlsl: `
    if (length(z) < 1e-5) {
      z = vec2(1e-5, 0.0);
    }
  `,
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  return complexMul(c, complexLog(z));
}
`,
};
