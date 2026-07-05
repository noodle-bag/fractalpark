import type { TransformPlugin } from '../../types';

export const noneTransform: TransformPlugin = {
  id: 'none',
  category: 'transform',
  name: 'explore.controls.transform.none',
  source: 'builtin',
  uniforms: [],
  glsl: `
vec2 transformUV(vec2 uv) { return uv; }
`,
};
