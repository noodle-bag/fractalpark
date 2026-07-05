import type { OutsideColoringPlugin } from '../../types';

export const tiaColoring: OutsideColoringPlugin = {
  id: 'tia',
  category: 'outsideColoring',
  name: 'explore.controls.coloring.tia',
  source: 'builtin',
  uniforms: [],
  needsOrbitStats: ['tiaSum'],
  glsl: `
float outsideColor(float si, int iter, OrbitStats s) {
  float avg = (iter > 0) ? s.tiaSum / float(iter) : 0.0;
  return fract(avg);
}
`,
};
