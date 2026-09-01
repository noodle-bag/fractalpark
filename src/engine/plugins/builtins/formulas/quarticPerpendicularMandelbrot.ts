import type { FormulaPlugin } from '../../types';
import { RECOVERED_AMPLIFIED_MATH_GLSL_V1 } from './recoveredAmplifiedMath';

export const quarticPerpendicularMandelbrotPlugin: FormulaPlugin = {
  id: 'quarticPerpendicularMandelbrot',
  category: 'formula',
  name: 'explore.controls.formula.quarticPerpendicularMandelbrot',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'classic',
  uniforms: [],
  glsl: `${RECOVERED_AMPLIFIED_MATH_GLSL_V1}

vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 p = vec2(abs(z.x), z.y);
  return recoveredAmplifiedIntegerPower(p, 4.0) + c;
}
`,
};
