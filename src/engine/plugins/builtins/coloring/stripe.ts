import type { OutsideColoringPlugin } from '../../types';

export const stripeColoring: OutsideColoringPlugin = {
  id: 'stripe',
  category: 'outsideColoring',
  name: 'explore.controls.coloring.stripe',
  source: 'builtin',
  uniforms: [],
  needsOrbitStats: [],
  glsl: `
float outsideColor(float si, int iter, OrbitStats s) {
  float avg = (iter > 0) ? s.stripeSum / float(iter) : 0.0;
  return fract(avg);
}
`,
};
