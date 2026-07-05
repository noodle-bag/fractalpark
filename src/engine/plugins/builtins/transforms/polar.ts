import type { TransformPlugin } from '../../types';

export const polarTransform: TransformPlugin = {
  id: 'polar',
  category: 'transform',
  name: 'explore.controls.transform.polar',
  source: 'builtin',
  uniforms: [
    {
      name: 'u_polarAngleScale',
      type: 'float',
      default: 1.0,
      min: 0.25,
      max: 3.0,
      step: 0.05,
      label: 'explore.controls.polarAngleScale',
    },
    {
      name: 'u_polarRadiusScale',
      type: 'float',
      default: 0.5,
      min: 0.1,
      max: 2.0,
      step: 0.05,
      label: 'explore.controls.polarRadiusScale',
    },
  ],
  glsl: `
vec2 transformUV(vec2 uv) {
  // Polar coordinates: (angle, radius) -> (x, y)
  float angle = atan(uv.y, uv.x);
  float radius = length(uv);
  // Map to a reasonable range
  return vec2((angle / 3.14159) * u_polarAngleScale, radius * u_polarRadiusScale);
}
`,
};
