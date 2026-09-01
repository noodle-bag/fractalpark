import type { FormulaPlugin } from '../../types';
import { RECOVERED_AMPLIFIED_MATH_GLSL_V1 } from './recoveredAmplifiedMath';

export const burningShipQuarticPlugin: FormulaPlugin = {
  id: 'burningShipQuartic',
  category: 'formula',
  name: 'explore.controls.formula.burningShipQuartic',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'burning-ship',
  uniforms: [],
  glsl: `${RECOVERED_AMPLIFIED_MATH_GLSL_V1}

vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 p = vec2(abs(z.x), abs(z.y));
  return recoveredAmplifiedIntegerPower(p, 4.0) + c;
}
`,
};
