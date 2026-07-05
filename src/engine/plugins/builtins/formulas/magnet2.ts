import type { FormulaPlugin } from '../../types';

export const magnet2Plugin: FormulaPlugin = {
  id: 'magnet2',
  category: 'formula',
  name: 'explore.controls.formula.magnet2',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 16.0,
  family: 'magnet',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Magnet Type 2: z = ((z^2 + c)/(z^2 - c))^2
  vec2 z2 = complexSqr(z);
  vec2 numerator = z2 + c;
  vec2 denominator = z2 - c;
  vec2 ratio = complexDiv(numerator, denominator);
  return complexSqr(ratio);
}
`,
};
