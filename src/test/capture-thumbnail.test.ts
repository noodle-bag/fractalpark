import { afterEach, describe, expect, it, vi } from 'vitest';

import { captureThumbnail } from '@/lib/capture-thumbnail';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('captureThumbnail', () => {
  it('returns raw JPEG base64 for the cloud thumbnail contract', () => {
    const drawImage = vi.fn();
    const context = { drawImage } as unknown as CanvasRenderingContext2D;
    const offscreen = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toDataURL: vi.fn(() => 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='),
    } as unknown as HTMLCanvasElement;
    vi.spyOn(document, 'createElement').mockReturnValue(offscreen);
    const source = {} as HTMLCanvasElement;

    expect(captureThumbnail(source)).toBe('/9j/4AAQSkZJRg==');
    expect(offscreen.width).toBe(600);
    expect(offscreen.height).toBe(400);
    expect(drawImage).toHaveBeenCalledWith(source, 0, 0, 600, 400);
  });

  it('fails closed when the browser does not return a base64 data URL', () => {
    const offscreen = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toDataURL: vi.fn(() => 'data:,'),
    } as unknown as HTMLCanvasElement;
    vi.spyOn(document, 'createElement').mockReturnValue(offscreen);

    expect(captureThumbnail({} as HTMLCanvasElement)).toBe('');
  });
});
