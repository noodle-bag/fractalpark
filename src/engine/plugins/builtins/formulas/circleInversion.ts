import type { FormulaPlugin } from '../../types';

export const circleInversionPlugin: FormulaPlugin = {
  id: 'circleInversion',
  category: 'formula',
  name: 'explore.controls.formula.circleInversion',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  initGlsl: `
    if (length(z) < 1e-5) {
      z = vec2(1e-5, 0.0);
    }
  `,
  family: 'exotic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 z2 = complexSqr(z);
  float denom = dot(z2, z2);
  vec2 invZ2 = vec2(z2.x, -z2.y) / max(denom, 1e-10);
  return invZ2 + c;
}
`,
};
