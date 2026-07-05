'use client';

import { useState, useEffect, useCallback } from 'react';
import { loadBuiltinPresets, type GalleryPreset } from '@/lib/gallery-presets';

interface UseBuiltinPresetsOptions {
  locale: string;
  enabled?: boolean;
}

interface UseBuiltinPresetsReturn {
  presets: GalleryPreset[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to load builtin gallery presets
 */
export function useBuiltinPresets(
  options: UseBuiltinPresetsOptions
): UseBuiltinPresetsReturn {
  const { locale, enabled = true } = options;
  const [presets, setPresets] = useState<GalleryPreset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchPresets = useCallback(async () => {
    if (!enabled) {
      setPresets([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await loadBuiltinPresets(locale);
      setPresets(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load presets'));
      console.error('Failed to load builtin presets:', err);
    } finally {
      setIsLoading(false);
    }
  }, [locale, enabled]);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  return {
    presets,
    isLoading,
    error,
    refetch: fetchPresets,
  };
}
