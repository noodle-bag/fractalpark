import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import type { FormulaExperienceHint } from '@/engine/frm/authoring';
import type { CompileResult } from '@/engine/frm/compile';
import type { EditorError } from '@/engine/frm/codemirror-lint';
import { hashFrmLikeV1, parseFrmLikeV1 } from '@/engine/frm/v1';
import { compilePublishedFormulaPluginV1 } from '@/engine/formulas/v1/published-adapter';
import {
  hashProfileRevisionV1,
  sha256HexV1,
} from '@/engine/formulas/v1/revisions';
import {
  projectExecutableFormulaDefinitionV1,
  validateFormulaSafetyEnvelopeV1,
} from '@/engine/formulas/v1/safety-envelope';
import type {
  FormulaDefinitionV1,
  FormulaIdV1,
  FormulaProfileV1,
  FormulaRevisionV1,
} from '@/engine/formulas/v1/types';
import {
  resolvePublishedFormulaDefaultProfileV1,
  type PublishedFormulaRuntimeIndexRowV1,
} from '@/engine/formulas/v1/published-runtime';
import type { MineFormulaLifecycleRevisionInput } from '@/lib/cloud/mine-formula-lifecycle';
import type { PublishedFormulaCanonicalSourceV1 } from '@/lib/published-formula-source';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_V5 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REVISION = /^[0-9a-f]{64}$/;

export type PublishedFormulaRemixIntent =
  | { readonly status: 'none' }
  | { readonly status: 'valid'; readonly formulaId: string }
  | {
      readonly status: 'invalid';
      readonly formulaId: string;
      readonly reason: 'missing' | 'duplicate' | 'invalid-id' | 'invalid-intent';
    };

export type MineFormulaEditorIntent =
  | { readonly status: 'none' }
  | { readonly status: 'valid'; readonly formulaId: string }
  | { readonly status: 'invalid' };

export interface FrozenPublishedFormulaRemixV1 {
  readonly formulaId: FormulaIdV1;
  readonly parentFormulaId: FormulaIdV1;
  readonly parentSourceRevision: FormulaRevisionV1;
  readonly parentProfileRevision: FormulaRevisionV1;
  readonly displayName: string;
  readonly family: string;
  readonly source: string;
  readonly experienceHint: FormulaExperienceHint;
  readonly parentProfile: FormulaProfileV1;
}

export interface MineRemixSaveContextV1 {
  readonly name: string;
  readonly source: string;
  readonly experienceHint?: FormulaExperienceHint;
  readonly runnable: boolean;
  readonly diagnostics: readonly string[];
  readonly supersedes?: string | null;
}

export function buildPublishedFormulaRemixHref(
  locale: string,
  formulaId: string,
): string {
  return `/${locale}/formulas/editor?open=standard-formula&formula=${encodeURIComponent(
    formulaId,
  )}&intent=remix`;
}

export function parsePublishedFormulaRemixIntent(
  searchParams: URLSearchParams,
): PublishedFormulaRemixIntent {
  const openValues = searchParams.getAll('open');
  if (!openValues.includes('standard-formula')) return { status: 'none' };
  const formulaValues = searchParams.getAll('formula');
  const intentValues = searchParams.getAll('intent');
  const formulaId = formulaValues.length === 1 ? formulaValues[0] : '';
  if (
    openValues.length !== 1 ||
    formulaValues.length > 1 ||
    intentValues.length > 1
  ) {
    return { status: 'invalid', formulaId, reason: 'duplicate' };
  }
  if (formulaValues.length === 0) {
    return { status: 'invalid', formulaId, reason: 'missing' };
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(formulaId)) {
    return { status: 'invalid', formulaId, reason: 'invalid-id' };
  }
  if (intentValues.length !== 1 || intentValues[0] !== 'remix') {
    return { status: 'invalid', formulaId, reason: 'invalid-intent' };
  }
  return { status: 'valid', formulaId };
}

export function stripPublishedFormulaRemixIntent(
  locale: string,
  searchParams: URLSearchParams,
): string {
  const next = new URLSearchParams(searchParams);
  next.delete('open');
  next.delete('formula');
  next.delete('intent');
  const query = next.toString();
  return `/${locale}/formulas/editor${query ? `?${query}` : ''}`;
}

export function buildMineFormulaEditorHref(locale: string, formulaId: string): string {
  return `/${locale}/formulas/editor?open=mine-formula&formula=${encodeURIComponent(
    formulaId,
  )}`;
}

export function parseMineFormulaEditorIntent(
  params: URLSearchParams,
): MineFormulaEditorIntent {
  const open = params.getAll('open');
  const formula = params.getAll('formula');
  if (!open.includes('mine-formula')) return { status: 'none' };
  if (
    open.length !== 1 ||
    formula.length !== 1 ||
    open[0] !== 'mine-formula' ||
    !UUID_V4.test(formula[0])
  ) {
    return { status: 'invalid' };
  }
  return { status: 'valid', formulaId: formula[0] };
}

export function stripMineFormulaEditorIntent(
  locale: string,
  params: URLSearchParams,
): string {
  const next = new URLSearchParams(params);
  next.delete('open');
  next.delete('formula');
  const query = next.toString();
  return `/${locale}/formulas/editor${query ? `?${query}` : ''}`;
}

function parameterDefaults(
  row: PublishedFormulaRuntimeIndexRowV1,
): FormulaProfileV1['parameters'] {
  return Object.freeze(
    Object.fromEntries(
      row.parameters.map((parameter) => [parameter.slotName, parameter.default]),
    ),
  );
}

function profileBase(input: {
  formulaId: FormulaIdV1;
  sourceRevision: FormulaRevisionV1;
  parameters: FormulaProfileV1['parameters'];
  profile: Readonly<{
    mode: 'parameter-plane' | 'julia';
    center: readonly [number, number];
    zoom: number;
    rotation: number;
    iterations: number;
    juliaC?: readonly [number, number];
  }>;
  experienceHint?: FormulaExperienceHint;
}): Omit<FormulaProfileV1, 'profileRevision'> {
  const bounds = input.experienceHint?.bounds;
  const coloring = input.experienceHint?.coloring;
  return {
    schemaVersion: 1,
    formulaId: input.formulaId,
    sourceRevision: input.sourceRevision,
    parameters: input.parameters,
    mode: input.profile.mode,
    ...(input.profile.mode === 'julia' && input.profile.juliaC
      ? { juliaC: input.profile.juliaC }
      : {}),
    view: {
      centerX: bounds?.centerX ?? input.profile.center[0],
      centerY: bounds?.centerY ?? input.profile.center[1],
      zoom: bounds?.zoom ?? input.profile.zoom,
      rotation: bounds?.rotation ?? input.profile.rotation,
    },
    iterations: input.profile.iterations,
    coloring: {
      pipelineVersion: 2,
      outsideColoringId:
        coloring?.outsideColoringId ??
        DEFAULT_FRACTAL_DOCUMENT.coloring.outsideColoringId,
      insideColoringId:
        coloring?.insideColoringId ??
        DEFAULT_FRACTAL_DOCUMENT.coloring.insideColoringId,
      smooth: true,
    },
    palette: { paletteId: 'classic' },
    transform: {
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      skewX: 0,
      skewY: 0,
      offsetX: 0,
      offsetY: 0,
    },
  };
}

export async function createFrozenPublishedFormulaRemixV1(input: {
  readonly formulaId: string;
  readonly row: PublishedFormulaRuntimeIndexRowV1;
  readonly source: PublishedFormulaCanonicalSourceV1;
}): Promise<FrozenPublishedFormulaRemixV1> {
  if (!UUID_V4.test(input.formulaId)) {
    throw new Error('Remix formula identity must be one lowercase UUIDv4.');
  }
  if (
    input.row.formulaId !== input.source.formulaId ||
    input.row.sourceRevision !== input.source.sourceRevision ||
    input.row.semanticHash !== input.source.semanticHash
  ) {
    throw new Error('Published Remix source authority does not match.');
  }
  const parentFormulaId = input.row.formulaId as FormulaIdV1;
  const parentSourceRevision = input.row.sourceRevision as FormulaRevisionV1;
  const defaultProfile = resolvePublishedFormulaDefaultProfileV1(input.row);
  const parentBase = profileBase({
    formulaId: parentFormulaId,
    sourceRevision: parentSourceRevision,
    parameters: parameterDefaults(input.row),
    profile: defaultProfile,
  });
  const parentProfile: FormulaProfileV1 = Object.freeze({
    ...parentBase,
    profileRevision: await hashProfileRevisionV1(parentBase),
  });
  return Object.freeze({
    formulaId: input.formulaId as FormulaIdV1,
    parentFormulaId,
    parentSourceRevision,
    parentProfileRevision: parentProfile.profileRevision,
    displayName: input.row.displayName,
    family: input.row.family,
    source: input.source.source,
    experienceHint: Object.freeze({
      bounds: Object.freeze({
        centerX: defaultProfile.center[0],
        centerY: defaultProfile.center[1],
        zoom: defaultProfile.zoom,
        rotation: defaultProfile.rotation,
      }),
    }),
    parentProfile,
  });
}

export function restoreFrozenMineFormulaRemixV1(input: {
  readonly formulaId: string;
  readonly displayName: string;
  readonly source: string;
  readonly definition: unknown;
  readonly profile: unknown;
  readonly remixedFromFormulaId: string | null;
  readonly lineageSourceRevision: string | null;
  readonly lineageProfileRevision: string | null;
}): FrozenPublishedFormulaRemixV1 {
  if (
    !UUID_V4.test(input.formulaId) ||
    !input.definition ||
    typeof input.definition !== 'object' ||
    Array.isArray(input.definition) ||
    !input.profile ||
    typeof input.profile !== 'object' ||
    Array.isArray(input.profile)
  ) {
    throw new Error('Invalid Mine Remix lifecycle projection.');
  }
  const definition = input.definition as Record<string, unknown>;
  const profile = input.profile as FormulaProfileV1;
  if (
    definition.formulaId !== input.formulaId ||
    profile.formulaId !== input.formulaId ||
    !profile.view ||
    !Number.isFinite(profile.view.centerX) ||
    !Number.isFinite(profile.view.centerY) ||
    !Number.isFinite(profile.view.zoom) ||
    !Number.isFinite(profile.view.rotation) ||
    typeof input.remixedFromFormulaId !== 'string' ||
    !UUID_V5.test(input.remixedFromFormulaId) ||
    typeof input.lineageSourceRevision !== 'string' ||
    !REVISION.test(input.lineageSourceRevision) ||
    typeof input.lineageProfileRevision !== 'string' ||
    !REVISION.test(input.lineageProfileRevision)
  ) {
    throw new Error('Invalid Mine Remix lifecycle identity.');
  }
  if (typeof definition.family !== 'string') {
    throw new Error('Invalid Mine Remix lifecycle lineage.');
  }
  return Object.freeze({
    formulaId: input.formulaId as FormulaIdV1,
    parentFormulaId: input.remixedFromFormulaId as FormulaIdV1,
    parentSourceRevision: input.lineageSourceRevision as FormulaRevisionV1,
    parentProfileRevision: input.lineageProfileRevision as FormulaRevisionV1,
    displayName: input.displayName,
    family: definition.family,
    source: input.source,
    experienceHint: Object.freeze({
      bounds: Object.freeze({
        centerX: profile.view.centerX,
        centerY: profile.view.centerY,
        zoom: profile.view.zoom,
        rotation: profile.view.rotation,
      }),
    }),
    parentProfile: Object.freeze(profile),
  });
}

async function definitionForSource(input: {
  fork: FrozenPublishedFormulaRemixV1;
  source: string;
  name: string;
}): Promise<{
  definition: FormulaDefinitionV1 & {
    readonly name: string;
    readonly family: string;
  };
  parsed: ReturnType<typeof parseFrmLikeV1>;
}> {
  const parsed = parseFrmLikeV1(input.source);
  const sourceRevision = (await sha256HexV1(input.source)) as FormulaRevisionV1;
  const hashes = parsed.ok ? await hashFrmLikeV1(input.source, parsed.ir) : null;
  return {
    parsed,
    definition: {
      schemaVersion: 1,
      formulaId: input.fork.formulaId,
      scope: 'mine',
      name: input.name,
      family: input.fork.family,
      source: input.source,
      sourceRevision,
      semanticHash: (hashes?.semanticHash ?? sourceRevision) as FormulaRevisionV1,
      languageVersion: 'frm-like/1',
      stdlibVersion: 1,
      supportedNumericProfiles: ['standard32'],
      parameters: parsed.ok
        ? parsed.ir.parameters
        : fallbackParameterSchema(input.fork),
      programModel: 'orbit',
      termination: {
        predicateMeaning: 'continue-iteration',
        nonFinite: 'terminate-with-event',
        maximumIterations: 'profile-resolved',
      },
      channels: [],
      capabilities: [],
    },
  };
}

function fallbackParameterSchema(
  fork: FrozenPublishedFormulaRemixV1,
): FormulaDefinitionV1['parameters'] {
  return Object.entries(fork.parentProfile.parameters).map(([name, value]) => ({
    name,
    type: Array.isArray(value)
      ? ('complex' as const)
      : typeof value === 'string'
        ? ('function' as const)
        : ('real' as const),
    default: value,
  }));
}

export async function validateMineRemixApplyV1(input: {
  readonly fork: FrozenPublishedFormulaRemixV1;
  readonly source: string;
  readonly name?: string;
}): Promise<{ readonly ok: true } | { readonly ok: false; readonly errors: readonly string[] }> {
  const prepared = await definitionForSource({
    fork: input.fork,
    source: input.source,
    name: input.name ?? input.fork.displayName,
  });
  if (!prepared.parsed.ok) {
    return { ok: false, errors: [prepared.parsed.reason] };
  }
  const safety = await validateFormulaSafetyEnvelopeV1(
    projectExecutableFormulaDefinitionV1(prepared.definition),
  );
  return safety.ok
    ? { ok: true }
    : { ok: false, errors: [`Safety Envelope: ${safety.code}`] };
}

export function collectMineRemixEditorErrorsV1(source: string): EditorError[] {
  if (!source.trim()) {
    return [
      {
        line: 1,
        col: 1,
        message: 'Formula source is required.',
        severity: 'error',
      },
    ];
  }
  const parsed = parseFrmLikeV1(source);
  if (parsed.ok) return [];
  return [
    {
      line: parsed.line ?? 1,
      col: parsed.column ?? 1,
      message: parsed.reason,
      severity: 'error',
    },
  ];
}

export async function compileMineRemixSourceV1(input: {
  readonly fork: FrozenPublishedFormulaRemixV1;
  readonly source: string;
  readonly runtimeFormulaId?: string;
}): Promise<CompileResult> {
  const parsed = parseFrmLikeV1(input.source);
  if (!parsed.ok) {
    return {
      success: false,
      errors: [parsed.reason],
      warnings: [],
      frmSemanticsVersion: 2,
    };
  }
  const revisions = await hashFrmLikeV1(input.source, parsed.ir);
  const compiled = await compilePublishedFormulaPluginV1({
    formulaId: input.runtimeFormulaId ?? input.fork.formulaId,
    displayName: `${input.fork.displayName} Remix`,
    family: input.fork.family,
    sourceRevision: revisions.sourceRevision,
    semanticHash: revisions.semanticHash,
    source: input.source,
  });
  if (!compiled.ok) {
    return {
      success: false,
      errors: [compiled.code],
      warnings: [],
      frmSemanticsVersion: 2,
    };
  }
  return {
    success: true,
    plugin: compiled.value.plugin,
    errors: [],
    warnings: [],
    glsl: compiled.value.plugin.glsl,
    frmSemanticsVersion: 2,
  };
}

export async function buildMineRemixLifecycleRevisionV1(
  fork: FrozenPublishedFormulaRemixV1,
  context: MineRemixSaveContextV1,
): Promise<MineFormulaLifecycleRevisionInput> {
  const prepared = await definitionForSource({
    fork,
    source: context.source,
    name: context.name,
  });
  const definition = prepared.definition;
  const parameters = Object.freeze(
    Object.fromEntries(
      definition.parameters.map((parameter) => [parameter.name, parameter.default]),
    ),
  );
  const profileWithoutRevision = profileBase({
    formulaId: fork.formulaId,
    sourceRevision: definition.sourceRevision,
    parameters,
    profile: {
      mode: fork.parentProfile.mode,
      center: [
        fork.parentProfile.view.centerX,
        fork.parentProfile.view.centerY,
      ],
      zoom: fork.parentProfile.view.zoom,
      rotation: fork.parentProfile.view.rotation,
      iterations: fork.parentProfile.iterations,
      ...(fork.parentProfile.juliaC
        ? { juliaC: fork.parentProfile.juliaC }
        : {}),
    },
    experienceHint: context.experienceHint,
  });
  const profile: FormulaProfileV1 = {
    ...profileWithoutRevision,
    profileRevision: await hashProfileRevisionV1(profileWithoutRevision),
  };
  const diagnostics = context.runnable
    ? []
    : context.diagnostics.length > 0
      ? context.diagnostics.map((message) => ({ code: 'invalid-draft', message }))
      : [{ code: 'invalid-draft', message: 'Draft has not passed Apply.' }];
  return {
    definition: definition as unknown as Record<string, unknown>,
    profile: profile as unknown as Record<string, unknown>,
    sourceRevision: definition.sourceRevision,
    profileRevision: profile.profileRevision,
    runnable: context.runnable,
    diagnostics,
    ...(context.supersedes ? { supersedes: context.supersedes } : {}),
    remixedFromFormulaId: fork.parentFormulaId,
    lineageSourceRevision: fork.parentSourceRevision,
    lineageProfileRevision: fork.parentProfileRevision,
  };
}
