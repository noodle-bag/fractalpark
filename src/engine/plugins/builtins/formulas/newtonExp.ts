import type { FormulaPlugin } from '../../types';
import { RECOVERED_AMPLIFIED_MATH_GLSL_V1 } from './recoveredAmplifiedMath';

export const newtonExpPlugin: FormulaPlugin = {
  id: 'newtonExp',
  category: 'formula',
  name: 'explore.controls.formula.newtonExp',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: false,
  bailout: 65536.0,
  family: 'newton',
  escapeType: 'converge',
  uniforms: [],
  glsl: `${RECOVERED_AMPLIFIED_MATH_GLSL_V1}

vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Newton's method for exp(z) - 1 = 0: z = z - 1 + 1/exp(z)
  vec2 clampedZ = vec2(clamp(z.x, -20.0, 20.0), z.y);
  return z - vec2(1.0, 0.0) + complexDiv(vec2(1.0, 0.0), recoveredAmplifiedExp(clampedZ));
}
`,
};
