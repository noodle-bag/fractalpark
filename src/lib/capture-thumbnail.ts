export function captureThumbnail(
  canvas: HTMLCanvasElement,
  maxWidth = 600,
  maxHeight = 400
): string {
  const offscreen = document.createElement('canvas');
  offscreen.width = maxWidth;
  offscreen.height = maxHeight;

  const ctx = offscreen.getContext('2d');
  if (!ctx) return '';

  ctx.drawImage(canvas, 0, 0, maxWidth, maxHeight);
  return offscreen.toDataURL('image/jpeg', 0.85);
}
