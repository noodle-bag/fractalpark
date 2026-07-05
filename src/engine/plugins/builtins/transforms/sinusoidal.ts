import type { TransformPlugin } from '../../types';

export const sinusoidalTransform: TransformPlugin = {
  id: 'sinusoidal',
  category: 'transform',
  name: 'explore.controls.transform.sinusoidal',
  source: 'builtin',
  uniforms: [
    {
      name: 'u_sinAmp',
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 2.0,
      step: 0.05,
      label: 'explore.controls.sinAmp',
    },
    {
      name: 'u_sinFreq',
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 3.0,
      step: 0.1,
      label: 'explore.controls.sinFreq',
    },
  ],
  glsl: `
vec2 transformUV(vec2 uv) {
  // Sinusoidal distortion
  return sin(uv * u_sinFreq) * u_sinAmp;
}
`,
};
