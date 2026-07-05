import type { TransformPlugin } from '../../types';

export const kaleidoscopeTransform: TransformPlugin = {
  id: 'kaleidoscope',
  category: 'transform',
  name: 'explore.controls.transform.kaleidoscope',
  source: 'builtin',
  uniforms: [
    {
      name: 'u_kaleidoFold',
      type: 'int',
      default: 6,
      min: 3,
      max: 12,
      step: 1,
      label: 'explore.controls.kaleidoFold',
    },
    {
      name: 'u_kaleidoCenterX',
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.01,
      label: 'explore.controls.kaleidoCenterX',
      group: 'center',
    },
    {
      name: 'u_kaleidoCenterY',
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.01,
      label: 'explore.controls.kaleidoCenterY',
      group: 'center',
    },
  ],
  glsl: `
vec2 transformUV(vec2 uv) {
  vec2 kaleidoCenter = vec2(u_kaleidoCenterX, u_kaleidoCenterY);
  vec2 delta = uv - kaleidoCenter;
  float angle = atan(delta.y, delta.x);
  float radius = length(delta);
  float sector = 6.28318 / float(u_kaleidoFold);
  angle = mod(angle, sector);
  if (angle > sector * 0.5) angle = sector - angle;
  return kaleidoCenter + vec2(cos(angle), sin(angle)) * radius;
}
`,
};
