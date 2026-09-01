import type { FormulaPlugin } from '../../types';
import { RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1 } from './recoveredTranscendentalMath';

export const tetrationPlugin: FormulaPlugin = {
  id: 'tetration',
  category: 'formula',
  name: 'explore.controls.formula.tetration',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'exotic',
  uniforms: [],
  glsl: `${RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1}

vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Tetration: z = c^z = exp(z * log(c))
  return recoveredQuantize(recoveredExp(complexMul(z, recoveredLog(c))), 16.0);
}
`,
};
