import { compileShader, createProgram } from './shader';
import type { WebGLResources } from '../types';

const QUAD_VERTICES = new Float32Array([
  -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
]);

function setupFullscreenQuad(gl: WebGLRenderingContext, program: WebGLProgram): void {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW);

  const positionAttr = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(positionAttr);
  gl.vertexAttribPointer(positionAttr, 2, gl.FLOAT, false, 0, 0);
}

export function discoverUniforms(
  gl: WebGLRenderingContext,
  program: WebGLProgram
): Record<string, WebGLUniformLocation> {
  const uniforms: Record<string, WebGLUniformLocation> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;

  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;

    const loc = gl.getUniformLocation(program, info.name);
    if (loc) uniforms[info.name] = loc;

    if (info.size > 1) {
      const base = info.name.replace(/\[0\]$/, '');
      for (let j = 0; j < info.size; j++) {
        const elemLoc = gl.getUniformLocation(program, `${base}[${j}]`);
        if (elemLoc) uniforms[`${base}[${j}]`] = elemLoc;
      }
    }
  }

  return uniforms;
}

export function compileFractalProgram(
  gl: WebGLRenderingContext,
  vertSource: string,
  fragSource: string
): { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation> } {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
  const program = createProgram(gl, vertexShader, fragmentShader);
  const uniforms = discoverUniforms(gl, program);
  return { program, uniforms };
}

export function createFractalProgram(
  gl: WebGLRenderingContext,
  vertSource: string,
  fragSource: string
): WebGLResources {
  const { program, uniforms } = compileFractalProgram(gl, vertSource, fragSource);
  setupFullscreenQuad(gl, program);
  return { gl, program, uniforms };
}
