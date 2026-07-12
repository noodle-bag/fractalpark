import { createDefaultColorAdjustments, type FractalDocument } from '@/engine/document';
import { documentToRuntimeParams, runtimeParamsToDocument } from '@/engine/document-adapter';
import type {
  FractalFormula,
  FractalParams,
  ColorAdjustmentsConfig,
  RgbCurve,
  GradientStop,
  InsideColoringMode,
  Keyframe,
  LightingConfig,
  OrbitTrapConfig,
  OrbitTrapShape,
  OutsideColoringMode,
  PluginParamRecord,
  PluginParamValue,
  SavedFractal,
} from '@/engine/types';
import { pluginRegistry } from '@/engine/plugins/registry';
import { PALETTES } from '@/engine/palettes';

// Custom formula ID prefixes
const CUSTOM_FORMULA_PREFIXES = ['frm-', 'custom-'];

/**
 * Check if a formula ID is a custom user-defined formula
 */
export function isCustomFormula(formulaId: string): boolean {
  return CUSTOM_FORMULA_PREFIXES.some(prefix => formulaId.startsWith(prefix));
}

/**
 * Validate formula exists in registry, fallback to mandelbrot if not found
 */
export function validateFormula(formulaId: string): FractalFormula {
  const plugin = pluginRegistry.getFormula(formulaId);
  if (plugin) {
    return formulaId as FractalFormula;
  }
  // Fallback to mandelbrot if formula not found (e.g., custom formula from another device)
  console.warn(`Formula "${formulaId}" not found, falling back to mandelbrot`);
  return 'mandelbrot';
}

// Short keys for the 4 original builtin formulas (for backward compatibility)
const FORMULA_TO_KEY: Record<string, string> = {
  mandelbrot: 'm',
  burningShip: 'bs',
  tricorn: 'tr',
  phoenix: 'ph',
};

const KEY_TO_FORMULA: Record<string, string> = {
  m: 'mandelbrot',
  bs: 'burningShip',
  tr: 'tricorn',
  ph: 'phoenix',
};

const OUTSIDE_TO_KEY: Record<string, string> = {
  smooth: 'sm',
  orbitTrap: 'ot',
  stripe: 'st',
  binary: 'bi',
  tia: 'ti',
};

const KEY_TO_OUTSIDE: Record<string, string> = {
  sm: 'smooth',
  ot: 'orbitTrap',
  st: 'stripe',
  bi: 'binary',
  ti: 'tia',
};

const INSIDE_TO_KEY: Record<string, string> = {
  black: 'bk',
  finalOrbit: 'fo',
  atomDomain: 'ad',
};

const KEY_TO_INSIDE: Record<string, string> = {
  bk: 'black',
  fo: 'finalOrbit',
  ad: 'atomDomain',
};

const TRAP_SHAPE_TO_KEY: Record<OrbitTrapShape, string> = {
  point: 'p',
  cross: 'x',
  circle: 'c',
};

const KEY_TO_TRAP_SHAPE: Record<string, OrbitTrapShape> = {
  p: 'point',
  x: 'cross',
  c: 'circle',
};

export interface FractalUrlState {
  centerX?: number;
  centerY?: number;
  zoom?: number;
  rotation?: number;
  iterations?: number;
  julia?: boolean;
  juliaRe?: number;
  juliaIm?: number;
  power?: number;
  formula?: FractalFormula;
  outsideColoring?: OutsideColoringMode;
  insideColoring?: InsideColoringMode;
  transformId?: string;
  pluginParams?: PluginParamRecord;
  orbitTrap?: OrbitTrapConfig;
  useSSAA?: boolean;
  adaptiveIterations?: boolean;
  lighting?: LightingConfig;
  colorAdjustments?: ColorAdjustmentsConfig;
  gradient?: GradientStop[];
  palette?: number;
  keyframes?: Keyframe[];
}

function clonePluginParamValue(value: PluginParamValue): PluginParamValue {
  return Array.isArray(value) ? [...value] as PluginParamValue : value;
}

function isPluginParamValueEqual(left: PluginParamValue, right: PluginParamValue): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => value === right[index]);
  }

  return left === right;
}

function serializePluginParamValue(value: PluginParamValue): string {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join('|');
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

function parsePluginParamValue(raw: string): PluginParamValue | undefined {
  if (raw.includes('|')) {
    const parts = raw.split('|').map((part) => parseFloat(part));
    if ((parts.length === 2 || parts.length === 3) && parts.every((part) => Number.isFinite(part))) {
      return parts as PluginParamValue;
    }
    return undefined;
  }

  if (raw === 'true') {
    return true;
  }

  if (raw === 'false') {
    return false;
  }

  const numeric = parseFloat(raw);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function encodeCurve(curve: RgbCurve): string {
  return curve.map((value) => Number(value.toFixed(3))).join(',');
}

function isIdentityCurve(curve: RgbCurve): boolean {
  return curve.every((value, index) => Math.abs(value - index * 0.25) < 0.0005);
}

function parseCurve(raw: string | null): RgbCurve | undefined {
  if (raw === null) return undefined;
  const values = raw.split(',').map(Number);
  if (values.length !== 5 || values.some((value) => !Number.isFinite(value))) return undefined;
  return values.map((value) => Math.min(1, Math.max(0, value))) as RgbCurve;
}

/**
 * Encode zoom value with adaptive precision.
 * Small zoom values (< 0.01) need more decimal places to avoid
 * truncation to 0.00 which causes log(0) = -Infinity in animation.
 * Examples: 0.004 → "0.0040", 1.5 → "1.50", 13592.06 → "13592.06"
 */
function formatZoom(zoom: number): string {
  if (zoom <= 0) return '0.0001'; // safety clamp
  if (zoom < 0.01) return zoom.toFixed(6);
  if (zoom < 0.1)  return zoom.toFixed(4);
  return zoom.toFixed(2);
}

export function encodeParams(state: FractalUrlState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.centerX !== undefined) params.set('cx', state.centerX.toFixed(10));
  if (state.centerY !== undefined) params.set('cy', state.centerY.toFixed(10));
  if (state.zoom !== undefined) params.set('z', formatZoom(state.zoom));
  if (state.rotation !== undefined && Math.abs(state.rotation) > 0.001) params.set('rot', state.rotation.toFixed(4));
  if (state.iterations !== undefined) params.set('iter', String(state.iterations));
  if (state.julia !== undefined) params.set('julia', state.julia ? '1' : '0');
  if (state.juliaRe !== undefined) params.set('jre', state.juliaRe.toFixed(6));
  if (state.juliaIm !== undefined) params.set('jim', state.juliaIm.toFixed(6));
  if (state.power !== undefined && state.power !== 2) params.set('pow', String(state.power));

  // Formula encoding: use short key for builtins, direct id for new formulas
  if (state.formula !== undefined && state.formula !== 'mandelbrot') {
    const shortKey = FORMULA_TO_KEY[state.formula];
    if (shortKey) {
      params.set('fm', shortKey);
    } else {
      // New formula: use direct plugin id
      params.set('fm', state.formula);
    }
  }

  if (state.outsideColoring !== undefined && state.outsideColoring !== 'smooth') {
    params.set('oc', OUTSIDE_TO_KEY[state.outsideColoring] ?? state.outsideColoring);
  }
  if (state.insideColoring !== undefined && state.insideColoring !== 'black') {
    params.set('ic', INSIDE_TO_KEY[state.insideColoring] ?? state.insideColoring);
  }

  // Transform: omit if 'none' (default)
  if (state.transformId !== undefined && state.transformId !== 'none') {
    params.set('tr', state.transformId);
  }

  // Plugin params: only encode if they differ from defaults
  if (state.pluginParams && Object.keys(state.pluginParams).length > 0) {
    const descriptors = [
      ...(state.formula ? pluginRegistry.getFormula(state.formula)?.uniforms ?? [] : []),
      ...(state.outsideColoring ? pluginRegistry.getOutsideColoring(state.outsideColoring)?.uniforms ?? [] : []),
      ...(state.insideColoring ? pluginRegistry.getInsideColoring(state.insideColoring)?.uniforms ?? [] : []),
      ...(state.transformId ? pluginRegistry.getTransform(state.transformId)?.uniforms ?? [] : []),
    ];

    const paramPairs: string[] = [];
    for (const uniform of descriptors) {
      const value = state.pluginParams[uniform.name];
      if (value === undefined) {
        continue;
      }
      const defaultValue = uniform.default as PluginParamValue;
      if (!isPluginParamValueEqual(value, defaultValue)) {
        paramPairs.push(`${uniform.name}:${serializePluginParamValue(value)}`);
      }
    }

    if (paramPairs.length > 0) {
      params.set('pp', paramPairs.join(','));
    }
  }

  if (state.orbitTrap !== undefined) {
    if (state.orbitTrap.shape !== 'point') params.set('ots', TRAP_SHAPE_TO_KEY[state.orbitTrap.shape]);
    if (Math.abs(state.orbitTrap.point[0]) > 0.000001) params.set('otx', state.orbitTrap.point[0].toFixed(4));
    if (Math.abs(state.orbitTrap.point[1]) > 0.000001) params.set('oty', state.orbitTrap.point[1].toFixed(4));
    if (Math.abs(state.orbitTrap.radius - 0.35) > 0.0001) params.set('otr', state.orbitTrap.radius.toFixed(4));
    if (Math.abs(state.orbitTrap.width - 0.02) > 0.0001) params.set('otw', state.orbitTrap.width.toFixed(4));
  }
  if (state.useSSAA) params.set('ssaa', '1');
  if (state.adaptiveIterations) params.set('ait', '1');
  if (state.lighting !== undefined) {
    if (state.lighting.enabled) params.set('lg', '1');
    if (state.lighting.mode === 'dem') params.set('lgm', 'dem');
    if (Math.abs(state.lighting.azimuth - 45) > 0.01) params.set('lga', state.lighting.azimuth.toFixed(2));
    if (Math.abs(state.lighting.elevation - 35) > 0.01) params.set('lge', state.lighting.elevation.toFixed(2));
    if (Math.abs(state.lighting.intensity - 0.65) > 0.01) params.set('lgi', state.lighting.intensity.toFixed(2));
  }
  if (state.colorAdjustments !== undefined) {
    const adjustments = state.colorAdjustments;
    if (Math.abs(adjustments.exposure) > 0.001) params.set('ex', adjustments.exposure.toFixed(2));
    if (Math.abs(adjustments.contrast) > 0.01) params.set('ct', adjustments.contrast.toFixed(1));
    if (Math.abs(adjustments.brightness) > 0.01) params.set('br', adjustments.brightness.toFixed(1));
    if (Math.abs(adjustments.gamma - 1) > 0.001) params.set('gm', adjustments.gamma.toFixed(2));
    if (Math.abs(adjustments.saturation) > 0.01) params.set('sat', adjustments.saturation.toFixed(1));
    if (Math.abs(adjustments.vibrance) > 0.01) params.set('vib', adjustments.vibrance.toFixed(1));
    if (Math.abs(adjustments.hue) > 0.01) params.set('hue', adjustments.hue.toFixed(1));
    if (adjustments.invert) params.set('inv', '1');
    if (!isIdentityCurve(adjustments.curves.red)) params.set('cr', encodeCurve(adjustments.curves.red));
    if (!isIdentityCurve(adjustments.curves.green)) params.set('cg', encodeCurve(adjustments.curves.green));
    if (!isIdentityCurve(adjustments.curves.blue)) params.set('cb', encodeCurve(adjustments.curves.blue));
  }
  if (state.palette !== undefined) params.set('pal', String(state.palette));
  if (state.gradient) {
    // Compact format: "pos:hex,pos:hex,..."
    const encoded = state.gradient
      .map((s) => `${s.position.toFixed(2)}:${s.color.replace('#', '')}`)
      .join(',');
    params.set('grad', encoded);
  }
  if (state.keyframes && state.keyframes.length >= 2) {
    // Format: kf=cx1,cy1,z1,r1|cx2,cy2,z2,r2|...
    const encoded = state.keyframes
      .map((kf) => {
        const cx = kf.bounds.centerX.toFixed(10);
        const cy = kf.bounds.centerY.toFixed(10);
        const z = formatZoom(kf.bounds.zoom);
        const r = (kf.bounds.rotation ?? 0).toFixed(4);
        return `${cx},${cy},${z},${r}`;
      })
      .join('|');
    params.set('kf', encoded);
  }

  return params;
}

export function decodeParams(searchParams: URLSearchParams): FractalUrlState {
  const state: FractalUrlState = {};

  const cx = searchParams.get('cx');
  const cy = searchParams.get('cy');
  const z = searchParams.get('z');
  const iter = searchParams.get('iter');
  const julia = searchParams.get('julia');
  const jre = searchParams.get('jre');
  const jim = searchParams.get('jim');
  const pow = searchParams.get('pow');
  const fm = searchParams.get('fm');
  const oc = searchParams.get('oc');
  const ic = searchParams.get('ic');
  const tr = searchParams.get('tr');
  const pp = searchParams.get('pp');
  const ots = searchParams.get('ots');
  const otx = searchParams.get('otx');
  const oty = searchParams.get('oty');
  const otr = searchParams.get('otr');
  const otw = searchParams.get('otw');
  const ssaa = searchParams.get('ssaa');
  const ait = searchParams.get('ait');
  const lg = searchParams.get('lg');
  const lgm = searchParams.get('lgm');
  const lga = searchParams.get('lga');
  const lge = searchParams.get('lge');
  const lgi = searchParams.get('lgi');
  const ex = searchParams.get('ex');
  const ct = searchParams.get('ct');
  const br = searchParams.get('br');
  const gm = searchParams.get('gm');
  const sat = searchParams.get('sat');
  const vib = searchParams.get('vib');
  const hue = searchParams.get('hue');
  const inv = searchParams.get('inv');
  const cr = searchParams.get('cr');
  const cg = searchParams.get('cg');
  const cb = searchParams.get('cb');
  const rot = searchParams.get('rot');
  const pal = searchParams.get('pal');
  const grad = searchParams.get('grad');
  const kf = searchParams.get('kf');

  if (cx !== null) { const v = parseFloat(cx); if (!isNaN(v)) state.centerX = v; }
  if (cy !== null) { const v = parseFloat(cy); if (!isNaN(v)) state.centerY = v; }
  if (z !== null) { const v = parseFloat(z); if (!isNaN(v) && v > 0) state.zoom = v; }
  if (iter !== null) { const v = parseInt(iter, 10); if (!isNaN(v) && v >= 50 && v <= 1000) state.iterations = v; }
  if (julia !== null) state.julia = julia === '1';
  if (jre !== null) { const v = parseFloat(jre); if (!isNaN(v)) state.juliaRe = v; }
  if (jim !== null) { const v = parseFloat(jim); if (!isNaN(v)) state.juliaIm = v; }
  if (pow !== null) { const v = parseInt(pow, 10); if (!isNaN(v) && v >= 2 && v <= 5) state.power = v; }

  // Formula decoding: try short key first, then direct id
  // Note: We trust the URL params since they're generated by our app.
  // We don't validate against pluginRegistry here because decodeParams
  // may be called before plugins are registered (e.g., in explore page init).
  if (fm !== null) {
    if (fm in KEY_TO_FORMULA) {
      state.formula = KEY_TO_FORMULA[fm];
    } else {
      // Accept any formula id - validation happens at render time
      state.formula = fm;
    }
  }

  if (oc !== null) {
    if (oc in KEY_TO_OUTSIDE) {
      state.outsideColoring = KEY_TO_OUTSIDE[oc];
    } else {
      // Accept any outside coloring id - validation happens at render time
      state.outsideColoring = oc;
    }
  }

  if (ic !== null) {
    if (ic in KEY_TO_INSIDE) {
      state.insideColoring = KEY_TO_INSIDE[ic];
    } else {
      // Accept any inside coloring id - validation happens at render time
      state.insideColoring = ic;
    }
  }

  // Transform decoding
  // Note: We trust the URL params since they're generated by our app.
  if (tr !== null) {
    state.transformId = tr;
  }

  // Plugin params decoding
  if (pp !== null) {
    const pluginParams: PluginParamRecord = {};
    const pairs = pp.split(',');
    for (const pair of pairs) {
      const colonIndex = pair.indexOf(':');
      if (colonIndex <= 0) {
        continue;
      }
      const name = pair.slice(0, colonIndex);
      const valueStr = pair.slice(colonIndex + 1);
      if (!name || !valueStr) {
        continue;
      }
      const value = parsePluginParamValue(valueStr);
      if (value !== undefined) {
        pluginParams[name] = clonePluginParamValue(value);
      }
    }
    if (Object.keys(pluginParams).length > 0) {
      state.pluginParams = pluginParams;
    }
  }

  if (ots !== null || otx !== null || oty !== null || otr !== null || otw !== null) {
    const shape = ots !== null && ots in KEY_TO_TRAP_SHAPE ? KEY_TO_TRAP_SHAPE[ots] : 'point';
    const pointX = otx !== null ? parseFloat(otx) : 0;
    const pointY = oty !== null ? parseFloat(oty) : 0;
    const radius = otr !== null ? parseFloat(otr) : 0.35;
    const width = otw !== null ? parseFloat(otw) : 0.02;
    state.orbitTrap = {
      shape,
      point: [Number.isFinite(pointX) ? pointX : 0, Number.isFinite(pointY) ? pointY : 0],
      radius: Number.isFinite(radius) ? radius : 0.35,
      width: Number.isFinite(width) ? width : 0.02,
    };
  }
  if (ssaa !== null) state.useSSAA = ssaa === '1';
  if (ait !== null) state.adaptiveIterations = ait === '1';
  if (lg !== null || lgm !== null || lga !== null || lge !== null || lgi !== null) {
    const azimuth = lga !== null ? parseFloat(lga) : 45;
    const elevation = lge !== null ? parseFloat(lge) : 35;
    const intensity = lgi !== null ? parseFloat(lgi) : 0.65;
    state.lighting = {
      enabled: lg === '1',
      mode: lgm === 'dem' ? 'dem' : 'normalMap',
      azimuth: Number.isFinite(azimuth) ? azimuth : 45,
      elevation: Number.isFinite(elevation) ? elevation : 35,
      intensity: Number.isFinite(intensity) ? intensity : 0.65,
    };
  }
  if ([ex, ct, br, gm, sat, vib, hue, inv, cr, cg, cb].some((value) => value !== null)) {
    const defaults = createDefaultColorAdjustments();
    const finiteOr = (raw: string | null, fallback: number) => {
      const value = raw === null ? fallback : Number(raw);
      return Number.isFinite(value) ? value : fallback;
    };
    state.colorAdjustments = {
      exposure: Math.min(3, Math.max(-3, finiteOr(ex, defaults.exposure))),
      contrast: Math.min(100, Math.max(-100, finiteOr(ct, defaults.contrast))),
      brightness: Math.min(100, Math.max(-100, finiteOr(br, defaults.brightness))),
      gamma: Math.min(4, Math.max(0.25, finiteOr(gm, defaults.gamma))),
      saturation: Math.min(100, Math.max(-100, finiteOr(sat, defaults.saturation))),
      vibrance: Math.min(100, Math.max(-100, finiteOr(vib, defaults.vibrance))),
      hue: Math.min(180, Math.max(-180, finiteOr(hue, defaults.hue))),
      invert: inv === '1',
      curves: {
        red: parseCurve(cr) ?? defaults.curves.red,
        green: parseCurve(cg) ?? defaults.curves.green,
        blue: parseCurve(cb) ?? defaults.curves.blue,
      },
    };
  }
  if (rot !== null) { const v = parseFloat(rot); if (!isNaN(v)) state.rotation = v; }
  if (pal !== null) {
    const value = parseInt(pal, 10);
    if (PALETTES.some((palette) => palette.index === value)) state.palette = value;
  }
  if (grad !== null) {
    try {
      const stops: GradientStop[] = grad.split(',').map((part) => {
        const [pos, hex] = part.split(':');
        return { position: parseFloat(pos), color: `#${hex}` };
      });
      if (stops.length >= 2 && stops.length <= 5 && stops.every((s) => !isNaN(s.position))) {
        state.gradient = stops;
      }
    } catch {
      // Invalid gradient data, ignore
    }
  }
  if (kf !== null) {
    try {
      const keyframes: Keyframe[] = kf.split('|').map((part, i) => {
        const [cx, cy, z, r] = part.split(',');
        return {
          id: `url-kf-${i}`,
          bounds: {
            centerX: parseFloat(cx),
            centerY: parseFloat(cy),
            zoom: parseFloat(z),
            rotation: parseFloat(r) || 0,
          },
        };
      });
      if (keyframes.length >= 2 && keyframes.every((k) => 
        !isNaN(k.bounds.centerX) && 
        !isNaN(k.bounds.centerY) && 
        !isNaN(k.bounds.zoom) && 
        k.bounds.zoom > 0
      )) {
        state.keyframes = keyframes;
      }
    } catch {
      // Invalid keyframe data, ignore
    }
  }

  return state;
}

export function documentToUrlState(doc: FractalDocument): FractalUrlState {
  const runtime = documentToRuntimeParams(doc);

  return {
    centerX: runtime.bounds.centerX,
    centerY: runtime.bounds.centerY,
    zoom: runtime.bounds.zoom,
    rotation: runtime.bounds.rotation,
    iterations: runtime.maxIterations,
    julia: runtime.isJulia,
    juliaRe: runtime.juliaC[0],
    juliaIm: runtime.juliaC[1],
    power: runtime.power,
    formula: runtime.formula,
    outsideColoring: runtime.outsideColoring,
    insideColoring: runtime.insideColoring,
    transformId: runtime.transformId,
    pluginParams: runtime.pluginParams,
    orbitTrap: runtime.orbitTrap,
    useSSAA: runtime.useSSAA,
    adaptiveIterations: runtime.adaptiveIterations,
    lighting: runtime.lighting,
    colorAdjustments: runtime.colorAdjustments,
    palette: runtime.customGradient ? undefined : runtime.paletteIndex,
    gradient: runtime.customGradient ?? undefined,
    keyframes: doc.animation?.keyframes,
  };
}

export function documentToExploreHref(doc: FractalDocument, locale: string): string {
  const urlParams = encodeParams(documentToUrlState(doc));
  return `/${locale}/explore?${urlParams.toString()}`;
}

export function fractalParamsToHref(params: FractalParams, locale: string, keyframes?: Keyframe[]): string {
  const document = runtimeParamsToDocument(params, keyframes ? { animation: { keyframes } } : undefined);
  return documentToExploreHref(document, locale);
}

/**
 * Generate an explore page link for a saved fractal with optional keyframes
 */
export function savedFractalToHref(fractal: SavedFractal, locale: string): string {
  const document = runtimeParamsToDocument(
    fractal.params,
    fractal.animation ? { animation: fractal.animation } : undefined
  );
  return documentToExploreHref(document, locale);
}
