'use client';

import { useMemo } from 'react';
import { CURATED_PRESETS, presetToSavedFractal } from '@/engine/animation/curated-presets';
import type { SavedFractal } from '@/engine/types';

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Hook to get animated fractals for homepage slideshow
 *
 * v4 simplified: Always returns curated presets (6 built-in fractals)
 * No longer reads from localStorage - homepage shows consistent, high-quality content
 */
export function useAnimatedFractals(): SavedFractal[] {
  return useMemo(() => {
    const presets = CURATED_PRESETS.map(presetToSavedFractal);
    return shuffleArray(presets);
  }, []);
}
