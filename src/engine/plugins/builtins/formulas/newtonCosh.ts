import type { FormulaPlugin } from '../../types';
import { RECOVERED_AMPLIFIED_MATH_GLSL_V1 } from './recoveredAmplifiedMath';

export const newtonCoshPlugin: FormulaPlugin = {
  id: 'newtonCosh',
  category: 'formula',
  name: 'explore.controls.formula.newtonCosh',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: false,
  bailout: 65536.0,
  family: 'newton',
  escapeType: 'converge',
  uniforms: [],
  initGlsl: `
    if (length(z) < 1e-5) {
      z = vec2(0.2, 0.0);
    }
  `,
  glsl: `${RECOVERED_AMPLIFIED_MATH_GLSL_V1}

vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 clampedZ = vec2(clamp(z.x, -80.0, 80.0), z.y);
  vec2 denom = recoveredAmplifiedSinhVec(clampedZ);
  if (dot(denom, denom) < 1e-10) {
    return z;
  }
  return z - complexDiv(recoveredAmplifiedCoshVec(clampedZ) - vec2(1.0, 0.0), denom);
}
`,
};
