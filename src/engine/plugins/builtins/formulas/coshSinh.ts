import type { FormulaPlugin } from '../../types';
import { RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1 } from './recoveredTranscendentalMath';

export const coshSinhPlugin: FormulaPlugin = {
  id: 'coshSinh',
  category: 'formula',
  name: 'explore.controls.formula.coshSinh',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'transcendental',
  uniforms: [],
  glsl: `${RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1}

vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 clampedZ = vec2(clamp(z.x, -8.0, 8.0), z.y);
  vec2 stableCosh = recoveredQuantize(recoveredCoshVec(clampedZ), 16.0);
  vec2 stableSinh = recoveredQuantize(recoveredSinhVec(clampedZ), 16.0);
  return recoveredQuantize(complexMul(stableCosh, stableSinh) + c, 16.0);
}
`,
};
