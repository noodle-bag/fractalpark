'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  FractalRenderWorkerClient,
  type FractalRenderRequest,
} from '@/engine/fractals/render-worker-client';

export function useFractalRenderWorker() {
  const clientRef = useRef<FractalRenderWorkerClient | null>(null);

  const render = useCallback((request: FractalRenderRequest) => {
    clientRef.current ??= new FractalRenderWorkerClient();
    return clientRef.current.render(request);
  }, []);

  const cancel = useCallback(() => clientRef.current?.cancelPending(), []);

  useEffect(() => () => {
    clientRef.current?.dispose();
    clientRef.current = null;
  }, []);

  return { render, cancel };
}
