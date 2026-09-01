import type { FormulaPlugin } from '../../types';
import { RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1 } from './recoveredTranscendentalMath';

export const newton6Plugin: FormulaPlugin = {
  id: 'newton6',
  category: 'formula',
  name: 'explore.controls.formula.newton6',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: false,
  bailout: 65536.0,
  family: 'newton',
  escapeType: 'converge',
  uniforms: [],
  initGlsl: `
    if (length(z) < 1e-5) {
      z = vec2(1e-5, 0.0);
    }
  `,
  glsl: `${RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1}

vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 z5 = recoveredPow(z, 5.0);
  vec2 z6 = complexMul(z5, z);
  vec2 fp = 6.0 * z5;
  if (dot(fp, fp) < 1e-10) {
    return recoveredQuantize(z, 16.0);
  }
  return recoveredQuantize(z - complexDiv(z6 - vec2(1.0, 0.0), fp), 16.0);
}
`,
};
