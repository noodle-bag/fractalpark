import type { InsideColoringPlugin } from '../../types';

export const finalOrbitInsideColoring: InsideColoringPlugin = {
  id: 'finalOrbit',
  category: 'insideColoring',
  name: 'explore.controls.coloring.finalOrbit',
  source: 'builtin',
  uniforms: [],
  needsOrbitStats: [],
  glsl: `
vec3 insideColor(OrbitStats s) {
  float t = fract((s.finalAngle + 3.1415926) / 6.2831852);
  return u_useCustomGradient ? gradientColor(t) : getColor(t, u_paletteIndex);
}
`,
};
