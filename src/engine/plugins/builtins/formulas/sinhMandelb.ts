import type { FormulaPlugin } from '../../types';
import { RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1 } from './recoveredTranscendentalMath';

export const sinhMandelbPlugin: FormulaPlugin = {
  id: 'sinhMandelb',
  category: 'formula',
  name: 'explore.controls.formula.sinhMandelb',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'transcendental',
  uniforms: [],
  glsl: `${RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1}

vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  return recoveredQuantize(recoveredSinhVec(z) + c, 16.0);
}
`,
};
