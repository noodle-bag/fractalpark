import type { FormulaPlugin } from '../../types';
import { RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1 } from './recoveredTranscendentalMath';

export const cosJuliaPlugin: FormulaPlugin = {
  id: 'cosJulia',
  category: 'formula',
  name: 'explore.controls.formula.cosJulia',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'transcendental',
  uniforms: [],
  glsl: `${RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1}

vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  return recoveredQuantize(complexMul(c, recoveredCos(z)), 16.0);
}
`,
};
