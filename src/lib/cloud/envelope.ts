/**
 * CloudArtworkEnvelopeV1 server-side validation profile (spec section 8).
 *
 * The local read path (readFractalDocumentEnvelope) is deliberately lenient
 * so old files keep opening; it is not a security validation. Cloud writes
 * must pass this profile instead: structural read, frozen budgets against
 * the engine registries, verified formula-asset hashes, and a canonical
 * server re-serialization from which config_bytes and request hashes are
 * computed. Client-claimed byte counts, owners, states, paths, titles, and
 * provenance are never persisted (spec sections 4.2, 8).
 */

import { createHash } from 'node:crypto';

import { readFractalDocumentEnvelope } from '@/engine/document-envelope';
import type { FractalDocument } from '@/engine/document';
import { PALETTES } from '@/engine/palettes';
import { registerBuiltins } from '@/engine/plugins/builtins';
import { pluginRegistry } from '@/engine/plugins/registry';

import presetsFile from '../../../public/gallery-presets.json';

// The browser registers builtin plugins when the renderer boots; the server
// has no renderer, so the validator must make sure the allowlist registry is
// populated before consulting it. Registration is idempotent and cheap after
// the first call, and it stays lazy (never at import time).
let builtinsRegistered = false;
function ensureBuiltinPlugins(): void {
  if (!builtinsRegistered) {
    registerBuiltins({ quiet: true });
    builtinsRegistered = true;
  }
}

export const CLOUD_ENVELOPE_MAX_INPUT_BYTES = 1_048_576; // 1 MiB (spec section 7)
export const CLOUD_FORMULA_ASSET_MAX_COUNT = 4;
export const CLOUD_FORMULA_ASSET_MAX_SOURCE_BYTES = 65_536;
export const CLOUD_MAX_ITERATIONS = 4_096;
export const CLOUD_MAX_GRADIENT_STOPS = 64;
export const CLOUD_MAX_VIEW_KEYFRAMES = 256;
export const CLOUD_MAX_ANIMATION_TRACKS = 16;
export const CLOUD_MAX_TRACK_KEYFRAMES = 256;
export const CLOUD_PLUGIN_PARAMS_MAX_ENTRIES = 32;
export const CLOUD_PLUGIN_PARAM_KEY_MAX_LENGTH = 64;
export const CLOUD_PLUGIN_PARAM_STRING_MAX_LENGTH = 256;
export const CLOUD_PLUGIN_PARAM_NUMBER_MAGNITUDE = 1e12;

export interface CloudEnvelopeAcceptance {
  /** Canonical server re-serialization (sorted keys); the only persisted form. */
  canonicalJson: string;
  /** Byte length of canonicalJson; server-computed config_bytes. */
  configBytes: number;
  /** Title projected from the envelope artwork name (1-80 chars). */
  title: string;
  /** True when the envelope carries portable formula source and needs the dedicated publish gate. */
  hasPortableFormulas: boolean;
}

export interface CloudEnvelopeRejection {
  code: 'invalid_envelope';
  /** Bilingual-safe public reason; never leaks envelope contents. */
  reason: string;
}

export type CloudEnvelopeResult =
  | { ok: true; value: CloudEnvelopeAcceptance }
  | { ok: false; error: CloudEnvelopeRejection };

function reject(reason: string): CloudEnvelopeResult {
  return { ok: false, error: { code: 'invalid_envelope', reason } };
}

/** Deterministic JSON with sorted object keys; arrays keep their order. */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function checkFinitePair(value: unknown, label: string, magnitudeCap: number): CloudEnvelopeResult | null {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(isFiniteNumber)) {
    return reject(`${label} must be a finite [number, number].`);
  }
  if ((value as number[]).some((n) => Math.abs(n) > magnitudeCap)) {
    return reject(`${label} exceeds the allowed magnitude.`);
  }
  return null;
}

/** Title is a server-consistent projection of the envelope artwork name. */
export function projectTitle(document: FractalDocument): string {
  const raw = typeof document.metadata?.name === 'string' ? document.metadata.name.trim() : '';
  const name = raw.length > 0 ? raw : 'Untitled';
  return name.slice(0, 80);
}

/** Budget-check every plugin parameter record present in the raw document. */
function checkPluginParams(rawDoc: Record<string, unknown> | undefined): CloudEnvelopeResult | null {
  if (!rawDoc || typeof rawDoc !== 'object') return null;
  const containers = [
    rawDoc.formula,
    rawDoc.coloring,
    rawDoc.transform,
    rawDoc.render,
  ] as Array<Record<string, unknown> | undefined>;
  for (const container of containers) {
    const params = container?.params;
    if (params === undefined || params === null) continue;
    if (typeof params !== 'object' || Array.isArray(params)) {
      return reject('Plugin params must be an object.');
    }
    const entries = Object.entries(params as Record<string, unknown>);
    if (entries.length > CLOUD_PLUGIN_PARAMS_MAX_ENTRIES) {
      return reject('Plugin params exceed the entry budget.');
    }
    for (const [key, value] of entries) {
      if (key.length > CLOUD_PLUGIN_PARAM_KEY_MAX_LENGTH) {
        return reject('Plugin param key exceeds the length budget.');
      }
      if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > CLOUD_PLUGIN_PARAM_NUMBER_MAGNITUDE)) {
        return reject('Plugin param number is outside the allowed range.');
      }
      if (typeof value === 'string' && value.length > CLOUD_PLUGIN_PARAM_STRING_MAX_LENGTH) {
        return reject('Plugin param string exceeds the length budget.');
      }
    }
  }
  return null;
}

/**
 * Validate a cloud write envelope. `inputBytes` is the byte length of the
 * envelope as received (before parsing) so the 1 MiB input cap is enforced
 * on the client's payload, not only on the canonical form.
 */
export function validateCloudEnvelopeV1(input: unknown, inputBytes: number): CloudEnvelopeResult {
  if (inputBytes > CLOUD_ENVELOPE_MAX_INPUT_BYTES) {
    return reject('Envelope exceeds the 1 MiB input cap.');
  }
  ensureBuiltinPlugins();

  const read = readFractalDocumentEnvelope(input);
  if (read.mode === 'readonly-future') {
    return reject('Future read-only envelopes cannot be written to the cloud.');
  }
  if (read.mode !== 'editable') {
    return reject('Envelope failed structural validation.');
  }

  const doc = read.envelope.document;
  const formulas = read.envelope.assets?.formulas ?? [];

  // Built-ins resolve against the runtime registry. A custom formula is
  // allowed only when the portable envelope carries the exact referenced
  // asset; unknown bare ids must not enter cloud storage. Embedded assets may
  // never shadow a built-in id, even when they are not currently referenced.
  const formulaIsBuiltin = pluginRegistry.hasFormula(doc.formula.formulaId);
  const formulaHasPortableAsset = formulas.some(
    (asset) => asset.id === doc.formula.formulaId,
  );
  if (!formulaIsBuiltin && !formulaHasPortableAsset) {
    return reject('Unknown formula.');
  }
  if (formulas.some((asset) => pluginRegistry.hasFormula(asset.id))) {
    return reject('Formula asset conflicts with a built-in formula.');
  }
  // All other runtime entities remain strict registry allowlists.
  if (!pluginRegistry.hasOutsideColoring(doc.coloring.outsideColoringId)) {
    return reject('Unknown outside coloring.');
  }
  if (!pluginRegistry.hasInsideColoring(doc.coloring.insideColoringId)) {
    return reject('Unknown inside coloring.');
  }
  if (!pluginRegistry.hasTransform(doc.transform.transformId)) {
    return reject('Unknown transform.');
  }

  // Numeric budgets.
  const render = doc.render;
  if (
    !Number.isInteger(render.maxIterations) ||
    render.maxIterations < 1 ||
    render.maxIterations > CLOUD_MAX_ITERATIONS
  ) {
    return reject('maxIterations is outside the allowed range.');
  }
  const bounds = doc.scene.bounds;
  if (!isFiniteNumber(bounds.centerX) || !isFiniteNumber(bounds.centerY)) {
    return reject('View center must be finite.');
  }
  if (Math.abs(bounds.centerX) > 1e6 || Math.abs(bounds.centerY) > 1e6) {
    return reject('View center exceeds the allowed magnitude.');
  }
  if (!isFiniteNumber(bounds.zoom) || bounds.zoom <= 1e-9 || bounds.zoom > 1e9) {
    return reject('Zoom is outside the allowed range.');
  }
  if (!isFiniteNumber(bounds.rotation)) {
    return reject('Rotation must be finite.');
  }
  const juliaCheck = checkFinitePair(doc.formula.juliaC, 'juliaC', 1e6);
  if (juliaCheck) return juliaCheck;
  if (!isFiniteNumber(doc.formula.power) || Math.abs(doc.formula.power) > 64) {
    return reject('Formula power is outside the allowed range.');
  }
  if (
    !Number.isInteger(doc.coloring.paletteIndex) ||
    doc.coloring.paletteIndex < 0 ||
    doc.coloring.paletteIndex >= PALETTES.length
  ) {
    return reject('Palette index is outside the allowed range.');
  }
  const gradient = doc.coloring.customGradient;
  if (gradient !== null && gradient.length > CLOUD_MAX_GRADIENT_STOPS) {
    return reject('Custom gradient exceeds the stop budget.');
  }

  // Animation budgets.
  const animation = doc.animation;
  if (animation?.viewKeyframes && animation.viewKeyframes.length > CLOUD_MAX_VIEW_KEYFRAMES) {
    return reject('View keyframes exceed the budget.');
  }
  if (animation?.tracks) {
    if (animation.tracks.length > CLOUD_MAX_ANIMATION_TRACKS) {
      return reject('Animation tracks exceed the budget.');
    }
    for (const track of animation.tracks) {
      if (track.keyframes.length > CLOUD_MAX_TRACK_KEYFRAMES) {
        return reject('Animation track keyframes exceed the budget.');
      }
    }
  }

  // Portable formula assets: count/source budgets and verified hashes.
  if (formulas.length > CLOUD_FORMULA_ASSET_MAX_COUNT) {
    return reject('Formula assets exceed the count budget.');
  }
  for (const asset of formulas) {
    const sourceBytes = Buffer.byteLength(asset.source, 'utf8');
    if (sourceBytes > CLOUD_FORMULA_ASSET_MAX_SOURCE_BYTES) {
      return reject('Formula asset source exceeds the size budget.');
    }
    const actual = createHash('sha256').update(asset.source, 'utf8').digest('hex');
    if (actual !== asset.hash) {
      return reject('Formula asset hash does not match its source.');
    }
  }

  // Numeric budgets are enforced on the RAW client document: the lenient
  // local read path clamps out-of-range values (e.g. maxIterations), so a
  // budget check against the normalized document would let clamped input
  // through. Fields that arrive absent get reader defaults and pass.
  const rawDoc = (input as { document?: unknown }).document as Record<string, unknown> | undefined;
  const rawRender = (rawDoc?.render ?? {}) as Record<string, unknown>;
  if (
    rawRender.maxIterations !== undefined &&
    (!Number.isInteger(rawRender.maxIterations) ||
      (rawRender.maxIterations as number) < 1 ||
      (rawRender.maxIterations as number) > CLOUD_MAX_ITERATIONS)
  ) {
    return reject('maxIterations is outside the allowed range.');
  }
  const rawBounds = ((rawDoc?.scene ?? {}) as Record<string, unknown>).bounds as
    | Record<string, unknown>
    | undefined;
  if (rawBounds) {
    for (const key of ['centerX', 'centerY'] as const) {
      const value = rawBounds[key];
      if (value !== undefined && (!isFiniteNumber(value) || Math.abs(value) > 1e6)) {
        return reject('View center is outside the allowed range.');
      }
    }
    if (
      rawBounds.zoom !== undefined &&
      (!isFiniteNumber(rawBounds.zoom) || rawBounds.zoom <= 1e-9 || rawBounds.zoom > 1e9)
    ) {
      return reject('Zoom is outside the allowed range.');
    }
    if (rawBounds.rotation !== undefined && !isFiniteNumber(rawBounds.rotation)) {
      return reject('Rotation must be finite.');
    }
  }
  const rawFormula = (rawDoc?.formula ?? {}) as Record<string, unknown>;
  if (rawFormula.juliaC !== undefined) {
    const juliaCheck = checkFinitePair(rawFormula.juliaC, 'juliaC', 1e6);
    if (juliaCheck) return juliaCheck;
  }
  if (
    rawFormula.power !== undefined &&
    (!isFiniteNumber(rawFormula.power) || Math.abs(rawFormula.power) > 64)
  ) {
    return reject('Formula power is outside the allowed range.');
  }
  const rawColoring = (rawDoc?.coloring ?? {}) as Record<string, unknown>;
  if (
    rawColoring.paletteIndex !== undefined &&
    (!Number.isInteger(rawColoring.paletteIndex) ||
      (rawColoring.paletteIndex as number) < 0 ||
      (rawColoring.paletteIndex as number) >= PALETTES.length)
  ) {
    return reject('Palette index is outside the allowed range.');
  }
  if (
    Array.isArray(rawColoring.customGradient) &&
    rawColoring.customGradient.length > CLOUD_MAX_GRADIENT_STOPS
  ) {
    return reject('Custom gradient exceeds the stop budget.');
  }
  const rawAnimation = (rawDoc?.animation ?? {}) as Record<string, unknown>;
  if (
    Array.isArray(rawAnimation.viewKeyframes) &&
    rawAnimation.viewKeyframes.length > CLOUD_MAX_VIEW_KEYFRAMES
  ) {
    return reject('View keyframes exceed the budget.');
  }
  if (Array.isArray(rawAnimation.tracks)) {
    if (rawAnimation.tracks.length > CLOUD_MAX_ANIMATION_TRACKS) {
      return reject('Animation tracks exceed the budget.');
    }
    for (const track of rawAnimation.tracks) {
      const keyframes = (track as Record<string, unknown>).keyframes;
      if (Array.isArray(keyframes) && keyframes.length > CLOUD_MAX_TRACK_KEYFRAMES) {
        return reject('Animation track keyframes exceed the budget.');
      }
    }
  }

  // Plugin parameter budgets (spec section 8): the reader's lenient
  // normalizePluginParamRecord drops non-finite values, so params are
  // budget-checked on the raw document: entry count, key length, and
  // string/number magnitudes.
  const paramsCheck = checkPluginParams(rawDoc);
  if (paramsCheck) return paramsCheck;

  // Canonical server re-serialization; only this form is persisted, and
  // config_bytes derives from it (never from client claims).
  const canonicalJson = canonicalStringify(read.envelope);
  const configBytes = Buffer.byteLength(canonicalJson, 'utf8');
  if (configBytes > CLOUD_ENVELOPE_MAX_INPUT_BYTES) {
    return reject('Canonical envelope exceeds the storage cap.');
  }

  return {
    ok: true,
    value: {
      canonicalJson,
      configBytes,
      title: projectTitle(doc),
      hasPortableFormulas: formulas.length > 0,
    },
  };
}

/**
 * Resolve remix provenance server-side (spec section 8): formula and preset
 * sources must exist in the public registries. Publication sources resolve
 * against the database in the drafts service (they need a live query).
 */
export function resolveRegistrySource(type: 'formula' | 'preset', id: string): boolean {
  ensureBuiltinPlugins();
  if (type === 'formula') {
    return pluginRegistry.hasFormula(id);
  }
  return presetsFile.presets.some((preset) => preset.id === id);
}
