import type { InsideColoringPlugin } from '../../types';

export const atomDomainInsideColoring: InsideColoringPlugin = {
  id: 'atomDomain',
  category: 'insideColoring',
  name: 'explore.controls.coloring.atomDomain',
  source: 'builtin',
  uniforms: [],
  needsOrbitStats: [],
  glsl: `
vec3 insideColor(OrbitStats s) {
  float t = fract(s.atomMin * 0.1);
  return u_useCustomGradient ? gradientColor(t) : getColor(t, u_paletteIndex);
}
`,
};
