import type { TransformPlugin } from '../../types';

export const mobiusTransform: TransformPlugin = {
  id: 'mobius',
  category: 'transform',
  name: 'explore.controls.transform.mobius',
  source: 'builtin',
  uniforms: [
    {
      name: 'u_mobiusA',
      type: 'vec2',
      default: [1.0, 0.0],
      label: 'explore.controls.mobiusA',
    },
    {
      name: 'u_mobiusB',
      type: 'vec2',
      default: [0.0, 0.0],
      label: 'explore.controls.mobiusB',
    },
    {
      name: 'u_mobiusC',
      type: 'vec2',
      default: [0.0, 0.0],
      label: 'explore.controls.mobiusC',
    },
    {
      name: 'u_mobiusD',
      type: 'vec2',
      default: [1.0, 0.0],
      label: 'explore.controls.mobiusD',
    },
  ],
  glsl: `
vec2 transformUV(vec2 uv) {
  // Mobius transform: (az+b)/(cz+d)
  vec2 numerator = complexMul(u_mobiusA, uv) + u_mobiusB;
  vec2 denominator = complexMul(u_mobiusC, uv) + u_mobiusD;
  return complexDiv(numerator, denominator);
}
`,
};
