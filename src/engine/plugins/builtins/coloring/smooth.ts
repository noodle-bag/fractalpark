import type { OutsideColoringPlugin } from '../../types';

export const smoothColoring: OutsideColoringPlugin = {
  id: 'smooth',
  category: 'outsideColoring',
  name: 'explore.controls.coloring.smooth',
  source: 'builtin',
  uniforms: [],
  needsOrbitStats: [],
  glsl: `
float outsideColor(float si, int iter, OrbitStats s) {
  return fract(si / float(u_maxIterations) * 4.0);
}
`,
};
