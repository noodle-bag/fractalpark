'use client';

import { useState, useCallback, useMemo } from 'react';
import type { FractalDocument } from '@/engine/document';
import { documentToRuntimeParams } from '@/engine/document-adapter';
import { normalizeRuntimeFractalParams } from '@/engine/document-migrate';
import type { FractalParams, SavedFractal, KeyframeAnimation } from '@/engine/types';

const STORAGE_KEY = 'myfrac-saved-fractals';

function loadFromStorage(): SavedFractal[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SavedFractal => typeof item === 'object' && item !== null)
      .map((item) => ({
        ...item,
        params: normalizeRuntimeFractalParams(item.params),
      }));
  } catch {
    return [];
  }
}

function saveToStorage(fractals: SavedFractal[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fractals));
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded');
    }
    return false;
  }
}

function sortFractals(fractals: SavedFractal[]): SavedFractal[] {
  return [...fractals].sort((a, b) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    return b.createdAt - a.createdAt;
  });
}

export function useSavedFractals() {
  const [fractals, setFractals] = useState<SavedFractal[]>(() =>
    sortFractals(loadFromStorage())
  );

  const starred = useMemo(
    () => fractals.filter((f) => f.starred),
    [fractals]
  );

  const update = useCallback((updater: (prev: SavedFractal[]) => SavedFractal[]) => {
    setFractals((prev) => {
      const next = sortFractals(updater(prev));
      saveToStorage(next);
      return next;
    });
  }, []);

  const save = useCallback(
    (name: string, params: FractalParams, thumbnail: string): string => {
      const id = crypto.randomUUID();
      const entry: SavedFractal = {
        id,
        name,
        params,
        createdAt: Date.now(),
        thumbnail,
        starred: false,
      };
      update((prev) => [...prev, entry]);
      return id;
    },
    [update]
  );

  const saveDocument = useCallback(
    (name: string, document: FractalDocument, thumbnail: string): string => {
      const id = crypto.randomUUID();
      const entry: SavedFractal = {
        id,
        name,
        params: documentToRuntimeParams(document),
        createdAt: Date.now(),
        thumbnail,
        starred: false,
        animation: document.animation ? { keyframes: document.animation.keyframes } : undefined,
      };
      update((prev) => [...prev, entry]);
      return id;
    },
    [update]
  );

  const remove = useCallback(
    (id: string) => {
      update((prev) => prev.filter((f) => f.id !== id));
    },
    [update]
  );

  const rename = useCallback(
    (id: string, name: string) => {
      update((prev) =>
        prev.map((f) => (f.id === id ? { ...f, name } : f))
      );
    },
    [update]
  );

  const toggleStar = useCallback(
    (id: string) => {
      update((prev) =>
        prev.map((f) => (f.id === id ? { ...f, starred: !f.starred } : f))
      );
    },
    [update]
  );

  const updateAnimation = useCallback(
    (id: string, animation: KeyframeAnimation) => {
      update((prev) =>
        prev.map((f) => (f.id === id ? { ...f, animation } : f))
      );
    },
    [update]
  );

  const storageInfo = useMemo(() => {
    const json = JSON.stringify(fractals);
    return {
      count: fractals.length,
      usedBytes: new Blob([json]).size,
    };
  }, [fractals]);

  return {
    fractals,
    starred,
    save,
    saveDocument,
    remove,
    rename,
    toggleStar,
    updateAnimation,
    storageInfo,
  };
}
