import type { FormulaPlugin } from '../../types';
import { RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1 } from './recoveredTranscendentalMath';

export const zaslavskyMapPlugin: FormulaPlugin = {
  id: 'zaslavskyMap',
  category: 'formula',
  name: 'explore.controls.formula.zaslavskyMap',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'exotic',
  uniforms: [],
  glsl: `${RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1}

vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 swirl = z + 0.28 * recoveredSin(z);
  vec2 rotSinCos = recoveredStableSinCos(0.55);
  vec2 rot = vec2(rotSinCos.y, rotSinCos.x);
  return recoveredQuantize(complexMul(swirl, rot) + c, 16.0);
}
`,
};
