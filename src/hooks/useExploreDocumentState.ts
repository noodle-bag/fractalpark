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
import type { PublishedFormulaProfileV1 } from '@/engine/formulas/v1';
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

export interface PublishedFormulaDocumentSelection {
  formulaId: string;
  formulaParams: PluginParamRecord;
  profile: PublishedFormulaProfileV1;
}

interface ExploreDocumentHistoryState {
  document: FractalDocument;
  publishedFormulaUndo: FractalDocument | null;
}

type FractalDocumentUpdate =
  | FractalDocument
  | ((previous: FractalDocument) => FractalDocument);

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
  applyPublishedFormulaSelection: (selection: PublishedFormulaDocumentSelection) => void;
  canUndoPublishedFormulaSelection: boolean;
  undoPublishedFormulaSelection: () => void;
  clearPublishedFormulaSelectionUndo: () => void;
  selectBuiltInFormula: (formulaId: string) => void;
  resetToDefault: () => void;
  loadFromDocument: (doc: FractalDocument) => void;
}

export function useExploreDocumentState(
  initialSearchParams: URLSearchParams,
  onBeforeDocumentMutation?: () => void,
): ExploreDocumentState {
  const [historyState, setHistoryState] = useState<ExploreDocumentHistoryState>(() => ({
    document: createInitialDocument(initialSearchParams),
    publishedFormulaUndo: null,
  }));
  const document = historyState.document;
  const canUndoPublishedFormulaSelection = historyState.publishedFormulaUndo !== null;
  const setDocument = useCallback((update: FractalDocumentUpdate) => {
    onBeforeDocumentMutation?.();
    setHistoryState((previous) => ({
      document: typeof update === 'function'
        ? update(previous.document)
        : update,
      publishedFormulaUndo: null,
    }));
  }, [onBeforeDocumentMutation]);

  const runtimeParams = useMemo(() => documentToRuntimeParams(document), [document]);

  const updateBounds = useCallback((bounds: SceneState['bounds']) => {
    setDocument((prev) => mergeSceneState(prev, { bounds }));
  }, [setDocument]);

  const updateFormula = useCallback((patch: Partial<FormulaState>) => {
    setDocument((prev) => mergeFormulaState(prev, patch));
  }, [setDocument]);

  const updateColoring = useCallback((patch: Partial<ColoringState>) => {
    setDocument((prev) => mergeColoringState(prev, patch));
  }, [setDocument]);

  const updateTransform = useCallback((patch: Partial<TransformState>) => {
    setDocument((prev) => mergeTransformState(prev, patch));
  }, [setDocument]);

  const updateRender = useCallback((patch: Partial<RenderState>) => {
    setDocument((prev) => mergeRenderState(prev, patch));
  }, [setDocument]);

  const updateAnimation = useCallback((patch: Partial<AnimationState>) => {
    setDocument((prev) => mergeAnimationState(prev, patch));
  }, [setDocument]);

  const replacePluginParamDomains = useCallback(
    (domains: ResolvedPluginParamDomains) => {
      setHistoryState((previous) => {
        const formula = cleanPluginParams(domains.formula);
        const outside = cleanPluginParams(domains.outside);
        const inside = cleanPluginParams(domains.inside);
        const transform = cleanPluginParams(domains.transform);
        const coloringScript = previous.document.coloring.params?.coloringScript;
        return {
          ...previous,
          document: normalizeFractalDocument({
            ...previous.document,
            formula: {
              ...previous.document.formula,
              params: formula ? { formula } : undefined,
            },
            coloring: {
              ...previous.document.coloring,
              params: outside || inside || coloringScript
                ? { outside, inside, coloringScript }
                : undefined,
            },
            transform: {
              ...previous.document.transform,
              params: transform ? { transform } : undefined,
            },
          }),
        };
      });
    },
    [],
  );

  const clearPublishedFormulaSelectionUndo = useCallback(() => {
    setHistoryState((previous) =>
      previous.publishedFormulaUndo
        ? { ...previous, publishedFormulaUndo: null }
        : previous,
    );
  }, []);

  const applyPublishedFormulaSelection = useCallback(
    (selection: PublishedFormulaDocumentSelection) => {
      setHistoryState((previous) => {
        const current = previous.document;
        const formulaParams = cleanPluginParams(selection.formulaParams);
        const juliaC: [number, number] = selection.profile.juliaC
          ? [selection.profile.juliaC[0], selection.profile.juliaC[1]]
          : current.formula.juliaC;
        const next = normalizeFractalDocument({
          ...current,
          scene: {
            ...current.scene,
            bounds: {
              centerX: selection.profile.center[0],
              centerY: selection.profile.center[1],
              zoom: selection.profile.zoom,
              rotation: selection.profile.rotation,
            },
          },
          formula: {
            ...current.formula,
            formulaId: selection.formulaId,
            isJulia: selection.profile.mode === 'julia',
            juliaC,
            params: formulaParams ? { formula: formulaParams } : undefined,
          },
          render: {
            ...current.render,
            maxIterations: selection.profile.iterations,
          },
        });
        return {
          document: next,
          publishedFormulaUndo: current,
        };
      });
    },
    [],
  );

  const undoPublishedFormulaSelection = useCallback(() => {
    setHistoryState((previous) => {
      if (!previous.publishedFormulaUndo) return previous;
      return {
        document: normalizeFractalDocument(previous.publishedFormulaUndo),
        publishedFormulaUndo: null,
      };
    });
  }, []);

  const selectBuiltInFormula = useCallback((formulaId: string) => {
    onBeforeDocumentMutation?.();
    setHistoryState((previous) => ({
      document: applyFormulaSelectionDefaults(previous.document, formulaId),
      publishedFormulaUndo: null,
    }));
  }, [onBeforeDocumentMutation]);

  const resetToDefault = useCallback(() => {
    onBeforeDocumentMutation?.();
    setHistoryState({
      document: normalizeFractalDocument(DEFAULT_FRACTAL_DOCUMENT),
      publishedFormulaUndo: null,
    });
  }, [onBeforeDocumentMutation]);

  const loadFromDocument = useCallback((doc: FractalDocument) => {
    onBeforeDocumentMutation?.();
    setHistoryState({
      document: normalizeFractalDocument(doc),
      publishedFormulaUndo: null,
    });
  }, [onBeforeDocumentMutation]);

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
    applyPublishedFormulaSelection,
    canUndoPublishedFormulaSelection,
    undoPublishedFormulaSelection,
    clearPublishedFormulaSelectionUndo,
    selectBuiltInFormula,
    resetToDefault,
    loadFromDocument,
  };
}
