import type { InsideColoringPlugin } from '../../types';

export const blackInsideColoring: InsideColoringPlugin = {
  id: 'black',
  category: 'insideColoring',
  name: 'explore.controls.coloring.black',
  source: 'builtin',
  uniforms: [],
  needsOrbitStats: [],
  glsl: `
vec3 insideColor(OrbitStats s) { return vec3(0.0); }
`,
};
