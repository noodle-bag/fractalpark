'use client';

import { useCallback, useMemo, useState } from 'react';
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
import type { FractalParams, PluginParamRecord } from '@/engine/types';
import { applyFormulaSelectionDefaults } from '@/lib/formula-documents';
import { applyRemixSource, parseRemixSource } from '@/lib/remix-source';
import { decodeParams } from '@/lib/url-params';

function createInitialDocument(searchParams: URLSearchParams): FractalDocument {
  // v0.4.16: the `?artwork=` local handoff is gone — Explore initializes
  // from URL params, `?draft=` (cloud), or the one-shot remix handoff only.
  const document = migrateFractalDocument(decodeParams(searchParams), 0);
  return applyRemixSource(document, parseRemixSource(searchParams));
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
  if (!prev.animation && !patch.viewKeyframes && !patch.tracks) {
    return prev;
  }

  return normalizeFractalDocument({
    ...prev,
    animation: {
      ...prev.animation,
      ...patch,
      viewKeyframes: patch.viewKeyframes ?? prev.animation?.viewKeyframes,
      tracks: patch.tracks ?? prev.animation?.tracks,
    },
  });
}

function cleanPluginParams(
  params: PluginParamRecord | undefined,
): PluginParamRecord | undefined {
  return params && Object.keys(params).length > 0 ? params : undefined;
}

export interface ResolvedPluginParamDomains {
  formula: PluginParamRecord;
  outside?: PluginParamRecord;
  inside?: PluginParamRecord;
  transform?: PluginParamRecord;
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
  replacePluginParamDomains: (domains: ResolvedPluginParamDomains) => void;
  selectBuiltInFormula: (formulaId: string) => void;
  resetToDefault: () => void;
  loadFromDocument: (doc: FractalDocument) => void;
}

export function useExploreDocumentState(initialSearchParams: URLSearchParams): ExploreDocumentState {
  const [document, setDocument] = useState<FractalDocument>(() => createInitialDocument(initialSearchParams));

  const runtimeParams = useMemo(() => documentToRuntimeParams(document), [document]);

  const updateBounds = useCallback((bounds: SceneState['bounds']) => {
    setDocument((prev) => mergeSceneState(prev, { bounds }));
  }, []);

  const updateFormula = useCallback((patch: Partial<FormulaState>) => {
    setDocument((prev) => mergeFormulaState(prev, patch));
  }, []);

  const updateColoring = useCallback((patch: Partial<ColoringState>) => {
    setDocument((prev) => mergeColoringState(prev, patch));
  }, []);

  const updateTransform = useCallback((patch: Partial<TransformState>) => {
    setDocument((prev) => mergeTransformState(prev, patch));
  }, []);

  const updateRender = useCallback((patch: Partial<RenderState>) => {
    setDocument((prev) => mergeRenderState(prev, patch));
  }, []);

  const updateAnimation = useCallback((patch: Partial<AnimationState>) => {
    setDocument((prev) => mergeAnimationState(prev, patch));
  }, []);

  const replacePluginParamDomains = useCallback(
    (domains: ResolvedPluginParamDomains) => {
      setDocument((prev) => {
        const formula = cleanPluginParams(domains.formula);
        const outside = cleanPluginParams(domains.outside);
        const inside = cleanPluginParams(domains.inside);
        const transform = cleanPluginParams(domains.transform);
        const coloringScript = prev.coloring.params?.coloringScript;
        return normalizeFractalDocument({
          ...prev,
          formula: {
            ...prev.formula,
            params: formula ? { formula } : undefined,
          },
          coloring: {
            ...prev.coloring,
            params: outside || inside || coloringScript
              ? { outside, inside, coloringScript }
              : undefined,
          },
          transform: {
            ...prev.transform,
            params: transform ? { transform } : undefined,
          },
        });
      });
    },
    [],
  );

  const selectBuiltInFormula = useCallback((formulaId: string) => {
    setDocument((prev) => applyFormulaSelectionDefaults(prev, formulaId));
  }, []);

  const resetToDefault = useCallback(() => {
    setDocument(normalizeFractalDocument(DEFAULT_FRACTAL_DOCUMENT));
  }, []);

  const loadFromDocument = useCallback((doc: FractalDocument) => {
    setDocument(normalizeFractalDocument(doc));
  }, []);

  return {
    document,
    runtimeParams,
    updateBounds,
    updateFormula,
    updateColoring,
    updateTransform,
    updateRender,
    updateAnimation,
    replacePluginParamDomains,
    selectBuiltInFormula,
    resetToDefault,
    loadFromDocument,
  };
}
