import { pluginRegistry } from './plugins/registry';
import type { FractalParams, PluginParamRecord, PluginParamValue } from './types';
import type { FractalUrlState } from '@/lib/url-params';
import {
  DEFAULT_DOCUMENT_BOUNDS,
  DEFAULT_DOCUMENT_JULIA_C,
  DEFAULT_DOCUMENT_LIGHTING,
  DEFAULT_DOCUMENT_ORBIT_TRAP,
  DEFAULT_FRACTAL_DOCUMENT,
  type AnimationState,
  type FractalDocument,
  type FractalDocumentMetadata,
} from './document';

function cleanRecord(values: PluginParamRecord): PluginParamRecord | undefined {
  return Object.keys(values).length > 0 ? values : undefined;
}

function clonePluginParamValue(value: PluginParamValue): PluginParamValue {
  return Array.isArray(value) ? [...value] as PluginParamValue : value;
}

function splitPluginParams(params: FractalParams): {
  formula?: PluginParamRecord;
  outside?: PluginParamRecord;
  inside?: PluginParamRecord;
  transform?: PluginParamRecord;
} {
  const source = params.pluginParams ?? {};
  const remaining = new Map(Object.entries(source));
  const formula: PluginParamRecord = {};
  const outside: PluginParamRecord = {};
  const inside: PluginParamRecord = {};
  const transform: PluginParamRecord = {};

  const formulaPlugin = pluginRegistry.getFormula(params.formula);
  const outsidePlugin = pluginRegistry.getOutsideColoring(params.outsideColoring);
  const insidePlugin = pluginRegistry.getInsideColoring(params.insideColoring);
  const transformPlugin = pluginRegistry.getTransform(params.transformId ?? 'none');

  for (const descriptor of formulaPlugin?.uniforms ?? []) {
    if (remaining.has(descriptor.name)) {
      formula[descriptor.name] = clonePluginParamValue(remaining.get(descriptor.name) as PluginParamValue);
      remaining.delete(descriptor.name);
    }
  }

  for (const descriptor of outsidePlugin?.uniforms ?? []) {
    if (remaining.has(descriptor.name)) {
      outside[descriptor.name] = clonePluginParamValue(remaining.get(descriptor.name) as PluginParamValue);
      remaining.delete(descriptor.name);
    }
  }

  for (const descriptor of insidePlugin?.uniforms ?? []) {
    if (remaining.has(descriptor.name)) {
      inside[descriptor.name] = clonePluginParamValue(remaining.get(descriptor.name) as PluginParamValue);
      remaining.delete(descriptor.name);
    }
  }

  for (const descriptor of transformPlugin?.uniforms ?? []) {
    if (remaining.has(descriptor.name)) {
      transform[descriptor.name] = clonePluginParamValue(remaining.get(descriptor.name) as PluginParamValue);
      remaining.delete(descriptor.name);
    }
  }

  for (const [key, value] of remaining) {
    formula[key] = clonePluginParamValue(value as PluginParamValue);
  }

  return {
    formula: cleanRecord(formula),
    outside: cleanRecord(outside),
    inside: cleanRecord(inside),
    transform: cleanRecord(transform),
  };
}

function flattenPluginParams(doc: FractalDocument): PluginParamRecord | undefined {
  const flattened: PluginParamRecord = {};

  for (const [key, value] of Object.entries(doc.formula.params?.formula ?? {})) {
    flattened[key] = clonePluginParamValue(value);
  }
  for (const [key, value] of Object.entries(doc.coloring.params?.outside ?? {})) {
    flattened[key] = clonePluginParamValue(value);
  }
  for (const [key, value] of Object.entries(doc.coloring.params?.inside ?? {})) {
    flattened[key] = clonePluginParamValue(value);
  }
  for (const [key, value] of Object.entries(doc.transform.params?.transform ?? {})) {
    flattened[key] = clonePluginParamValue(value);
  }
  for (const [key, value] of Object.entries(doc.coloring.params?.coloringScript ?? {})) {
    flattened[key] = clonePluginParamValue(value);
  }

  return cleanRecord(flattened);
}

export function runtimeParamsToDocument(
  params: FractalParams,
  extras?: { animation?: AnimationState; metadata?: FractalDocumentMetadata }
): FractalDocument {
  const split = splitPluginParams(params);

  return {
    schemaVersion: DEFAULT_FRACTAL_DOCUMENT.schemaVersion,
    scene: {
      bounds: {
        centerX: params.bounds.centerX,
        centerY: params.bounds.centerY,
        zoom: params.bounds.zoom,
        rotation: params.bounds.rotation ?? 0,
      },
    },
    formula: {
      formulaId: params.formula,
      isJulia: params.isJulia,
      juliaC: params.juliaC,
      power: params.power,
      params: cleanRecord(split.formula ?? {}) ? { formula: split.formula } : undefined,
    },
    coloring: {
      paletteIndex: params.paletteIndex,
      customGradient: params.customGradient,
      outsideColoringId: params.outsideColoring,
      insideColoringId: params.insideColoring,
      orbitTrap: params.orbitTrap,
      lighting: params.lighting,
      params:
        split.outside || split.inside
          ? {
              outside: split.outside,
              inside: split.inside,
            }
          : undefined,
    },
    transform: {
      transformId: params.transformId ?? 'none',
      params: split.transform ? { transform: split.transform } : undefined,
    },
    render: {
      maxIterations: params.maxIterations,
      useSSAA: params.useSSAA,
      adaptiveIterations: params.adaptiveIterations,
    },
    animation: extras?.animation,
    metadata: extras?.metadata,
  };
}

export function documentToRuntimeParams(doc: FractalDocument): FractalParams {
  return {
    maxIterations: doc.render.maxIterations,
    paletteIndex: doc.coloring.paletteIndex,
    bounds: {
      centerX: doc.scene.bounds.centerX,
      centerY: doc.scene.bounds.centerY,
      zoom: doc.scene.bounds.zoom,
      rotation: doc.scene.bounds.rotation ?? 0,
    },
    isJulia: doc.formula.isJulia,
    juliaC: doc.formula.juliaC,
    power: doc.formula.power,
    customGradient: doc.coloring.customGradient,
    formula: doc.formula.formulaId,
    outsideColoring: doc.coloring.outsideColoringId,
    insideColoring: doc.coloring.insideColoringId,
    transformId: doc.transform.transformId,
    pluginParams: flattenPluginParams(doc),
    orbitTrap: doc.coloring.orbitTrap,
    useSSAA: doc.render.useSSAA,
    adaptiveIterations: doc.render.adaptiveIterations,
    lighting: doc.coloring.lighting,
  };
}

export function urlStateToDocument(
  state: FractalUrlState,
  extras?: { metadata?: FractalDocumentMetadata }
): FractalDocument {
  const bounds = {
    centerX: state.centerX ?? DEFAULT_DOCUMENT_BOUNDS.centerX,
    centerY: state.centerY ?? DEFAULT_DOCUMENT_BOUNDS.centerY,
    zoom: state.zoom ?? DEFAULT_DOCUMENT_BOUNDS.zoom,
    rotation: state.rotation ?? DEFAULT_DOCUMENT_BOUNDS.rotation,
  };

  return {
    schemaVersion: DEFAULT_FRACTAL_DOCUMENT.schemaVersion,
    scene: { bounds },
    formula: {
      formulaId: state.formula ?? DEFAULT_FRACTAL_DOCUMENT.formula.formulaId,
      isJulia: state.julia ?? DEFAULT_FRACTAL_DOCUMENT.formula.isJulia,
      juliaC:
        state.juliaRe !== undefined && state.juliaIm !== undefined
          ? [state.juliaRe, state.juliaIm]
          : DEFAULT_DOCUMENT_JULIA_C,
      power: state.power ?? DEFAULT_FRACTAL_DOCUMENT.formula.power,
      // NOTE: URL-decoded pluginParams carry no domain information (formula vs
      // outside/inside/transform).  We place them all under formula.params as a
      // best-effort grouping.  documentToRuntimeParams flattens them back into a
      // single Record before handing off to the renderer, so runtime behaviour is
      // always correct regardless of which namespace they land in here.
      params: state.pluginParams ? { formula: { ...state.pluginParams } } : undefined,
    },
    coloring: {
      paletteIndex: state.palette ?? DEFAULT_FRACTAL_DOCUMENT.coloring.paletteIndex,
      customGradient: state.gradient ?? DEFAULT_FRACTAL_DOCUMENT.coloring.customGradient,
      outsideColoringId: state.outsideColoring ?? DEFAULT_FRACTAL_DOCUMENT.coloring.outsideColoringId,
      insideColoringId: state.insideColoring ?? DEFAULT_FRACTAL_DOCUMENT.coloring.insideColoringId,
      orbitTrap: state.orbitTrap ?? DEFAULT_DOCUMENT_ORBIT_TRAP,
      lighting: state.lighting ?? DEFAULT_DOCUMENT_LIGHTING,
    },
    transform: {
      transformId: state.transformId ?? DEFAULT_FRACTAL_DOCUMENT.transform.transformId,
    },
    render: {
      maxIterations: state.iterations ?? DEFAULT_FRACTAL_DOCUMENT.render.maxIterations,
      useSSAA: state.useSSAA ?? DEFAULT_FRACTAL_DOCUMENT.render.useSSAA,
      adaptiveIterations: state.adaptiveIterations ?? DEFAULT_FRACTAL_DOCUMENT.render.adaptiveIterations,
    },
    animation: state.keyframes && state.keyframes.length > 0 ? { keyframes: state.keyframes } : undefined,
    metadata: extras?.metadata,
  };
}
