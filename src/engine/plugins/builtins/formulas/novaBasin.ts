import type { FormulaPlugin } from '../../types';

export const novaBasinPlugin: FormulaPlugin = {
  id: 'novaBasin',
  category: 'formula',
  name: 'explore.controls.formula.novaBasin',
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
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  vec2 z2 = complexSqr(z);
  vec2 z3 = complexMul(z2, z);
  vec2 f = z3 - vec2(1.0, 0.0);
  vec2 fp = 3.0 * z2;
  vec2 correction = complexDiv(f, fp);
  vec2 basinBias = vec2(dot(correction, correction) * 0.08, 0.0);
  return z - correction + basinBias;
}
`,
};
