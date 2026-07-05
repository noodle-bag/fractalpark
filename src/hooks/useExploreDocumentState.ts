'use client';

import { useMemo, useState } from 'react';
import { documentToRuntimeParams } from '@/engine/document-adapter';
import {
  DEFAULT_FRACTAL_DOCUMENT,
  type AnimationState,
  type ColoringState,
  type FormulaState,
  type FractalDocument,
  type RenderState,
  type SceneState,
  type TransformState,
} from '@/engine/document';
import { migrateFractalDocument, normalizeFractalDocument } from '@/engine/document-migrate';
import type { FractalParams } from '@/engine/types';
import { decodeParams } from '@/lib/url-params';

function createInitialDocument(searchParams: URLSearchParams): FractalDocument {
  return migrateFractalDocument(decodeParams(searchParams), 0);
}

function mergeSceneState(prev: FractalDocument, patch: Partial<SceneState>): FractalDocument {
  return normalizeFractalDocument({
    ...prev,
    scene: {
      ...prev.scene,
      ...patch,
      bounds: patch.bounds ? { ...prev.scene.bounds, ...patch.bounds } : prev.scene.bounds,
    },
  });
}

function mergeFormulaState(prev: FractalDocument, patch: Partial<FormulaState>): FractalDocument {
  const hasParamsPatch = patch.params !== undefined;

  return normalizeFractalDocument({
    ...prev,
    formula: {
      ...prev.formula,
      ...patch,
      params: hasParamsPatch
        ? {
            ...prev.formula.params,
            ...patch.params,
            formula: patch.params && 'formula' in patch.params ? patch.params.formula : prev.formula.params?.formula,
          }
        : prev.formula.params,
    },
  });
}

function mergeColoringState(prev: FractalDocument, patch: Partial<ColoringState>): FractalDocument {
  const hasParamsPatch = patch.params !== undefined;

  return normalizeFractalDocument({
    ...prev,
    coloring: {
      ...prev.coloring,
      ...patch,
      orbitTrap: patch.orbitTrap ? { ...prev.coloring.orbitTrap, ...patch.orbitTrap } : prev.coloring.orbitTrap,
      lighting: patch.lighting ? { ...prev.coloring.lighting, ...patch.lighting } : prev.coloring.lighting,
      params: hasParamsPatch
        ? {
            ...prev.coloring.params,
            ...patch.params,
            outside: patch.params && 'outside' in patch.params ? patch.params.outside : prev.coloring.params?.outside,
            inside: patch.params && 'inside' in patch.params ? patch.params.inside : prev.coloring.params?.inside,
            coloringScript:
              patch.params && 'coloringScript' in patch.params
                ? patch.params.coloringScript
                : prev.coloring.params?.coloringScript,
          }
        : prev.coloring.params,
    },
  });
}

function mergeTransformState(prev: FractalDocument, patch: Partial<TransformState>): FractalDocument {
  const hasParamsPatch = patch.params !== undefined;

  return normalizeFractalDocument({
    ...prev,
    transform: {
      ...prev.transform,
      ...patch,
      params: hasParamsPatch
        ? {
            ...prev.transform.params,
            ...patch.params,
            transform:
              patch.params && 'transform' in patch.params ? patch.params.transform : prev.transform.params?.transform,
          }
        : prev.transform.params,
    },
  });
}

function mergeRenderState(prev: FractalDocument, patch: Partial<RenderState>): FractalDocument {
  return normalizeFractalDocument({
    ...prev,
    render: {
      ...prev.render,
      ...patch,
    },
  });
}

function mergeAnimationState(prev: FractalDocument, patch: Partial<AnimationState>): FractalDocument {
  if (!prev.animation && !patch.keyframes) {
    return prev;
  }

  return normalizeFractalDocument({
    ...prev,
    animation: {
      ...prev.animation,
      ...patch,
      keyframes: patch.keyframes ?? prev.animation?.keyframes ?? [],
    },
  });
}

export interface ExploreDocumentState {
  document: FractalDocument;
  runtimeParams: FractalParams;
  updateBounds: (bounds: SceneState['bounds']) => void;
  updateFormula: (patch: Partial<FormulaState>) => void;
  updateColoring: (patch: Partial<ColoringState>) => void;
  updateTransform: (patch: Partial<TransformState>) => void;
  updateRender: (patch: Partial<RenderState>) => void;
  updateAnimation: (patch: Partial<AnimationState>) => void;
  resetToDefault: () => void;
  loadFromDocument: (doc: FractalDocument) => void;
}

export function useExploreDocumentState(initialSearchParams: URLSearchParams): ExploreDocumentState {
  const [document, setDocument] = useState<FractalDocument>(() => createInitialDocument(initialSearchParams));

  const runtimeParams = useMemo(() => documentToRuntimeParams(document), [document]);

  return {
    document,
    runtimeParams,
    updateBounds: (bounds) => {
      setDocument((prev) => mergeSceneState(prev, { bounds }));
    },
    updateFormula: (patch) => {
      setDocument((prev) => mergeFormulaState(prev, patch));
    },
    updateColoring: (patch) => {
      setDocument((prev) => mergeColoringState(prev, patch));
    },
    updateTransform: (patch) => {
      setDocument((prev) => mergeTransformState(prev, patch));
    },
    updateRender: (patch) => {
      setDocument((prev) => mergeRenderState(prev, patch));
    },
    updateAnimation: (patch) => {
      setDocument((prev) => mergeAnimationState(prev, patch));
    },
    resetToDefault: () => {
      setDocument(normalizeFractalDocument(DEFAULT_FRACTAL_DOCUMENT));
    },
    loadFromDocument: (doc) => {
      setDocument(normalizeFractalDocument(doc));
    },
  };
}
