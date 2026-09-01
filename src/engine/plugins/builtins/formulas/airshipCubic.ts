import type { FormulaPlugin } from '../../types';
import { RECOVERED_AMPLIFIED_MATH_GLSL_V1 } from './recoveredAmplifiedMath';

export const airshipCubicPlugin: FormulaPlugin = {
  id: 'airshipCubic',
  category: 'formula',
  name: 'explore.controls.formula.airshipCubic',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'burning-ship',
  uniforms: [],
  glsl: `${RECOVERED_AMPLIFIED_MATH_GLSL_V1}

vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  float safeY = abs(z.y) < 1e-10 ? 1.0 : sign(z.y);
  vec2 folded = vec2(abs(z.x), z.x * z.y / safeY);
  return recoveredAmplifiedIntegerPower(folded, 3.0) + c;
}
`,
};
