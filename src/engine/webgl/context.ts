export interface WebGLCapabilities {
  fragmentHighp: boolean;
  maxFragmentUniformVectors: number;
  extensions: {
    standardDerivatives: boolean;
    parallelShaderCompile: boolean;
    disjointTimerQuery: boolean;
    srgb: boolean;
    colorBufferFloat: boolean;
    colorBufferHalfFloat: boolean;
  };
}

export function getWebGLCapabilities(gl: WebGLRenderingContext): WebGLCapabilities {
  const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);

  return {
    fragmentHighp: Boolean(precision && precision.precision > 0),
    maxFragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) as number,
    extensions: {
      standardDerivatives: gl.getExtension('OES_standard_derivatives') !== null,
      parallelShaderCompile: gl.getExtension('KHR_parallel_shader_compile') !== null,
      disjointTimerQuery: gl.getExtension('EXT_disjoint_timer_query') !== null,
      srgb: gl.getExtension('EXT_sRGB') !== null,
      colorBufferFloat: gl.getExtension('WEBGL_color_buffer_float') !== null,
      colorBufferHalfFloat: gl.getExtension('EXT_color_buffer_half_float') !== null,
    },
  };
}

export function createWebGLContext(
  canvas: HTMLCanvasElement
): WebGLRenderingContext | null {
  const contextAttributes: WebGLContextAttributes = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
  };

  const gl =
    (canvas.getContext('webgl', contextAttributes) as WebGLRenderingContext) ??
    (canvas.getContext(
      'experimental-webgl',
      contextAttributes
    ) as WebGLRenderingContext);

  return gl ?? null;
}

export function setupContextLossHandling(
  canvas: HTMLCanvasElement,
  onLost: () => void,
  onRestored: () => void
): () => void {
  const handleLost = (e: Event) => {
    e.preventDefault();
    onLost();
  };
  const handleRestored = () => {
    onRestored();
  };

  canvas.addEventListener('webglcontextlost', handleLost);
  canvas.addEventListener('webglcontextrestored', handleRestored);

  return () => {
    canvas.removeEventListener('webglcontextlost', handleLost);
    canvas.removeEventListener('webglcontextrestored', handleRestored);
  };
}
