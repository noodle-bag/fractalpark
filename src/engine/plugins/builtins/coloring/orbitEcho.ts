import type { OutsideColoringPlugin } from '../../types';

export const orbitEchoColoring: OutsideColoringPlugin = {
  id: 'orbitEcho',
  category: 'outsideColoring',
  name: 'explore.controls.coloring.orbitEcho',
  source: 'builtin',
  uniforms: [],
  needsOrbitStats: [],
  glsl: `
float outsideColor(float si, int iter, OrbitStats s) {
  float orbitSpan = max(0.0, sqrt(max(s.maxRadius, 0.0)) - sqrt(max(s.minRadius, 0.0)));
  float memory = length(s.finalZ - s.zPrev);
  float radial = sqrt(max(s.radius2, 0.0));
  return fract(memory * 0.75 + orbitSpan * 0.35 + radial * 0.08);
}
`,
};
