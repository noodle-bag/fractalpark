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

export async function compileFractalProgramAsync(
  gl: WebGLRenderingContext,
  vertSource: string,
  fragSource: string,
  timeout: number,
  signal: AbortSignal,
): Promise<{ program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation> }> {
  const deadline = performance.now() + timeout;
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  let completed = false;
  const checkActive = () => {
    if (signal.aborted) throw new Error('Shader compile cancelled');
    if (gl.isContextLost()) throw new Error('WebGL context lost');
    if (performance.now() >= deadline) throw new Error('Shader compile timeout');
  };
  try {
    checkActive();
    const parallel = gl.getExtension('KHR_parallel_shader_compile');
    for (const [type, source] of [[gl.VERTEX_SHADER, vertSource], [gl.FRAGMENT_SHADER, fragSource]] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error(`Failed to create shader of type ${type}`);
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
    }
    program = gl.createProgram();
    if (!program) throw new Error('Failed to create WebGL program');
    for (const shader of shaders) gl.attachShader(program, shader);
    gl.linkProgram(program);

    // Status and uniform queries can block until linking finishes. Only the
    // extension's completion query is non-blocking; yield between polls.
    do {
      await new Promise<void>((resolve) => setTimeout(resolve, 16));
      checkActive();
    } while (parallel && !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR));

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const shaderLog = shaders
        .filter((shader) => !gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        .map((shader) => gl.getShaderInfoLog(shader))
        .filter(Boolean)
        .join('\n');
      throw new Error(`Program linking failed: ${shaderLog || gl.getProgramInfoLog(program) || 'Unknown error'}`);
    }
    const uniforms = discoverUniforms(gl, program);
    completed = true;
    return { program, uniforms };
  } finally {
    for (const shader of shaders) gl.deleteShader(shader);
    if (!completed && program) gl.deleteProgram(program);
  }
}
