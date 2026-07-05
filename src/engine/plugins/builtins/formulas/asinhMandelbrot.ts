import type { FormulaPlugin } from '../../types';

export const asinhMandelbrotPlugin: FormulaPlugin = {
  id: 'asinhMandelbrot',
  category: 'formula',
  name: 'explore.controls.formula.asinhMandelbrot',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'transcendental',
  uniforms: [],
  glsl: `
vec2 complexSqrtLocal(vec2 z) {
  float r = length(z);
  float x = sqrt(max(0.0, 0.5 * (r + z.x)));
  float y = sqrt(max(0.0, 0.5 * (r - z.x)));
  return vec2(x, z.y < 0.0 ? -y : y);
}

vec2 asinhLocal(vec2 z) {
  return complexLog(z + complexSqrtLocal(complexSqr(z) + vec2(1.0, 0.0)));
}

vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  return asinhLocal(z) + c;
}
`,
};
