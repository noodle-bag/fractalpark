import { FractalRenderer } from '@/engine/fractals/renderer';
import type { FractalParams } from '@/engine/types';

/** Choose tile size based on SSAA level; returns 0 to skip tiling. */
function chooseTileSize(ssaaLevel: number, totalPixels: number): number {
  // Only tile when workload is high enough to risk GPU timeout
  // Threshold: ~4M pixels × ssaa samples (conservative)
  const workload = totalPixels * Math.max(ssaaLevel, 1);
  if (workload <= 16_000_000) return 0; // no tiling needed

  if (ssaaLevel >= 16) return 1024;
  if (ssaaLevel >= 9) return 2048;
  return 0;
}

export async function exportFractal(
  params: FractalParams,
  canvasWidth: number,
  canvasHeight: number,
  scale: number
): Promise<void> {
  const width = Math.round(canvasWidth * scale);
  const height = Math.round(canvasHeight * scale);

  const ssaaLevel = params.ssaaLevel ?? (params.useSSAA ? 4 : 0);
  const tileSize = chooseTileSize(ssaaLevel, width * height);

  let finalCanvas: HTMLCanvasElement;

  if (tileSize > 0) {
    // Tiled rendering — reuse a single WebGL context to avoid evicting
    // the main canvas context (browsers limit concurrent contexts to ~8-16)
    const glCanvas = document.createElement('canvas');
    const gl = glCanvas.getContext('webgl', { preserveDrawingBuffer: true });
    if (!gl) throw new Error('Failed to create WebGL context for export');

    const renderer = new FractalRenderer(gl);

    finalCanvas = document.createElement('canvas');
    finalCanvas.width = width;
    finalCanvas.height = height;
    const ctx = finalCanvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create 2D context for export composite');

    const tilesX = Math.ceil(width / tileSize);
    const tilesY = Math.ceil(height / tileSize);

    try {
      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          const offsetX = tx * tileSize;
          const offsetY = ty * tileSize;
          const tileW = Math.min(tileSize, width - offsetX);
          const tileH = Math.min(tileSize, height - offsetY);

          // Resize the GL canvas to tile dimensions
          glCanvas.width = tileW;
          glCanvas.height = tileH;

          // WebGL gl_FragCoord.y=0 is at the bottom; Canvas2D y=0 is at the top
          const glOffsetY = height - offsetY - tileH;
          await renderer.render({
            ...params,
            _tileInfo: { fullWidth: width, fullHeight: height, offsetX, offsetY: glOffsetY },
          });

          // drawImage uses Canvas2D coordinates (top-left origin)
          ctx.drawImage(glCanvas, offsetX, offsetY);
        }
      }
    } finally {
      renderer.dispose();
    }
  } else {
    // Single-pass rendering (original path)
    finalCanvas = document.createElement('canvas');
    finalCanvas.width = width;
    finalCanvas.height = height;

    const gl = finalCanvas.getContext('webgl', { preserveDrawingBuffer: true });
    if (!gl) throw new Error('Failed to create WebGL context for export');

    const renderer = new FractalRenderer(gl);
    try {
      await renderer.render(params);
    } finally {
      renderer.dispose();
    }
  }

  return new Promise<void>((resolve, reject) => {
    finalCanvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to create PNG blob'));
          return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.href = url;
        a.download = `myfrac-${timestamp}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        resolve();
      },
      'image/png'
    );
  });
}
