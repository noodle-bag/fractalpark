import type { TransformPlugin } from '../../types';

export const inversionTransform: TransformPlugin = {
  id: 'inversion',
  category: 'transform',
  name: 'explore.controls.transform.inversion',
  source: 'builtin',
  uniforms: [
    {
      name: 'u_invRadius',
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 2.0,
      step: 0.05,
      label: 'explore.controls.invRadius',
    },
    {
      name: 'u_invCenterX',
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.01,
      label: 'explore.controls.invCenterX',
      group: 'center',
    },
    {
      name: 'u_invCenterY',
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.01,
      label: 'explore.controls.invCenterY',
      group: 'center',
    },
  ],
  glsl: `
vec2 transformUV(vec2 uv) {
  // Circle inversion: r' = radius² / r
  vec2 invCenter = vec2(u_invCenterX, u_invCenterY);
  vec2 delta = uv - invCenter;
  float r2 = dot(delta, delta);
  if (r2 < 0.0001) return uv;
  float scale = (u_invRadius * u_invRadius) / r2;
  return invCenter + delta * scale;
}
`,
};
