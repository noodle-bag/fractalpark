import type { OutsideColoringPlugin } from '../../types';

export const orbitTrapColoring: OutsideColoringPlugin = {
  id: 'orbitTrap',
  category: 'outsideColoring',
  name: 'explore.controls.coloring.orbitTrap',
  source: 'builtin',
  uniforms: [],
  needsOrbitStats: ['trapMin'],
  glsl: `
float outsideColor(float si, int iter, OrbitStats s) {
  return fract(exp(-s.trapMin * max(u_orbitTrapWidth, 0.0001)));
}
`,
};
