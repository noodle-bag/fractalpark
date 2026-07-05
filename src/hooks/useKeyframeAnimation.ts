'use client';

import { useRef, useEffect, useMemo } from 'react';
import type { ViewBounds, Keyframe } from '@/engine/types';
import { buildTimeline, totalDuration, interpolateAtTime } from '@/engine/animation/interpolate';

export interface UseKeyframeAnimationOptions {
  keyframes: Keyframe[];
  onFrame: (bounds: ViewBounds) => void;
  onLoopComplete?: () => void;
  active: boolean;  // Controls whether animation is running
  resetOnStop?: boolean; // If true (default), reset elapsed time when stopped. Set false to resume from current position.
}

export interface UseKeyframeAnimationReturn {
  elapsedTime: number;     // Current elapsed time in loop
  totalDuration: number;   // Total loop duration
  progress: number;        // 0-1 current loop progress
}

/**
 * Hook for keyframe animation playback using requestAnimationFrame
 * 
 * Design principles:
 * - Does NOT trigger React re-renders for frame updates
 * - onFrame callback receives bounds directly for imperative rendering
 * - Exposes static metadata for optional UI usage
 * - Pauses when document is hidden or active is false
 */
export function useKeyframeAnimation(
  options: UseKeyframeAnimationOptions
): UseKeyframeAnimationReturn {
  const { keyframes, onFrame, onLoopComplete, active, resetOnStop = true } = options;

  // Refs for animation state (don't trigger re-renders)
  const rafIdRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const elapsedTimeRef = useRef<number>(0);
  const segmentsRef = useRef<ReturnType<typeof buildTimeline>>([]);
  const totalDurRef = useRef<number>(0);
  const animateRef = useRef<(timestamp: number) => void>(() => {});

  // Build timeline when keyframes change
  useEffect(() => {
    segmentsRef.current = buildTimeline(keyframes);
    totalDurRef.current = totalDuration(segmentsRef.current);
  }, [keyframes]);

  // Keep animation callback fresh without mutating refs during render
  useEffect(() => {
    animateRef.current = (timestamp: number) => {
      if (!active || document.hidden) {
        // Pause: reset last timestamp so we resume correctly
        lastTimestampRef.current = null;
        rafIdRef.current = null;
        return;
      }

      const totalDur = totalDurRef.current;
      if (totalDur <= 0 || keyframes.length < 2) {
        // Not enough keyframes to animate
        rafIdRef.current = null;
        return;
      }

      // Calculate delta time
      if (lastTimestampRef.current === null) {
        lastTimestampRef.current = timestamp;
      }
      const delta = (timestamp - lastTimestampRef.current) / 1000; // Convert to seconds
      lastTimestampRef.current = timestamp;

      // Update elapsed time
      elapsedTimeRef.current += delta;

      // Check for loop completion
      if (elapsedTimeRef.current >= totalDur) {
        elapsedTimeRef.current = elapsedTimeRef.current % totalDur;
        onLoopComplete?.();
      }

      // Interpolate bounds at current time
      const bounds = interpolateAtTime(
        segmentsRef.current,
        totalDur,
        elapsedTimeRef.current
      );

      // Call frame callback (imperative, no setState)
      onFrame(bounds);

      // Continue loop
      rafIdRef.current = requestAnimationFrame((ts) => {
        animateRef.current(ts);
      });
    };
  }, [active, keyframes.length, onFrame, onLoopComplete]);

  // Start/stop animation
  useEffect(() => {
    if (active && keyframes.length >= 2 && totalDurRef.current > 0) {
      // Start animation
      rafIdRef.current = requestAnimationFrame((ts) => {
        animateRef.current(ts);
      });
    } else {
      // Stop animation
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      lastTimestampRef.current = null;
      // Reset elapsed time so next play-through starts from the beginning
      // (skipped when resetOnStop=false, e.g. homepage pause/resume)
      if (resetOnStop) {
        elapsedTimeRef.current = 0;
      }
    }

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [active, keyframes.length, resetOnStop]);

  // Handle visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Pause: cancel rAF, reset timestamp
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        lastTimestampRef.current = null;
      } else if (active && keyframes.length >= 2) {
        // Resume: request new frame
        lastTimestampRef.current = null; // Will be set on first frame
        rafIdRef.current = requestAnimationFrame((ts) => {
          animateRef.current(ts);
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [active, keyframes.length]);

  // Static return values for callers that want metadata
  const totalDur = useMemo(() => {
    if (keyframes.length < 2) return 0;
    return totalDuration(buildTimeline(keyframes));
  }, [keyframes]);

  return {
    elapsedTime: 0,
    totalDuration: totalDur,
    progress: 0,
  };
}
