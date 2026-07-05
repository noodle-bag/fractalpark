import type { OutsideColoringPlugin } from '../../types';

export const binaryColoring: OutsideColoringPlugin = {
  id: 'binary',
  category: 'outsideColoring',
  name: 'explore.controls.coloring.binary',
  source: 'builtin',
  uniforms: [],
  needsOrbitStats: [],
  glsl: `
float outsideColor(float si, int iter, OrbitStats s) {
  return mod(float(iter), 2.0);
}
`,
};
