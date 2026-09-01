import type { FormulaPlugin } from '../../types';
import { RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1 } from './recoveredTranscendentalMath';

export const coshMandelbPlugin: FormulaPlugin = {
  id: 'coshMandelb',
  category: 'formula',
  name: 'explore.controls.formula.coshMandelb',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'transcendental',
  uniforms: [],
  glsl: `${RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1}

vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 stableCosh = recoveredQuantize(recoveredCoshVec(z), 16.0);
  return recoveredQuantize(stableCosh + c, 16.0);
}
`,
};
