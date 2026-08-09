import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ArtworkEnvelopePreview } from '@/components/gallery/ArtworkEnvelopePreview';
import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import { createFractalDocumentEnvelope } from '@/lib/fractal-file';

const rendererMocks = vi.hoisted(() => ({
  precompileDefault: vi.fn(async () => undefined),
  render: vi.fn(async () => undefined),
  dispose: vi.fn(),
}));

vi.mock('@/engine/fractals/renderer', () => ({
  FractalRenderer: class FractalRenderer {
    precompileDefault = rendererMocks.precompileDefault;
    render = rendererMocks.render;
    dispose = rendererMocks.dispose;
  },
}));

class ImmediateIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '240px 0px';
  readonly thresholds = [0.01];

  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe(target: Element): void {
    queueMicrotask(() => {
      this.callback(
        [
          {
            boundingClientRect: target.getBoundingClientRect(),
            intersectionRatio: 1,
            intersectionRect: target.getBoundingClientRect(),
            isIntersecting: true,
            rootBounds: null,
            target,
            time: performance.now(),
          },
        ],
        this,
      );
    });
  }

  disconnect(): void {}
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

const fakeGl = { finish: vi.fn() } as unknown as WebGLRenderingContext;

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeGl);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/jpeg;base64,rendered-fractal',
  );
  rendererMocks.precompileDefault.mockClear();
  rendererMocks.render.mockClear();
  rendererMocks.dispose.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ArtworkEnvelopePreview', () => {
  it('loads only after intersection and replaces the neutral surface with renderer output', async () => {
    const envelope = await createFractalDocumentEnvelope(DEFAULT_FRACTAL_DOCUMENT, []);
    if (!envelope.success) throw new Error('test envelope could not be created');
    const loadEnvelope = vi.fn(async () => envelope.value);

    const { container } = render(
      <ArtworkEnvelopePreview
        previewKey="component-preview-valid"
        loadEnvelope={loadEnvelope}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('artwork-envelope-preview')).toHaveAttribute(
        'data-preview-state',
        'ready',
      );
    });

    expect(loadEnvelope).toHaveBeenCalledTimes(1);
    expect(rendererMocks.precompileDefault).not.toHaveBeenCalled();
    expect(rendererMocks.render).toHaveBeenCalledWith(
      expect.objectContaining({
        formula: DEFAULT_FRACTAL_DOCUMENT.formula.formulaId,
        useSSAA: false,
      }),
    );
    expect(rendererMocks.dispose).toHaveBeenCalledTimes(1);
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,rendered-fractal',
    );
  });

  it('fails closed without displaying a false preview for an invalid envelope', async () => {
    const { container } = render(
      <ArtworkEnvelopePreview
        previewKey="component-preview-invalid"
        loadEnvelope={async () => ({ invalid: true })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('artwork-envelope-preview')).toHaveAttribute(
        'data-preview-state',
        'failed',
      );
    });
    expect(container.querySelector('img')).toBeNull();
  });
});
