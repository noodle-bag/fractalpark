import type { FormulaPlugin } from '../../types';
import { RECOVERED_AMPLIFIED_MATH_GLSL_V1 } from './recoveredAmplifiedMath';

export const multicorn5Plugin: FormulaPlugin = {
  id: 'multicorn5',
  category: 'formula',
  name: 'explore.controls.formula.multicorn5',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'classic',
  uniforms: [],
  glsl: `${RECOVERED_AMPLIFIED_MATH_GLSL_V1}

vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  return recoveredAmplifiedIntegerPower(complexConj(z), 5.0) + c;
}
`,
};
