import fs from 'node:fs';
import path from 'node:path';
import { docFromPreset, docFromSaved, docFromUrl, CliCommandError, createSuccess } from '@/cli/doc-commands';
import { registerBuiltins } from '@/engine/plugins/builtins';
import { FORMULA_CATALOG, type FormulaMetadata } from '@/engine/plugins/formula-catalog';
import type { FractalDocument } from '@/engine/document';
import { migrateFractalDocument } from '@/engine/document-migrate';
import { pluginRegistry } from '@/engine/plugins/registry';
import { PALETTES } from '@/engine/palettes';
import { SITE } from '@/lib/site';
import type { PluginParamRecord } from '@/engine/types';

type JsonRecord = Record<string, unknown>;

type SeedSourceType = 'document' | 'url' | 'preset' | 'saved';
type MutationStrategy =
  | 'bounds-jitter'
  | 'bounds-zoom-ladder'
  | 'julia-perturb'
  | 'palette-gradient-variant'
  | 'inside-outside-variant'
  | 'transform-switch'
  | 'plugin-param-perturb'
  | 'formula-family-swap'
  | 'animation-seed-variant';

type Strength = 'low' | 'medium' | 'high';

type CampaignSeedSource =
  | { id?: string; type: 'document'; path: string }
  | { id?: string; type: 'url'; url?: string; query?: string }
  | { id?: string; type: 'preset'; presetId: string; presetsPath?: string }
  | { id?: string; type: 'saved'; path: string };

export interface CampaignConfig {
  id?: string;
  locale?: 'en' | 'zh';
  baseUrl?: string;
  seedSources: CampaignSeedSource[];
  targetFormulas?: string[];
  targetFamilies?: FormulaMetadata['family'][];
  styleTags?: string[];
  structuralTags?: string[];
  portfolioRoleTags?: string[];
  budget: {
    candidateCount: number;
    shardCount?: number;
    maxPerSeed?: number;
  };
  mutation?: {
    deterministicSeed?: number;
    strategies?: MutationStrategy[];
    strengths?: {
      bounds?: Strength;
      formulaParams?: Strength;
      coloring?: Strength;
      transform?: Strength;
      animation?: 'off' | 'light';
    };
  };
  constraints?: {
    requireJulia?: boolean;
    preferredFamilies?: FormulaMetadata['family'][];
    allowedTransforms?: string[];
    allowedOutsideModes?: string[];
    allowedInsideModes?: string[];
    preserveAnimation?: boolean;
  };
}

interface NormalizedCampaignConfig extends CampaignConfig {
  id: string;
  locale: 'en' | 'zh';
  baseUrl: string;
  targetFormulas: string[];
  targetFamilies: FormulaMetadata['family'][];
  styleTags: string[];
  structuralTags: string[];
  portfolioRoleTags: string[];
  mutation: {
    deterministicSeed: number;
    strategies: MutationStrategy[];
    strengths: {
      bounds: Strength;
      formulaParams: Strength;
      coloring: Strength;
      transform: Strength;
      animation: 'off' | 'light';
    };
  };
  constraints: {
    requireJulia: boolean;
    preferredFamilies?: FormulaMetadata['family'][];
    allowedTransforms?: string[];
    allowedOutsideModes?: string[];
    allowedInsideModes?: string[];
    preserveAnimation: boolean;
  };
}

interface PreparedSeed {
  id: string;
  sourceType: SeedSourceType;
  document: FractalDocument;
  metadata?: Record<string, unknown>;
}

interface MutationTraceStep {
  kind: MutationStrategy | 'seed-normalize';
  summary: string;
  details?: Record<string, unknown>;
}

interface CandidateRecord {
  id: string;
  runId: string;
  shardIndex: number;
  seedId: string;
  document: FractalDocument;
  mutationTrace: MutationTraceStep[];
  targetTags: {
    style: string[];
    structural: string[];
    portfolioRole: string[];
  };
  metadata: {
    family?: string;
    formulaId: string;
    transformId: string;
    outsideColoringId: string;
    insideColoringId: string;
  };
}

interface ExplorationRunManifest {
  runId: string;
  createdAt: number;
  phase: 'm4.10b-phase-3';
  locale: 'en' | 'zh';
  baseUrl: string;
  campaign: NormalizedCampaignConfig;
  seeds: Array<{
    id: string;
    sourceType: SeedSourceType;
    documentPath: string;
    budget: number;
    metadata?: Record<string, unknown>;
  }>;
  shardCount: number;
}

let builtinsReady = false;

function ensureBuiltinsRegistered(): void {
  if (builtinsReady) return;
  registerBuiltins({ quiet: true });
  builtinsReady = true;
}

function asObject(value: unknown): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected a JSON object input.');
  }
  return value as JsonRecord;
}

function assertStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new CliCommandError('INVALID_INPUT', 1, `Expected ${field} to be a string array.`);
  }
  return Array.from(new Set(value));
}

function normalizeStrategies(value: unknown): MutationStrategy[] {
  const defaults: MutationStrategy[] = [
    'bounds-jitter',
    'bounds-zoom-ladder',
    'palette-gradient-variant',
    'inside-outside-variant',
    'transform-switch',
    'julia-perturb',
    'plugin-param-perturb',
    'formula-family-swap',
    'animation-seed-variant',
  ];

  if (value === undefined) return defaults;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected mutation.strategies to be a string array.');
  }
  return value as MutationStrategy[];
}

function normalizeCampaignConfig(input: unknown): NormalizedCampaignConfig {
  const value = asObject(input);
  if (!Array.isArray(value.seedSources) || value.seedSources.length === 0) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected campaign seedSources to be a non-empty array.');
  }

  const budget = asObject(value.budget);
  const candidateCount = Number(budget.candidateCount);
  if (!Number.isFinite(candidateCount) || candidateCount <= 0) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected budget.candidateCount > 0.');
  }

  const shardCount = budget.shardCount === undefined ? 1 : Number(budget.shardCount);
  if (!Number.isFinite(shardCount) || shardCount <= 0) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected budget.shardCount > 0 when provided.');
  }

  const maxPerSeed = budget.maxPerSeed === undefined ? undefined : Number(budget.maxPerSeed);
  if (maxPerSeed !== undefined && (!Number.isFinite(maxPerSeed) || maxPerSeed <= 0)) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected budget.maxPerSeed > 0 when provided.');
  }

  const mutationRecord = value.mutation === undefined ? {} : asObject(value.mutation);
  const strengths = mutationRecord.strengths === undefined ? {} : asObject(mutationRecord.strengths);
  const constraints = value.constraints === undefined ? {} : asObject(value.constraints);

  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : `campaign-${Date.now()}`,
    locale: value.locale === 'zh' ? 'zh' : 'en',
    baseUrl: typeof value.baseUrl === 'string' && value.baseUrl ? value.baseUrl : SITE.url,
    seedSources: value.seedSources as CampaignSeedSource[],
    targetFormulas: assertStringArray(value.targetFormulas, 'targetFormulas') ?? [],
    targetFamilies: (assertStringArray(value.targetFamilies, 'targetFamilies') ?? []) as FormulaMetadata['family'][],
    styleTags: assertStringArray(value.styleTags, 'styleTags') ?? [],
    structuralTags: assertStringArray(value.structuralTags, 'structuralTags') ?? [],
    portfolioRoleTags: assertStringArray(value.portfolioRoleTags, 'portfolioRoleTags') ?? [],
    budget: {
      candidateCount,
      shardCount,
      maxPerSeed,
    },
    mutation: {
      deterministicSeed:
        typeof mutationRecord.deterministicSeed === 'number' ? mutationRecord.deterministicSeed : 10410,
      strategies: normalizeStrategies(mutationRecord.strategies),
      strengths: {
        bounds: strengths.bounds === 'low' || strengths.bounds === 'high' ? strengths.bounds : 'medium',
        formulaParams:
          strengths.formulaParams === 'low' || strengths.formulaParams === 'high' ? strengths.formulaParams : 'medium',
        coloring: strengths.coloring === 'low' || strengths.coloring === 'high' ? strengths.coloring : 'medium',
        transform: strengths.transform === 'low' || strengths.transform === 'high' ? strengths.transform : 'medium',
        animation: strengths.animation === 'off' ? 'off' : 'light',
      },
    },
    constraints: {
      requireJulia: Boolean(constraints.requireJulia),
      preferredFamilies: constraints.preferredFamilies as FormulaMetadata['family'][] | undefined,
      allowedTransforms: assertStringArray(constraints.allowedTransforms, 'constraints.allowedTransforms'),
      allowedOutsideModes: assertStringArray(constraints.allowedOutsideModes, 'constraints.allowedOutsideModes'),
      allowedInsideModes: assertStringArray(constraints.allowedInsideModes, 'constraints.allowedInsideModes'),
      preserveAnimation: constraints.preserveAnimation !== false,
    },
  };
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function deepCloneDocument(document: FractalDocument): FractalDocument {
  return structuredClone(document);
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFrom<T>(values: T[], rng: () => number, fallback: T): T {
  if (values.length === 0) return fallback;
  return values[Math.floor(rng() * values.length)] ?? fallback;
}

function randomBetween(min: number, max: number, rng: () => number): number {
  return min + (max - min) * rng();
}

function strengthFactor(strength: Strength): number {
  switch (strength) {
    case 'low':
      return 0.4;
    case 'high':
      return 1.8;
    default:
      return 1;
  }
}

function resolveSeedSource(source: CampaignSeedSource): PreparedSeed {
  switch (source.type) {
    case 'document': {
      const payload = JSON.parse(fs.readFileSync(path.resolve(source.path), 'utf8'));
      return {
        id: source.id ?? path.basename(source.path, path.extname(source.path)),
        sourceType: 'document',
        document: migrateFractalDocument(payload),
        metadata: { path: path.resolve(source.path) },
      };
    }
    case 'saved': {
      const payload = JSON.parse(fs.readFileSync(path.resolve(source.path), 'utf8'));
      const result = docFromSaved({ payload });
      return {
        id: source.id ?? path.basename(source.path, path.extname(source.path)),
        sourceType: 'saved',
        document: result.data.document,
        metadata: result.data.source,
      };
    }
    case 'url': {
      const result = docFromUrl({ url: source.url, query: source.query });
      return {
        id: source.id ?? `seed-url-${Math.abs(hashString(result.data.source.query ?? 'url')).toString(16)}`,
        sourceType: 'url',
        document: result.data.document,
        metadata: result.data.source,
      };
    }
    case 'preset': {
      const result = docFromPreset({ id: source.presetId, presetsPath: source.presetsPath });
      return {
        id: source.id ?? source.presetId,
        sourceType: 'preset',
        document: result.data.document,
        metadata: result.data.source,
      };
    }
    default:
      throw new CliCommandError('INVALID_INPUT', 1, 'Unsupported campaign seed source.');
  }
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function allocateSeedBudgets(config: NormalizedCampaignConfig, seedCount: number): number[] {
  const maxPerSeed = config.budget.maxPerSeed;
  const base = Math.floor(config.budget.candidateCount / seedCount);
  const remainder = config.budget.candidateCount % seedCount;

  return Array.from({ length: seedCount }, (_, index) => {
    const target = base + (index < remainder ? 1 : 0);
    if (maxPerSeed === undefined) return Math.max(target, 1);
    return Math.min(Math.max(target, 1), maxPerSeed);
  });
}

function familyForFormula(formulaId: string): FormulaMetadata['family'] | undefined {
  return FORMULA_CATALOG.find((item) => item.id === formulaId)?.family;
}

function metadataForFormula(formulaId: string): FormulaMetadata | undefined {
  return FORMULA_CATALOG.find((item) => item.id === formulaId);
}

function preferredPaletteIndexes(styleTags: string[]): number[] {
  const normalized = new Set(styleTags.map((item) => item.toLowerCase()));
  const preferred = new Set<number>();
  if (normalized.has('blue')) {
    preferred.add(1);
    preferred.add(4);
  }
  if (normalized.has('gold') || normalized.has('ritual')) {
    preferred.add(0);
    preferred.add(2);
  }
  if (normalized.has('quiet')) {
    preferred.add(4);
  }
  if (normalized.has('high-contrast')) {
    preferred.add(0);
  }
  return preferred.size > 0 ? Array.from(preferred) : PALETTES.map((palette) => palette.index);
}

function applyBoundsJitter(document: FractalDocument, rng: () => number, strength: Strength, trace: MutationTraceStep[]): void {
  const factor = strengthFactor(strength);
  const deltaX = randomBetween(-0.08, 0.08, rng) / Math.max(document.scene.bounds.zoom, 0.3) * factor;
  const deltaY = randomBetween(-0.08, 0.08, rng) / Math.max(document.scene.bounds.zoom, 0.3) * factor;
  document.scene.bounds.centerX += deltaX;
  document.scene.bounds.centerY += deltaY;
  trace.push({
    kind: 'bounds-jitter',
    summary: `Shifted bounds by (${deltaX.toFixed(6)}, ${deltaY.toFixed(6)})`,
    details: { deltaX, deltaY },
  });
}

function applyBoundsZoomLadder(document: FractalDocument, rng: () => number, strength: Strength, trace: MutationTraceStep[]): void {
  const ladders = strength === 'low'
    ? [0.8, 1.1, 1.4]
    : strength === 'high'
      ? [0.55, 0.75, 1.25, 1.7, 2.4]
      : [0.7, 0.9, 1.3, 1.8];
  const multiplier = pickFrom(ladders, rng, 1.0);
  document.scene.bounds.zoom = Math.max(0.02, Number((document.scene.bounds.zoom * multiplier).toFixed(6)));
  trace.push({
    kind: 'bounds-zoom-ladder',
    summary: `Adjusted zoom by x${multiplier.toFixed(2)}`,
    details: { multiplier },
  });
}

function applyJuliaPerturb(document: FractalDocument, rng: () => number, strength: Strength, trace: MutationTraceStep[]): void {
  const factor = 0.08 * strengthFactor(strength);
  const deltaRe = randomBetween(-factor, factor, rng);
  const deltaIm = randomBetween(-factor, factor, rng);
  document.formula.juliaC = [
    Number((document.formula.juliaC[0] + deltaRe).toFixed(6)),
    Number((document.formula.juliaC[1] + deltaIm).toFixed(6)),
  ];
  trace.push({
    kind: 'julia-perturb',
    summary: `Adjusted Julia C by (${deltaRe.toFixed(6)}, ${deltaIm.toFixed(6)})`,
    details: { deltaRe, deltaIm },
  });
}

function applyPaletteGradientVariant(
  document: FractalDocument,
  config: NormalizedCampaignConfig,
  rng: () => number,
  trace: MutationTraceStep[],
): void {
  if (document.coloring.customGradient && document.coloring.customGradient.length > 1) {
    document.coloring.customGradient = document.coloring.customGradient
      .map((stop, index) => ({
        ...stop,
        position:
          index === 0
            ? 0
            : index === document.coloring.customGradient!.length - 1
              ? 1
              : Number(Math.min(0.98, Math.max(0.02, stop.position + randomBetween(-0.08, 0.08, rng))).toFixed(2)),
      }))
      .sort((a, b) => a.position - b.position);
    trace.push({
      kind: 'palette-gradient-variant',
      summary: 'Adjusted custom gradient stop positions',
    });
    return;
  }

  const preferred = preferredPaletteIndexes(config.styleTags);
  const nextPalette = pickFrom(preferred, rng, document.coloring.paletteIndex);
  document.coloring.paletteIndex = nextPalette;
  trace.push({
    kind: 'palette-gradient-variant',
    summary: `Switched palette to ${nextPalette}`,
    details: { paletteIndex: nextPalette },
  });
}

function applyInsideOutsideVariant(document: FractalDocument, config: NormalizedCampaignConfig, rng: () => number, trace: MutationTraceStep[]): void {
  const outsideIds = (config.constraints.allowedOutsideModes ?? pluginRegistry.listOutsideColoring().map((plugin) => plugin.id))
    .filter((id) => id !== document.coloring.outsideColoringId);
  const insideIds = (config.constraints.allowedInsideModes ?? pluginRegistry.listInsideColoring().map((plugin) => plugin.id))
    .filter((id) => id !== document.coloring.insideColoringId);

  const nextOutside = pickFrom(outsideIds, rng, document.coloring.outsideColoringId);
  const nextInside = pickFrom(insideIds, rng, document.coloring.insideColoringId);
  document.coloring.outsideColoringId = nextOutside;
  document.coloring.insideColoringId = nextInside;
  trace.push({
    kind: 'inside-outside-variant',
    summary: `Set outside=${nextOutside}, inside=${nextInside}`,
    details: { outsideColoringId: nextOutside, insideColoringId: nextInside },
  });
}

function applyTransformSwitch(document: FractalDocument, config: NormalizedCampaignConfig, rng: () => number, trace: MutationTraceStep[]): void {
  const transforms = (config.constraints.allowedTransforms ?? pluginRegistry.listTransforms().map((plugin) => plugin.id))
    .filter((id) => id !== document.transform.transformId);
  const nextTransform = pickFrom(transforms, rng, document.transform.transformId);
  document.transform.transformId = nextTransform;
  trace.push({
    kind: 'transform-switch',
    summary: `Switched transform to ${nextTransform}`,
    details: { transformId: nextTransform },
  });
}

function perturbUniformValues(
  values: PluginParamRecord | undefined,
  descriptors: Array<{ name: string; min?: number; max?: number; default: number | number[] | boolean }>,
  rng: () => number,
  strength: Strength,
): PluginParamRecord | undefined {
  if (!values && descriptors.length === 0) return values;
  const next = { ...(values ?? {}) };
  const factor = strengthFactor(strength);

  for (const descriptor of descriptors) {
    if (typeof descriptor.default !== 'number') continue;
    const currentValue = next[descriptor.name];
    const current = typeof currentValue === 'number' ? currentValue : descriptor.default;
    const rangeMin = descriptor.min ?? current - 1;
    const rangeMax = descriptor.max ?? current + 1;
    const span = (rangeMax - rangeMin) * 0.12 * factor;
    const delta = randomBetween(-span, span, rng);
    const candidate = Math.min(rangeMax, Math.max(rangeMin, current + delta));
    next[descriptor.name] = Number(candidate.toFixed(6));
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function applyPluginParamPerturb(document: FractalDocument, rng: () => number, strength: Strength, trace: MutationTraceStep[]): void {
  const formulaPlugin = pluginRegistry.getFormula(document.formula.formulaId);
  const outsidePlugin = pluginRegistry.getOutsideColoring(document.coloring.outsideColoringId);
  const insidePlugin = pluginRegistry.getInsideColoring(document.coloring.insideColoringId);
  const transformPlugin = pluginRegistry.getTransform(document.transform.transformId);

  document.formula.params = {
    formula: perturbUniformValues(document.formula.params?.formula, formulaPlugin?.uniforms ?? [], rng, strength) ?? {},
  };
  document.coloring.params = {
    outside: perturbUniformValues(document.coloring.params?.outside, outsidePlugin?.uniforms ?? [], rng, strength),
    inside: perturbUniformValues(document.coloring.params?.inside, insidePlugin?.uniforms ?? [], rng, strength),
  };
  document.transform.params = {
    transform: perturbUniformValues(document.transform.params?.transform, transformPlugin?.uniforms ?? [], rng, strength),
  };

  trace.push({
    kind: 'plugin-param-perturb',
    summary: 'Perturbed plugin uniform values within declared ranges',
  });
}

function candidateFormulaPool(seed: FractalDocument, config: NormalizedCampaignConfig): FormulaMetadata[] {
  const allowedFamilies = config.targetFamilies.length > 0
    ? new Set(config.targetFamilies)
    : config.constraints.preferredFamilies
      ? new Set(config.constraints.preferredFamilies)
      : undefined;
  const allowedIds = config.targetFormulas.length > 0 ? new Set(config.targetFormulas) : undefined;

  return FORMULA_CATALOG.filter((item) => {
    if (allowedIds && !allowedIds.has(item.id)) return false;
    if (allowedFamilies && !allowedFamilies.has(item.family)) return false;
    if (config.constraints.requireJulia && !pluginRegistry.getFormula(item.id)?.supportsJulia) return false;
    return true;
  }).filter((item) => item.id !== seed.formula.formulaId);
}

function applyFormulaFamilySwap(document: FractalDocument, config: NormalizedCampaignConfig, rng: () => number, trace: MutationTraceStep[]): void {
  const pool = candidateFormulaPool(document, config);
  if (pool.length === 0) return;
  const nextFormula = pickFrom(pool, rng, metadataForFormula(document.formula.formulaId) ?? pool[0]);
  document.formula.formulaId = nextFormula.id;
  document.scene.bounds = {
    centerX: nextFormula.defaultBounds.centerX,
    centerY: nextFormula.defaultBounds.centerY,
    zoom: nextFormula.defaultBounds.zoom,
    rotation: nextFormula.defaultBounds.rotation ?? 0,
  };
  if (!pluginRegistry.getFormula(nextFormula.id)?.supportsJulia) {
    document.formula.isJulia = false;
  }
  trace.push({
    kind: 'formula-family-swap',
    summary: `Switched formula to ${nextFormula.id} (${nextFormula.family})`,
    details: { formulaId: nextFormula.id, family: nextFormula.family },
  });
}

function applyAnimationSeedVariant(document: FractalDocument, config: NormalizedCampaignConfig, rng: () => number, trace: MutationTraceStep[]): void {
  if (config.mutation.strengths.animation === 'off') return;
  if (!document.animation?.keyframes || document.animation.keyframes.length < 2) return;
  const last = document.animation.keyframes[document.animation.keyframes.length - 1];
  last.bounds.zoom = Math.max(0.02, Number((last.bounds.zoom * pickFrom([0.85, 1.15, 1.35], rng, 1)).toFixed(6)));
  last.bounds.rotation = Number(((last.bounds.rotation ?? 0) + randomBetween(-0.25, 0.25, rng)).toFixed(4));
  trace.push({
    kind: 'animation-seed-variant',
    summary: 'Adjusted final keyframe zoom/rotation',
    details: { zoom: last.bounds.zoom, rotation: last.bounds.rotation },
  });
}

function buildCandidateMetadata(document: FractalDocument) {
  return {
    family: familyForFormula(document.formula.formulaId),
    formulaId: document.formula.formulaId,
    transformId: document.transform.transformId,
    outsideColoringId: document.coloring.outsideColoringId,
    insideColoringId: document.coloring.insideColoringId,
  };
}

function candidateId(seedId: string, ordinal: number): string {
  return `candidate-${seedId}-${String(ordinal + 1).padStart(3, '0')}`;
}

function normalizeCandidateDocument(document: FractalDocument): FractalDocument {
  return migrateFractalDocument(document);
}

function generateCandidateForOrdinal(
  runId: string,
  seed: PreparedSeed,
  config: NormalizedCampaignConfig,
  seedIndex: number,
  ordinal: number,
  shardIndex: number,
): CandidateRecord {
  const rng = mulberry32(config.mutation.deterministicSeed + hashString(seed.id) + seedIndex * 10007 + ordinal * 7919);
  const candidate = deepCloneDocument(seed.document);
  const trace: MutationTraceStep[] = [
    {
      kind: 'seed-normalize',
      summary: `Started from seed ${seed.id}`,
    },
  ];

  const strategyOrder = [...config.mutation.strategies];
  const offset = ordinal % strategyOrder.length;
  const prioritized = [...strategyOrder.slice(offset), ...strategyOrder.slice(0, offset)];
  const selected = prioritized.slice(0, Math.min(4, prioritized.length));

  for (const strategy of selected) {
    switch (strategy) {
      case 'bounds-jitter':
        applyBoundsJitter(candidate, rng, config.mutation.strengths.bounds, trace);
        break;
      case 'bounds-zoom-ladder':
        applyBoundsZoomLadder(candidate, rng, config.mutation.strengths.bounds, trace);
        break;
      case 'julia-perturb':
        applyJuliaPerturb(candidate, rng, config.mutation.strengths.formulaParams, trace);
        break;
      case 'palette-gradient-variant':
        applyPaletteGradientVariant(candidate, config, rng, trace);
        break;
      case 'inside-outside-variant':
        applyInsideOutsideVariant(candidate, config, rng, trace);
        break;
      case 'transform-switch':
        applyTransformSwitch(candidate, config, rng, trace);
        break;
      case 'plugin-param-perturb':
        applyPluginParamPerturb(candidate, rng, config.mutation.strengths.formulaParams, trace);
        break;
      case 'formula-family-swap':
        applyFormulaFamilySwap(candidate, config, rng, trace);
        break;
      case 'animation-seed-variant':
        applyAnimationSeedVariant(candidate, config, rng, trace);
        break;
      default:
        break;
    }
  }

  const normalized = normalizeCandidateDocument(candidate);
  return {
    id: candidateId(seed.id, ordinal),
    runId,
    shardIndex,
    seedId: seed.id,
    document: normalized,
    mutationTrace: trace,
    targetTags: {
      style: config.styleTags,
      structural: config.structuralTags,
      portfolioRole: config.portfolioRoleTags,
    },
    metadata: buildCandidateMetadata(normalized),
  };
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, value: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value.endsWith('\n') ? value : `${value}\n`);
}

function writeJsonl(filePath: string, items: unknown[]): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${items.map((item) => JSON.stringify(item)).join('\n')}\n`);
}

function writeCampaignSummary(outputDir: string, manifest: ExplorationRunManifest): void {
  const lines = [
    '# Campaign Summary',
    '',
    `- runId: \`${manifest.runId}\``,
    `- locale: \`${manifest.locale}\``,
    `- shardCount: \`${manifest.shardCount}\``,
    `- seeds: \`${manifest.seeds.length}\``,
    `- targetFamilies: \`${manifest.campaign.targetFamilies.join(', ') || 'n/a'}\``,
    `- targetFormulas: \`${manifest.campaign.targetFormulas.join(', ') || 'n/a'}\``,
    `- styleTags: \`${manifest.campaign.styleTags.join(', ') || 'n/a'}\``,
    `- structuralTags: \`${manifest.campaign.structuralTags.join(', ') || 'n/a'}\``,
    `- portfolioRoleTags: \`${manifest.campaign.portfolioRoleTags.join(', ') || 'n/a'}\``,
    '',
  ];
  writeText(path.join(outputDir, 'reports', 'campaign-summary.md'), lines.join('\n'));
}

function prepareSeeds(config: NormalizedCampaignConfig): PreparedSeed[] {
  return config.seedSources.map(resolveSeedSource);
}

function createManifest(
  outputDir: string,
  config: NormalizedCampaignConfig,
  seeds: PreparedSeed[],
): ExplorationRunManifest {
  const budgets = allocateSeedBudgets(config, seeds.length);
  const inputsDir = path.join(outputDir, 'inputs');
  ensureDir(inputsDir);

  const manifest: ExplorationRunManifest = {
    runId: config.id,
    createdAt: Date.now(),
    phase: 'm4.10b-phase-3',
    locale: config.locale,
    baseUrl: config.baseUrl,
    campaign: config,
    seeds: seeds.map((seed, index) => {
      const documentPath = path.join(inputsDir, `${seed.id}.json`);
      writeJson(documentPath, seed.document);
      return {
        id: seed.id,
        sourceType: seed.sourceType,
        documentPath,
        budget: budgets[index],
        metadata: seed.metadata,
      };
    }),
    shardCount: config.budget.shardCount ?? 1,
  };

  writeJson(path.join(outputDir, 'manifest.json'), manifest);
  writeCampaignSummary(outputDir, manifest);
  return manifest;
}

function readManifest(manifestPath: string): ExplorationRunManifest {
  return JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8')) as ExplorationRunManifest;
}

function loadPreparedSeedFromManifest(manifestSeed: ExplorationRunManifest['seeds'][number]): PreparedSeed {
  return {
    id: manifestSeed.id,
    sourceType: manifestSeed.sourceType,
    document: migrateFractalDocument(JSON.parse(fs.readFileSync(manifestSeed.documentPath, 'utf8'))),
    metadata: manifestSeed.metadata,
  };
}

function generateCandidatesForManifest(manifest: ExplorationRunManifest, shardIndex?: number): CandidateRecord[] {
  const results: CandidateRecord[] = [];
  const seeds = manifest.seeds.map(loadPreparedSeedFromManifest);

  seeds.forEach((seed, seedIndex) => {
    const perSeedBudget = manifest.seeds[seedIndex].budget;
    for (let ordinal = 0; ordinal < perSeedBudget; ordinal += 1) {
      const resolvedShard = ordinal % manifest.shardCount;
      if (shardIndex !== undefined && resolvedShard !== shardIndex) continue;
      results.push(
        generateCandidateForOrdinal(manifest.runId, seed, manifest.campaign, seedIndex, ordinal, resolvedShard),
      );
    }
  });

  return results;
}

export function exploreMutate(args: { document: unknown; config?: unknown }) {
  ensureBuiltinsRegistered();
  const document = normalizeCandidateDocument(migrateFractalDocument(asObject(args.document)));
  const config = normalizeCampaignConfig(
    args.config ?? {
      seedSources: [{ type: 'document', path: '__in-memory__' }],
      budget: { candidateCount: 6, shardCount: 1 },
    },
  );
  const seed: PreparedSeed = { id: 'seed-001', sourceType: 'document', document };
  const budget = allocateSeedBudgets(config, 1)[0];
  const items = Array.from({ length: budget }, (_, ordinal) =>
    generateCandidateForOrdinal(config.id, seed, config, 0, ordinal, 0),
  );

  return createSuccess('explore mutate', {
    count: items.length,
    items,
    campaign: {
      id: config.id,
      styleTags: config.styleTags,
      structuralTags: config.structuralTags,
      portfolioRoleTags: config.portfolioRoleTags,
    },
  });
}

export function exploreBatch(args: { config: unknown; outputDir: string }) {
  ensureBuiltinsRegistered();
  if (!args.outputDir) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected --output-dir for explore batch.');
  }
  const config = normalizeCampaignConfig(args.config);
  const outputDir = path.resolve(args.outputDir);
  ensureDir(outputDir);
  const seeds = prepareSeeds(config);
  const manifest = createManifest(outputDir, config, seeds);
  const merged = generateCandidatesForManifest(manifest);
  const mergedPath = path.join(outputDir, 'candidates', 'merged.jsonl');
  writeJsonl(mergedPath, merged);

  return createSuccess('explore batch', {
    runId: manifest.runId,
    outputDir,
    manifest: path.join(outputDir, 'manifest.json'),
    merged: mergedPath,
    count: merged.length,
    shardCount: manifest.shardCount,
  });
}

export function exploreShard(args: { manifestPath: string; shardIndex: number }) {
  ensureBuiltinsRegistered();
  if (!args.manifestPath) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected --manifest for explore shard.');
  }
  if (!Number.isInteger(args.shardIndex) || args.shardIndex < 0) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected --shard-index >= 0 for explore shard.');
  }
  const manifest = readManifest(args.manifestPath);
  if (args.shardIndex >= manifest.shardCount) {
    throw new CliCommandError('INVALID_INPUT', 1, `Shard index ${args.shardIndex} exceeds shardCount ${manifest.shardCount}.`);
  }
  const outputDir = path.dirname(path.resolve(args.manifestPath));
  const items = generateCandidatesForManifest(manifest, args.shardIndex);
  const shardPath = path.join(outputDir, 'candidates', `shard-${String(args.shardIndex).padStart(3, '0')}.jsonl`);
  writeJsonl(shardPath, items);

  return createSuccess('explore shard', {
    runId: manifest.runId,
    shardIndex: args.shardIndex,
    count: items.length,
    output: shardPath,
  });
}
