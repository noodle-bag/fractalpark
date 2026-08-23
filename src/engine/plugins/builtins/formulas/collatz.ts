import type { FormulaPlugin } from '../../types';
import { RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1 } from './recoveredTranscendentalMath';

export const collatzPlugin: FormulaPlugin = {
  id: 'collatz',
  category: 'formula',
  name: 'explore.controls.formula.collatz',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: false,
  bailout: 65536.0,
  family: 'exotic',
  uniforms: [],
  glsl: `${RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1}

vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Collatz fractal: 3n+1 mapping in complex plane
  // z = (1 + 4*z - (1 + 2*z)*cos(pi*z))/4
  vec2 piZ = vec2(3.14159 * z.x, 3.14159 * z.y);
  vec2 cosPiZ = recoveredCos(piZ);
  vec2 term = complexMul(vec2(1.0, 0.0) + 2.0 * z, cosPiZ);
  return recoveredQuantize((vec2(1.0, 0.0) + 4.0 * z - term) / 4.0 + c, 16.0);
}
`,
};
