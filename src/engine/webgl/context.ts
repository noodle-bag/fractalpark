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
