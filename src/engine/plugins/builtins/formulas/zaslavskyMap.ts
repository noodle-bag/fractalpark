import type { FormulaPlugin } from '../../types';

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
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 swirl = z + 0.28 * complexSin(z);
  vec2 rot = vec2(cos(0.55), sin(0.55));
  return complexMul(swirl, rot) + c;
}
`,
};
