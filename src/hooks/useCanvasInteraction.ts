'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { ViewBounds } from '@/engine/types';

interface UseCanvasInteractionOptions {
  onBoundsChange: (bounds: ViewBounds) => void;
  initialBounds?: ViewBounds;
  onPointSelect?: (point: [number, number]) => void;
}

const DEFAULT_BOUNDS: ViewBounds = {
  centerX: -0.5,
  centerY: 0,
  zoom: 0.4,
  rotation: 0,
};

export function useCanvasInteraction(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  options: UseCanvasInteractionOptions
) {
  const { onBoundsChange, initialBounds, onPointSelect } = options;
  const boundsRef = useRef<ViewBounds>(initialBounds ?? DEFAULT_BOUNDS);

  // Sync boundsRef when external bounds change (e.g., URL params, reset, mode switch)
  useEffect(() => {
    if (initialBounds) {
      boundsRef.current = initialBounds;
    }
  }, [initialBounds]);
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const pinchDistRef = useRef(0);
  const pinchAngleRef = useRef(0);
  const movedRef = useRef(false);

  const updateBounds = useCallback(
    (newBounds: ViewBounds) => {
      boundsRef.current = newBounds;
      onBoundsChange(newBounds);
    },
    [onBoundsChange]
  );

  const resetView = useCallback(() => {
    updateBounds(DEFAULT_BOUNDS);
  }, [updateBounds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const bounds = boundsRef.current;
      if (e.shiftKey || e.altKey) {
        const delta = e.deltaY > 0 ? 0.05 : -0.05;
        updateBounds({ ...bounds, rotation: (bounds.rotation ?? 0) + delta });
      } else {
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        updateBounds({ ...bounds, zoom: bounds.zoom * factor });
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      movedRef.current = false;
      lastPosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const bounds = boundsRef.current;
      const rect = canvas.getBoundingClientRect();
      const scale = 1 / (bounds.zoom * Math.min(rect.width, rect.height));
      const dx = (e.clientX - lastPosRef.current.x) * scale;
      const dy = (e.clientY - lastPosRef.current.y) * scale;
      if (Math.abs(e.clientX - lastPosRef.current.x) > 1 || Math.abs(e.clientY - lastPosRef.current.y) > 1) {
        movedRef.current = true;
      }
      const rotation = bounds.rotation ?? 0;
      const cos_r = Math.cos(rotation);
      const sin_r = Math.sin(rotation);
      const dxRotated = dx * cos_r + dy * sin_r;
      const dyRotated = -dx * sin_r + dy * cos_r;
      updateBounds({
        ...bounds,
        centerX: bounds.centerX - dxRotated,
        centerY: bounds.centerY + dyRotated,
      });
      lastPosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    const handleClick = (e: MouseEvent) => {
      if (!onPointSelect || movedRef.current || e.button !== 0) return;

      const bounds = boundsRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = rect.bottom - e.clientY;
      const minDim = Math.min(rect.width, rect.height);
      const uvX = (x - rect.width * 0.5) / minDim;
      const uvY = (y - rect.height * 0.5) / minDim;
      const rotation = bounds.rotation ?? 0;
      const cos_r = Math.cos(rotation);
      const sin_r = Math.sin(rotation);
      const rotatedX = uvX * cos_r - uvY * sin_r;
      const rotatedY = uvX * sin_r + uvY * cos_r;
      const pointX = rotatedX / bounds.zoom + bounds.centerX;
      const pointY = rotatedY / bounds.zoom + bounds.centerY;

      onPointSelect([pointX, pointY]);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDraggingRef.current = true;
        lastPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        isDraggingRef.current = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
        pinchAngleRef.current = Math.atan2(dy, dx);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const bounds = boundsRef.current;
      if (e.touches.length === 1 && isDraggingRef.current) {
        const rect = canvas.getBoundingClientRect();
        const scale = 1 / (bounds.zoom * Math.min(rect.width, rect.height));
        const dx = (e.touches[0].clientX - lastPosRef.current.x) * scale;
        const dy = (e.touches[0].clientY - lastPosRef.current.y) * scale;
        const rotation = bounds.rotation ?? 0;
        const cos_r = Math.cos(rotation);
        const sin_r = Math.sin(rotation);
        const dxRotated = dx * cos_r + dy * sin_r;
        const dyRotated = -dx * sin_r + dy * cos_r;
        updateBounds({
          ...bounds,
          centerX: bounds.centerX - dxRotated,
          centerY: bounds.centerY + dyRotated,
        });
        lastPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        if (pinchDistRef.current > 0) {
          const factor = dist / pinchDistRef.current;
          const rotationDelta = angle - pinchAngleRef.current;
          updateBounds({
            ...bounds,
            zoom: bounds.zoom * factor,
            rotation: (bounds.rotation ?? 0) + rotationDelta,
          });
        }
        pinchDistRef.current = dist;
        pinchAngleRef.current = angle;
      }
    };

    const handleTouchEnd = () => {
      isDraggingRef.current = false;
      pinchDistRef.current = 0;
      pinchAngleRef.current = 0;
    };

    const handleDblClick = () => {
      resetView();
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener('dblclick', handleDblClick);
    canvas.addEventListener('click', handleClick);

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('dblclick', handleDblClick);
      canvas.removeEventListener('click', handleClick);
    };
  }, [canvasRef, updateBounds, resetView, onPointSelect]);

  return { boundsRef, resetView };
}
