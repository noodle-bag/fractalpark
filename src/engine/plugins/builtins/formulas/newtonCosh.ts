import type { FormulaPlugin } from '../../types';

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
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 denom = complexSinhVec(z);
  if (dot(denom, denom) < 1e-10) {
    return z;
  }
  return z - complexDiv(complexCoshVec(z) - vec2(1.0, 0.0), denom);
}
`,
};
