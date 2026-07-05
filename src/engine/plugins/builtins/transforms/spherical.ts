import type { TransformPlugin } from '../../types';

export const sphericalTransform: TransformPlugin = {
  id: 'spherical',
  category: 'transform',
  name: 'explore.controls.transform.spherical',
  source: 'builtin',
  uniforms: [
    {
      name: 'u_sphericalAmount',
      type: 'float',
      default: 1.0,
      min: 0.25,
      max: 3.0,
      step: 0.05,
      label: 'explore.controls.sphericalAmount',
    },
  ],
  glsl: `
vec2 transformUV(vec2 uv) {
  // Spherical projection: uv = uv / (r² + epsilon)
  float r2 = dot(uv, uv);
  return uv / (r2 * u_sphericalAmount + 0.0001);
}
`,
};
