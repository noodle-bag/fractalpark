'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import {
  createWebGLContext,
  getWebGLCapabilities,
  setupContextLossHandling,
  type WebGLCapabilities,
} from '@/engine/webgl/context';

export function useWebGL(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const [isContextLost, setIsContextLost] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<WebGLCapabilities | null>(null);
  const updateError = useCallback((nextError: string | null) => {
    queueMicrotask(() => {
      setError(nextError);
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = createWebGLContext(canvas);
    if (!gl) {
      updateError('WebGL is not supported on this device');
      return;
    }

    glRef.current = gl;
    setCapabilities(getWebGLCapabilities(gl));
    updateError(null);

    const cleanup = setupContextLossHandling(
      canvas,
      () => {
        setIsContextLost(true);
        glRef.current = null;
        setCapabilities(null);
      },
      () => {
        const restored = createWebGLContext(canvas);
        if (restored) {
          glRef.current = restored;
          setCapabilities(getWebGLCapabilities(restored));
          setIsContextLost(false);
        }
      }
    );

    return () => {
      cleanup();
      glRef.current = null;
      setCapabilities(null);
    };
  }, [canvasRef, updateError]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }, [canvasRef]);

  return { glRef, isContextLost, error, capabilities, resize };
}
