'use client';

import { useMemo, useState, useCallback } from 'react';
import { useBuiltinPresets } from './useBuiltinPresets';
import { useSavedFractals } from './useSavedFractals';
import { presetToSavedFractal } from '@/lib/gallery-presets';
import type { GalleryPreset } from '@/lib/gallery-presets';
import type { SavedFractal } from '@/engine/types';

export interface GalleryItem extends SavedFractal {
  isBuiltin: boolean;
  featured: boolean;
}

interface UseGalleryItemsOptions {
  locale: string;
}

interface UseGalleryItemsReturn {
  items: GalleryItem[];
  isLoading: boolean;
  builtinCount: number;
  userCount: number;
  toggleStar: (id: string) => void;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
}

const STARRED_BUILTINS_KEY = 'myfrac-starred-builtins';

function loadStarredBuiltins(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STARRED_BUILTINS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveStarredBuiltins(ids: Set<string>) {
  try {
    localStorage.setItem(STARRED_BUILTINS_KEY, JSON.stringify([...ids]));
  } catch { /* ignore quota errors */ }
}

/**
 * Hook to get all gallery items (builtin presets + user saved)
 * Builtin presets come first, followed by user saved fractals
 */
export function useGalleryItems(options: UseGalleryItemsOptions): UseGalleryItemsReturn {
  const { locale } = options;

  const { presets: builtinPresets, isLoading: isLoadingBuiltin } = useBuiltinPresets({
    locale,
    enabled: true,
  });

  const {
    fractals: userFractals,
    toggleStar: toggleUserStar,
    remove,
    rename,
  } = useSavedFractals();

  const [starredBuiltins, setStarredBuiltins] = useState<Set<string>>(loadStarredBuiltins);

  const toggleStar = useCallback((id: string) => {
    // Check if it's a builtin preset
    const isBuiltin = builtinPresets.some((p: GalleryPreset) => p.id === id);
    if (isBuiltin) {
      setStarredBuiltins(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        saveStarredBuiltins(next);
        return next;
      });
    } else {
      toggleUserStar(id);
    }
  }, [builtinPresets, toggleUserStar]);

  const items = useMemo<GalleryItem[]>(() => {
    // Convert builtin presets to GalleryItem format
    const builtinItems: GalleryItem[] = builtinPresets.map((preset: GalleryPreset) => ({
      ...presetToSavedFractal(preset),
      starred: starredBuiltins.has(preset.id),
      isBuiltin: true,
      featured: preset.featured,
    }));

    // Convert user fractals to GalleryItem format
    const userItems: GalleryItem[] = userFractals.map((fractal: SavedFractal) => ({
      ...fractal,
      isBuiltin: false,
      featured: false,
    }));

    // Merge: builtin first, then user saved
    return [...builtinItems, ...userItems];
  }, [builtinPresets, userFractals, starredBuiltins]);

  return {
    items,
    isLoading: isLoadingBuiltin,
    builtinCount: builtinPresets.length,
    userCount: userFractals.length,
    toggleStar,
    remove,
    rename,
  };
}
