import type { FormulaPlugin } from '../../types';

export const atanhJuliaPlugin: FormulaPlugin = {
  id: 'atanhJulia',
  category: 'formula',
  name: 'explore.controls.formula.atanhJulia',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'transcendental',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 one = vec2(1.0, 0.0);
  vec2 atanhZ = 0.5 * (complexLog(one + z) - complexLog(one - z));
  return complexMul(c, atanhZ);
}
`,
};
