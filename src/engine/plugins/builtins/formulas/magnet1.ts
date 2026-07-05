import type { FormulaPlugin } from '../../types';

export const magnet1Plugin: FormulaPlugin = {
  id: 'magnet1',
  category: 'formula',
  name: 'explore.controls.formula.magnet1',
  source: 'builtin',
  supportsPower: false,
  supportsJulia: true,
  bailout: 16.0,
  family: 'magnet',
  uniforms: [],
  glsl: `
vec2 iterateStep(vec2 z, vec2 c, vec2 zPrev, vec2 point) {
  // Magnet Type 1: z = ((z + c)/(z - c))^2
  vec2 numerator = z + c;
  vec2 denominator = z - c;
  vec2 ratio = complexDiv(numerator, denominator);
  return complexSqr(ratio);
}
`,
};
