import type { FormulaPlugin } from '../../types';

export const lambdaPlugin: FormulaPlugin = {
  id: 'lambda',
  category: 'formula',
  name: 'explore.controls.formula.lambda',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 65536.0,
  family: 'classic',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Lambda fractal: z = c * z * (1 - z) with z0 = 0.5
  // Since our framework initializes z=0, we offset: actualZ = z + 0.5
  vec2 actualZ = z + vec2(0.5, 0.0);
  vec2 oneMinusZ = vec2(1.0, 0.0) - actualZ;
  return complexMul(c, complexMul(actualZ, oneMinusZ));
}
`,
};
