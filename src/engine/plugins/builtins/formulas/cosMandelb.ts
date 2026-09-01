import type { FormulaPlugin } from '../../types';
import { RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1 } from './recoveredTranscendentalMath';

export const cosMandelbPlugin: FormulaPlugin = {
  id: 'cosMandelb',
  category: 'formula',
  name: 'explore.controls.formula.cosMandelb',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'transcendental',
  uniforms: [],
  glsl: `${RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1}

vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  return recoveredQuantize(recoveredCos(z) + c, 16.0);
}
`,
};
