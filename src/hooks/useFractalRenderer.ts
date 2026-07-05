'use client';

import { useRef, useEffect, useCallback } from 'react';
import { FractalRenderer } from '@/engine/fractals/renderer';
import { registerBuiltins } from '@/engine/plugins/builtins';
import type { FractalParams } from '@/engine/types';

let registered = false;

export function useFractalRenderer(
  glRef: React.RefObject<WebGLRenderingContext | null>
) {
  const rendererRef = useRef<FractalRenderer | null>(null);

  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;

    try {
      if (!registered) {
        registerBuiltins();
        registered = true;
      }

      const renderer = new FractalRenderer(gl);
      rendererRef.current = renderer;
      void renderer.precompileDefault();

      return () => {
        renderer.dispose();
        rendererRef.current = null;
      };
    } catch (e) {
      console.error('Failed to initialize fractal renderer:', e);
    }
  }, [glRef]);

  const render = useCallback((params: FractalParams) => {
    void rendererRef.current?.render(params);
  }, []);

  const updateParams = useCallback(() => {
    // compatibility no-op
  }, []);

  return { render, updateParams, rendererRef };
}
