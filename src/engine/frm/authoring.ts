import type { ViewBounds } from '../types';
import type { FormulaMetadata } from './ast';

export interface FormulaColoringHint {
  outsideColoringId?: string;
  insideColoringId?: string;
  paletteIndex?: number;
}

export interface FormulaExperienceHint {
  bounds?: ViewBounds;
  coloring?: FormulaColoringHint;
}

export interface FormulaSelectionRequest {
  formulaId: string;
  experienceHint?: FormulaExperienceHint;
}

export function formulaMetadataToExperienceHint(metadata?: FormulaMetadata): FormulaExperienceHint | undefined {
  if (!metadata) {
    return undefined;
  }

  const bounds = metadata.defaultView
    ? {
        centerX: metadata.defaultView.centerX,
        centerY: metadata.defaultView.centerY,
        zoom: metadata.defaultView.zoom,
        rotation: metadata.defaultView.rotation ?? 0,
      }
    : undefined;

  const coloring = metadata.defaultColoringHint
    ? {
        outsideColoringId: metadata.defaultColoringHint.outsideColoringId,
        insideColoringId: metadata.defaultColoringHint.insideColoringId,
        paletteIndex: metadata.defaultColoringHint.paletteIndex,
      }
    : undefined;

  if (!bounds && !coloring) {
    return undefined;
  }

  return {
    bounds,
    coloring,
  };
}

export function mergeFormulaExperienceHints(
  base?: FormulaExperienceHint,
  fallback?: FormulaExperienceHint,
): FormulaExperienceHint | undefined {
  if (!base && !fallback) {
    return undefined;
  }

  const mergedColoring = {
    ...fallback?.coloring,
    ...base?.coloring,
  };

  return {
    bounds: base?.bounds ?? fallback?.bounds,
    coloring: Object.keys(mergedColoring).length > 0 ? mergedColoring : undefined,
  };
}
