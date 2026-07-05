'use client';

import Image from 'next/image';
import { useRef, useEffect, useState, useCallback } from 'react';
import { FractalRenderer } from '@/engine/fractals/renderer';
import { registerBuiltins } from '@/engine/plugins/builtins';
import { cn } from '@/lib/utils';
import type { FractalParams } from '@/engine/types';

// Global cache for rendered thumbnails
const thumbnailCache = new Map<string, string>();

// Singleton plugin registration
let builtinsRegistered = false;

interface PresetThumbnailProps {
  params: FractalParams;
  presetId: string;
  className?: string;
}

/**
 * Renders a fractal thumbnail and caches it as data URL
 * Uses low resolution (160x160) for performance
 */
export function PresetThumbnail({
  params,
  presetId,
  className,
}: PresetThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(
    thumbnailCache.get(presetId) || null
  );
  const [isRendering, setIsRendering] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // IntersectionObserver to lazy load
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check if already cached
    if (thumbnailCache.has(presetId)) {
      setThumbnailUrl(thumbnailCache.get(presetId)!);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
        }
      },
      { rootMargin: '50px' }
    );

    observer.observe(canvas);
    return () => observer.disconnect();
  }, [presetId]);

  // Render thumbnail when visible and not cached
  const renderThumbnail = useCallback(async () => {
    if (!isVisible || thumbnailUrl || isRendering) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsRendering(true);

    try {
      // Register plugins
      if (!builtinsRegistered) {
        registerBuiltins();
        builtinsRegistered = true;
      }

      // Get WebGL context
      const gl = canvas.getContext('webgl', {
        preserveDrawingBuffer: true,
        antialias: false,
      });
      if (!gl) {
        console.error('WebGL not supported for thumbnail');
        return;
      }

      // Create renderer
      const renderer = new FractalRenderer(gl);
      await renderer.precompileDefault();

      // Set canvas size (low resolution for thumbnail)
      const thumbnailSize = 320;
      canvas.width = thumbnailSize;
      canvas.height = thumbnailSize;

      // Render one frame
      renderer.render({
        ...params,
        maxIterations: Math.min(params.maxIterations, 300),
        useSSAA: false,
      });

      // Capture as data URL
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

      // Cache it
      thumbnailCache.set(presetId, dataUrl);
      setThumbnailUrl(dataUrl);

      // Dispose renderer
      renderer.dispose();
    } catch (error) {
      console.error('Failed to render thumbnail:', error);
    } finally {
      setIsRendering(false);
    }
  }, [isVisible, thumbnailUrl, isRendering, params, presetId]);

  // Trigger render when visible
  useEffect(() => {
    void renderThumbnail();
  }, [renderThumbnail]);

  // Show gradient placeholder while loading
  if (!thumbnailUrl) {
    return (
      <div className={cn('bg-gradient-to-br from-slate-700 via-slate-600 to-slate-500', className)}>
        <canvas
          ref={canvasRef}
          className="opacity-0"
          style={{ width: 1, height: 1 }}
        />
      </div>
    );
  }

  // Show rendered thumbnail
  return (
    <Image
      src={thumbnailUrl}
      alt=""
      width={320}
      height={320}
      className={cn('object-cover', className)}
      unoptimized
    />
  );
}

/**
 * Clear thumbnail cache (useful for testing)
 */
export function clearThumbnailCache(): void {
  thumbnailCache.clear();
}

/**
 * Get cached thumbnail URL if exists
 */
export function getCachedThumbnail(presetId: string): string | undefined {
  return thumbnailCache.get(presetId);
}
