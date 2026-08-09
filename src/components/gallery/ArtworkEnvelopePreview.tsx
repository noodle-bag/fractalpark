'use client';

import { lazy, Suspense, useEffect, useRef, useState } from 'react';

import { FractalRenderer } from '@/engine/fractals/renderer';
import {
  prepareArtworkPreview,
  type ArtworkPreviewData,
} from '@/lib/artwork-preview';
import { cn } from '@/lib/utils';
import { GALLERY_PREVIEW_MEDIA_CLASS } from './gallery-card-styles';

const AnimatedFractalCanvas = lazy(
  () => import('@/components/fractal/AnimatedFractalCanvas'),
);

interface RenderedArtworkPreview extends ArtworkPreviewData {
  cacheKey: string;
  dataUrl: string;
}

interface ArtworkEnvelopePreviewProps {
  previewKey: string;
  envelope?: unknown;
  loadEnvelope?: () => Promise<unknown>;
  autoplay?: boolean;
  liveOnHover?: boolean;
  eager?: boolean;
  ariaLabel?: string;
  className?: string;
}

const PREVIEW_WIDTH = 640;
const PREVIEW_HEIGHT = 400;
const MAX_PREVIEW_ITERATIONS = 600;
const MAX_CACHED_PREVIEWS = 72;
const PREVIEW_LOAD_TIMEOUT_MS = 20_000;

const previewCache = new Map<string, RenderedArtworkPreview>();
const previewRequests = new Map<string, Promise<RenderedArtworkPreview>>();
let renderQueue: Promise<void> = Promise.resolve();

function cachePreview(key: string, preview: RenderedArtworkPreview): void {
  previewCache.delete(key);
  previewCache.set(key, preview);
  if (previewCache.size <= MAX_CACHED_PREVIEWS) return;
  const oldestKey = previewCache.keys().next().value as string | undefined;
  if (oldestKey) previewCache.delete(oldestKey);
}

function readCachedPreview(key: string): RenderedArtworkPreview | undefined {
  const cached = previewCache.get(key);
  if (!cached) return undefined;
  previewCache.delete(key);
  previewCache.set(key, cached);
  return cached;
}

function enqueueRender<T>(task: () => Promise<T>): Promise<T> {
  const result = renderQueue.then(task, task);
  renderQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function renderEnvelopePreview(
  envelope: unknown,
): Promise<Omit<RenderedArtworkPreview, 'cacheKey'>> {
  const preview = await prepareArtworkPreview(envelope);
  if (!preview) throw new Error('invalid artwork preview envelope');

  const dataUrl = await enqueueRender(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = PREVIEW_WIDTH;
    canvas.height = PREVIEW_HEIGHT;
    const gl = canvas.getContext('webgl', {
      preserveDrawingBuffer: true,
      antialias: false,
      alpha: false,
    });
    if (!gl) throw new Error('WebGL is unavailable');

    const renderer = new FractalRenderer(gl, {
      formulaPlugin: preview.customFormulaPlugin ?? undefined,
    });
    try {
      await renderer.render({
        ...preview.params,
        maxIterations: Math.min(preview.params.maxIterations, MAX_PREVIEW_ITERATIONS),
        useSSAA: false,
      });
      gl.finish();
      return canvas.toDataURL('image/jpeg', 0.86);
    } finally {
      renderer.dispose();
      gl.getExtension?.('WEBGL_lose_context')?.loseContext();
    }
  });

  return { ...preview, dataUrl };
}

async function loadEnvelopeWithTimeout(
  loadEnvelope: (() => Promise<unknown>) | undefined,
): Promise<unknown> {
  if (!loadEnvelope) throw new Error('artwork preview envelope is unavailable');

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      loadEnvelope(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('artwork preview envelope request timed out')),
          PREVIEW_LOAD_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function getPreview(
  key: string,
  envelope: unknown | undefined,
  loadEnvelope: (() => Promise<unknown>) | undefined,
): Promise<RenderedArtworkPreview> {
  const cached = readCachedPreview(key);
  if (cached) return Promise.resolve(cached);

  const current = previewRequests.get(key);
  if (current) return current;

  const request = (async () => {
    const source =
      envelope !== undefined ? envelope : await loadEnvelopeWithTimeout(loadEnvelope);
    const rendered = await renderEnvelopePreview(source);
    const preview: RenderedArtworkPreview = { ...rendered, cacheKey: key };
    cachePreview(key, preview);
    return preview;
  })();
  previewRequests.set(key, request);
  void request.finally(() => previewRequests.delete(key)).catch(() => undefined);
  return request;
}

/**
 * Renderer-derived artwork media for cloud drafts and publications.
 *
 * Only near-viewport cards fetch their detail envelope. Static card images are
 * rendered through one serialized WebGL queue and cached; each render uses a
 * detached canvas whose context is explicitly released. A live canvas exists
 * only for an animated hovered card or visible animated detail preview.
 */
export function ArtworkEnvelopePreview({
  previewKey,
  envelope,
  loadEnvelope,
  autoplay = false,
  liveOnHover = true,
  eager = false,
  ariaLabel,
  className,
}: ArtworkEnvelopePreviewProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const requestKeyRef = useRef<string | null>(null);
  const loadEnvelopeRef = useRef(loadEnvelope);

  const [nearViewport, setNearViewport] = useState(
    eager || typeof IntersectionObserver === 'undefined',
  );
  const [preview, setPreview] = useState<RenderedArtworkPreview | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    loadEnvelopeRef.current = loadEnvelope;
  }, [loadEnvelope]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (eager || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => setNearViewport(entry.isIntersecting),
      { rootMargin: '240px 0px', threshold: 0.01 },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [eager]);

  useEffect(() => {
    if (!nearViewport || requestKeyRef.current === previewKey) return;

    requestKeyRef.current = previewKey;

    let cancelled = false;
    let completed = false;
    void Promise.resolve()
      .then(async () => {
        if (cancelled) return null;
        setPreview(null);
        setHovered(false);
        setStatus('loading');
        return getPreview(previewKey, envelope, loadEnvelopeRef.current);
      })
      .then(
        (result) => {
          completed = true;
          if (cancelled || !result) return;
          setPreview(result);
          setStatus('ready');
        },
        () => {
          completed = true;
          if (cancelled) return;
          requestKeyRef.current = null;
          setStatus('failed');
        },
      );
    return () => {
      cancelled = true;
      if (!completed && requestKeyRef.current === previewKey) requestKeyRef.current = null;
    };
  }, [envelope, nearViewport, previewKey]);

  const currentPreview = preview?.cacheKey === previewKey ? preview : null;
  const hasAnimation = (currentPreview?.keyframes.length ?? 0) >= 2;
  const showLive = Boolean(
    currentPreview &&
      nearViewport &&
      hasAnimation &&
      (autoplay || (liveOnHover && hovered)),
  );

  return (
    <span
      ref={hostRef}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-busy={status === 'loading' ? true : undefined}
      data-testid="artwork-envelope-preview"
      data-preview-key={previewKey}
      data-preview-state={status}
      onPointerEnter={(event) => {
        if (
          currentPreview &&
          hasAnimation &&
          (event.pointerType === 'mouse' || event.pointerType === 'pen')
        ) {
          setHovered(true);
        }
      }}
      onPointerLeave={() => setHovered(false)}
      className={cn('relative block h-full w-full overflow-hidden', className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-0 block bg-gradient-to-br from-slate-950 via-slate-800 to-slate-600',
          status === 'loading' && 'animate-pulse',
        )}
      />

      {currentPreview ? (
        // Renderer output is a session-local data URL, so Next/Image adds no value.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentPreview.dataUrl}
          alt=""
          aria-hidden="true"
          className={cn('absolute inset-0', GALLERY_PREVIEW_MEDIA_CLASS)}
        />
      ) : null}

      {showLive && currentPreview ? (
        <span className="pointer-events-none absolute inset-0 block">
          <Suspense fallback={<span className="block h-full w-full" />}>
            <AnimatedFractalCanvas
              params={currentPreview.params}
              keyframes={currentPreview.keyframes}
              formulaPlugin={currentPreview.customFormulaPlugin ?? undefined}
              dprScale={autoplay ? 0.75 : 0.5}
              maxIterationsClamp={MAX_PREVIEW_ITERATIONS}
              className="h-full w-full"
            />
          </Suspense>
        </span>
      ) : null}
    </span>
  );
}
