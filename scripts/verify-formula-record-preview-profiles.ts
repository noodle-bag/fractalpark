import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import activationAsset from '../resources/formula-library/v1/julia-runtime-activation.v1.json';
import gatesAsset from '../resources/formula-library/v1/record-preview-gates.v1.json';
import legacyPreviewManifestAsset from '../public/formula-library/v1/previews/manifest.json';
import runtimeIndexAsset from '../public/formula-library/v1/runtime/published/index.json';
import { compilePublishedFormulaPluginV1 } from '../src/engine/formulas/v1/published-adapter';
import { renderRecordPreviewV1 } from '../src/engine/formulas/v1/record-preview-renderer';
import type { PublishedFormulaRuntimeIndexRowV1 } from '../src/engine/formulas/v1/published-runtime';
import type { FormulaProfileV1 } from '../src/engine/formulas/v1/types';

const root = process.cwd();
const artifactPath = join(
  root,
  'resources/formula-library/v1/record-preview-profiles.v1.json',
);
const runtimeRoot = join(root, 'public/formula-library/v1/runtime/published');
const sourcePaths = [
  'resources/formula-library/v1/record-preview-gates.v1.json',
  'public/formula-library/v1/runtime/published/index.json',
  'public/formula-library/v1/previews/manifest.json',
  'resources/formula-library/v1/julia-runtime-activation.v1.json',
  'scripts/generate-formula-record-preview-profiles.ts',
  'src/engine/formulas/v1/published-adapter.ts',
  'src/engine/formulas/v1/julia-runtime-activation-v1.ts',
  'src/engine/formulas/v1/record-preview-renderer.ts',
  'src/engine/frm/v1-backend.ts',
  'package-lock.json',
] as const;

type JsonRecord = Record<string, unknown>;

type Strategy =
  | 'runtime-black'
  | 'bounded-black'
  | 'runtime-orbit-average'
  | 'bounded-orbit-average';

interface ViewCandidate {
  id: string;
  mode: 'parameter-plane' | 'julia';
  center: readonly [number, number];
  zoom: number;
  juliaC?: readonly [number, number];
}

interface ProfilePolicy {
  schema: string;
  revision: number;
  iterationCap: 16;
  iterationCandidates: Array<16 | 8 | 4 | 2>;
  sourceValidationIterationCandidates: Array<2 | 4 | 8 | 16>;
  searchWidth: number;
  searchHeight: number;
  verificationWidth: number;
  verificationHeight: number;
  sourceValidationWidth: number;
  sourceValidationHeight: number;
  sourceValidationTrigger: string;
  verificationRenders: number;
  searchMinimumUniqueColors: number;
  verificationMinimumUniqueColors: number;
  maximumNonFiniteFraction: number;
  minimumEscapedFractionForBlack: number;
  strategies: string[];
  insideColoringIds: string[];
  runtimeParameterCandidateId: string;
  runtimeViewCandidateId: string;
  parameterSlotOrder: string;
  deduplicationRule: string;
  selectionRule: string;
  parameterStrategies: string[];
  realValues: number[];
  complexValues: Array<readonly [number, number]>;
  functionValues: string[];
  viewCandidates: ViewCandidate[];
}

interface Gates {
  schema: string;
  revision: number;
  publishedCount: number;
  renderer: { iterationCap: 16 };
  profilePolicy: ProfilePolicy;
}

interface Selection {
  strategy: Strategy;
  candidateOrdinal: number;
  iterationCandidate: 16 | 8 | 4 | 2;
  parameterCandidateId: string;
  viewCandidateId: string;
}

interface ParameterCandidate {
  id: string;
  parameters: FormulaProfileV1['parameters'];
}

interface ArtifactRow {
  formulaId: string;
  sourceRevision: string;
  semanticHash: string;
  runtimeDefaultProfileSha256: string;
  recordPreviewProfileRevision: string;
  recordPreviewProfileSha256: string;
  selection: Selection;
  profile: FormulaProfileV1;
  verification: {
    width: number;
    height: number;
    escapedPixels: number;
    interiorPixels: number;
    nonFinitePixels: number;
    uniqueColors: number;
    rawRgbaSha256: string;
  };
  sourceValidation: ArtifactRow['verification'] | null;
  legacyPreviewAnomalies: string[];
}

const gates = gatesAsset as unknown as Gates;
const runtimeRows = (
  runtimeIndexAsset as unknown as { rows: PublishedFormulaRuntimeIndexRowV1[] }
).rows;
const legacyRows = (
  legacyPreviewManifestAsset as unknown as {
    rows: Array<{ formulaId: string; anomalies: string[] }>;
  }
).rows;
const activationPairs = new Set(
  (
    activationAsset as unknown as {
      rows: Array<{ formulaId: string; sourceRevision: string }>;
    }
  ).rows.map((row) => `${row.formulaId}:${row.sourceRevision}`),
);

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as JsonRecord;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function sha256(value: Buffer | string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function expectedSourceBindings(): Record<string, string> {
  return Object.fromEntries(
    sourcePaths.map((path) => [path, sha256(readFileSync(join(root, path)))]),
  );
}

function effectiveRuntimeProfile(
  row: PublishedFormulaRuntimeIndexRowV1,
): unknown {
  if (
    row.profile.mode !== 'julia' ||
    activationPairs.has(`${row.formulaId}:${row.sourceRevision}`)
  ) {
    return row.profile;
  }
  return {
    schema: row.profile.schema,
    quality: row.profile.quality,
    mode: 'parameter-plane',
    center: row.profile.center,
    zoom: row.profile.zoom,
    rotation: row.profile.rotation,
    iterations: row.profile.iterations,
    ...(row.profile.probe ? { probe: row.profile.probe } : {}),
  };
}

function defaultParameters(
  row: PublishedFormulaRuntimeIndexRowV1,
): FormulaProfileV1['parameters'] {
  return Object.fromEntries(
    row.parameters.map((parameter) => [
      parameter.slotName,
      Array.isArray(parameter.default)
        ? [...parameter.default]
        : parameter.default,
    ]),
  ) as FormulaProfileV1['parameters'];
}

function inHardDomain(
  value: number,
  domain: readonly [number, number] | undefined,
): boolean {
  return domain === undefined || (value >= domain[0] && value <= domain[1]);
}

function parameterCandidates(
  row: PublishedFormulaRuntimeIndexRowV1,
): ParameterCandidate[] {
  const defaults = defaultParameters(row);
  const candidates: ParameterCandidate[] = [
    { id: 'defaults', parameters: defaults },
  ];
  for (const parameter of row.parameters) {
    if (parameter.type === 'real') {
      for (const value of gates.profilePolicy.realValues) {
        if (!inHardDomain(value, parameter.hardDomain)) continue;
        candidates.push({
          id: `single-real:${parameter.slotName}:${String(value)}`,
          parameters: { ...defaults, [parameter.slotName]: value },
        });
      }
    } else if (parameter.type === 'complex') {
      for (const value of gates.profilePolicy.complexValues) {
        candidates.push({
          id: `single-complex:${parameter.slotName}:${String(value[0])},${String(value[1])}`,
          parameters: { ...defaults, [parameter.slotName]: value },
        });
      }
    } else {
      for (const value of gates.profilePolicy.functionValues) {
        if (!parameter.options?.includes(value)) continue;
        candidates.push({
          id: `single-function:${parameter.slotName}:${value}`,
          parameters: { ...defaults, [parameter.slotName]: value },
        });
      }
    }
  }
  const real = row.parameters.filter((parameter) => parameter.type === 'real');
  const complex = row.parameters.filter((parameter) => parameter.type === 'complex');
  const functions = row.parameters.filter(
    (parameter) => parameter.type === 'function',
  );
  if (real.length > 1) {
    for (const value of gates.profilePolicy.realValues) {
      if (!real.every((parameter) => inHardDomain(value, parameter.hardDomain))) {
        continue;
      }
      candidates.push({
        id: `all-real:${String(value)}`,
        parameters: {
          ...defaults,
          ...Object.fromEntries(
            real.map((parameter) => [parameter.slotName, value]),
          ),
        },
      });
    }
  }
  if (complex.length > 1) {
    for (const value of gates.profilePolicy.complexValues) {
      candidates.push({
        id: `all-complex:${String(value[0])},${String(value[1])}`,
        parameters: {
          ...defaults,
          ...Object.fromEntries(
            complex.map((parameter) => [parameter.slotName, value]),
          ),
        },
      });
    }
  }
  if (functions.length > 1) {
    for (const value of gates.profilePolicy.functionValues) {
      if (!functions.every((parameter) => parameter.options?.includes(value))) {
        continue;
      }
      candidates.push({
        id: `all-functions:${value}`,
        parameters: {
          ...defaults,
          ...Object.fromEntries(
            functions.map((parameter) => [parameter.slotName, value]),
          ),
        },
      });
    }
  }
  if (complex.length > 0 && functions.length > 0) {
    for (const complexValue of gates.profilePolicy.complexValues) {
      for (const functionValue of gates.profilePolicy.functionValues) {
        if (
          !functions.every((parameter) =>
            parameter.options?.includes(functionValue),
          )
        ) {
          continue;
        }
        candidates.push({
          id: `all-combined:${String(complexValue[0])},${String(complexValue[1])}:${functionValue}`,
          parameters: {
            ...defaults,
            ...Object.fromEntries(
              complex.map((parameter) => [parameter.slotName, complexValue]),
            ),
            ...Object.fromEntries(
              functions.map((parameter) => [parameter.slotName, functionValue]),
            ),
          },
        });
      }
    }
  }
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = canonicalJson(candidate.parameters);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function viewCandidates(
  row: PublishedFormulaRuntimeIndexRowV1,
): ViewCandidate[] {
  const effective = effectiveRuntimeProfile(row) as {
    mode: 'parameter-plane' | 'julia';
    center: readonly [number, number];
    zoom: number;
    juliaC?: readonly [number, number];
  };
  const candidates: ViewCandidate[] = [
    {
      id: 'effective-default',
      mode: effective.mode,
      center: effective.center,
      zoom: effective.zoom,
      ...(effective.mode === 'julia' && effective.juliaC
        ? { juliaC: effective.juliaC }
        : {}),
    },
    ...gates.profilePolicy.viewCandidates,
  ];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = canonicalJson({
      mode: candidate.mode,
      center: candidate.center,
      zoom: candidate.zoom,
      juliaC: candidate.juliaC,
    });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function profileFor(
  row: PublishedFormulaRuntimeIndexRowV1,
  parameters: FormulaProfileV1['parameters'],
  view: ViewCandidate,
  iterations: Selection['iterationCandidate'],
  insideColoringId: 'black' | 'record-preview-orbit-average-v1',
  selection: Selection,
): FormulaProfileV1 {
  const core = {
    schemaVersion: 1 as const,
    formulaId: row.formulaId as FormulaProfileV1['formulaId'],
    sourceRevision: row.sourceRevision as FormulaProfileV1['sourceRevision'],
    parameters,
    mode: view.mode,
    ...(view.mode === 'julia' && view.juliaC
      ? { juliaC: [...view.juliaC] as readonly [number, number] }
      : {}),
    view: {
      centerX: view.center[0],
      centerY: view.center[1],
      zoom: view.zoom,
      rotation: 0,
    },
    iterations,
    coloring: {
      pipelineVersion: 1 as const,
      outsideColoringId: 'smooth',
      insideColoringId,
      smooth: true,
    },
    palette: { paletteId: 'inferno' },
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
  const profileRevision = sha256(
    canonicalJson({
      schema: 'fractalpark-record-preview-profile-revision/v1',
      sourceRevision: row.sourceRevision,
      semanticHash: row.semanticHash,
      policySha256: sha256(canonicalJson(gates.profilePolicy)),
      selection,
      profile: core,
    }),
  ) as FormulaProfileV1['profileRevision'];
  return { ...core, profileRevision };
}

function candidateProfiles(
  row: PublishedFormulaRuntimeIndexRowV1,
  iterationCandidates: readonly Selection['iterationCandidate'][] =
    gates.profilePolicy.iterationCandidates,
): Array<{ selection: Selection; profile: FormulaProfileV1 }> {
  const parameters = parameterCandidates(row);
  const views = viewCandidates(row);
  const output: Array<{ selection: Selection; profile: FormulaProfileV1 }> = [];
  const seen = new Set<string>();
  let candidateOrdinal = 0;
  const append = (
    strategy: Strategy,
    parameter: ParameterCandidate,
    view: ViewCandidate,
    iterations: Selection['iterationCandidate'],
    insideColoringId: 'black' | 'record-preview-orbit-average-v1',
  ): void => {
    const selection: Selection = {
      strategy,
      candidateOrdinal: candidateOrdinal + 1,
      iterationCandidate: iterations,
      parameterCandidateId: parameter.id,
      viewCandidateId: view.id,
    };
    const profile = profileFor(
      row,
      parameter.parameters,
      view,
      iterations,
      insideColoringId,
      selection,
    );
    const key = canonicalJson({
      parameters: profile.parameters,
      mode: profile.mode,
      juliaC: profile.juliaC,
      view: profile.view,
      iterations: profile.iterations,
      coloring: profile.coloring,
    });
    if (seen.has(key)) return;
    seen.add(key);
    candidateOrdinal += 1;
    selection.candidateOrdinal = candidateOrdinal;
    output.push({ selection, profile });
  };
  for (const iterations of iterationCandidates) {
    append('runtime-black', parameters[0]!, views[0]!, iterations, 'black');
    append(
      'runtime-orbit-average',
      parameters[0]!,
      views[0]!,
      iterations,
      'record-preview-orbit-average-v1',
    );
    for (const parameter of parameters) {
      for (const view of views) {
        append('bounded-black', parameter, view, iterations, 'black');
      }
    }
    for (const parameter of parameters) {
      for (const view of views) {
        append(
          'bounded-orbit-average',
          parameter,
          view,
          iterations,
          'record-preview-orbit-average-v1',
        );
      }
    }
  }
  return output;
}

function probeMetrics(
  preview: ReturnType<typeof renderRecordPreviewV1>,
): ArtifactRow['verification'] {
  return {
    width: preview.width,
    height: preview.height,
    escapedPixels: preview.escapedPixels,
    interiorPixels: preview.interiorPixels,
    nonFinitePixels: preview.nonFinitePixels,
    uniqueColors: preview.uniqueColors,
    rawRgbaSha256: sha256(preview.rgba),
  };
}

function viable(
  preview: ReturnType<typeof renderRecordPreviewV1>,
  insideColoringId: string,
  minimumUniqueColors: number,
): boolean {
  const total = preview.width * preview.height;
  return (
    preview.uniqueColors >= minimumUniqueColors &&
    preview.nonFinitePixels / total <=
      gates.profilePolicy.maximumNonFiniteFraction &&
    (insideColoringId === 'record-preview-orbit-average-v1' ||
      preview.escapedPixels / total >=
        gates.profilePolicy.minimumEscapedFractionForBlack)
  );
}

async function verifyRow(
  runtime: PublishedFormulaRuntimeIndexRowV1,
  artifact: ArtifactRow,
  requireSourceValidation: boolean,
): Promise<void> {
  invariant(
    artifact.formulaId === runtime.formulaId &&
      artifact.sourceRevision === runtime.sourceRevision &&
      artifact.semanticHash === runtime.semanticHash &&
      artifact.runtimeDefaultProfileSha256 ===
        sha256(canonicalJson(effectiveRuntimeProfile(runtime))) &&
      /^[a-f0-9]{64}$/.test(artifact.recordPreviewProfileRevision) &&
      artifact.recordPreviewProfileRevision ===
        artifact.profile.profileRevision &&
      artifact.recordPreviewProfileSha256 ===
        sha256(canonicalJson(artifact.profile)),
    `record-preview-profile-row-binding-invalid:${runtime.formulaId}`,
  );
  const iterationCandidates = requireSourceValidation
    ? gates.profilePolicy.sourceValidationIterationCandidates
    : gates.profilePolicy.iterationCandidates;
  const candidates = candidateProfiles(runtime, iterationCandidates);
  invariant(
    Number.isInteger(artifact.selection.candidateOrdinal) &&
      artifact.selection.candidateOrdinal >= 1 &&
      artifact.selection.candidateOrdinal <= candidates.length,
    `record-preview-profile-candidate-ordinal-invalid:${runtime.formulaId}`,
  );
  const selected = candidates[artifact.selection.candidateOrdinal - 1]!;
  invariant(
    canonicalJson(selected.selection) === canonicalJson(artifact.selection) &&
      canonicalJson(selected.profile) === canonicalJson(artifact.profile),
    `record-preview-profile-selection-invalid:${runtime.formulaId}`,
  );
  const source = readFileSync(join(runtimeRoot, runtime.definitionPath), 'utf8');
  invariant(
    sha256(source) === runtime.sourceRevision,
    `record-preview-profile-source-invalid:${runtime.formulaId}`,
  );
  const compiled = await compilePublishedFormulaPluginV1({
    formulaId: runtime.formulaId,
    displayName: runtime.displayName,
    family: runtime.family,
    sourceRevision: runtime.sourceRevision,
    semanticHash: runtime.semanticHash,
    source,
  });
  invariant(
    compiled.ok,
    `record-preview-profile-compile-failed:${runtime.formulaId}`,
  );
  for (const previous of candidates.slice(
    0,
    artifact.selection.candidateOrdinal - 1,
  )) {
    const search = renderRecordPreviewV1(
      compiled.value.backend,
      previous.profile,
      gates.profilePolicy.searchWidth,
      gates.profilePolicy.searchHeight,
    );
    if (
      !viable(
        search,
        previous.profile.coloring.insideColoringId,
        gates.profilePolicy.searchMinimumUniqueColors,
      )
    )
      continue;
    const verification = renderRecordPreviewV1(
      compiled.value.backend,
      previous.profile,
      gates.profilePolicy.verificationWidth,
      gates.profilePolicy.verificationHeight,
    );
    if (
      !viable(
        verification,
        previous.profile.coloring.insideColoringId,
        gates.profilePolicy.verificationMinimumUniqueColors,
      )
    )
      continue;
    if (requireSourceValidation) {
      const sourcePreview = renderRecordPreviewV1(
        compiled.value.backend,
        previous.profile,
        gates.profilePolicy.sourceValidationWidth,
        gates.profilePolicy.sourceValidationHeight,
      );
      if (
        !viable(
          sourcePreview,
          previous.profile.coloring.insideColoringId,
          gates.profilePolicy.verificationMinimumUniqueColors,
        )
      )
        continue;
    }
    throw new Error(`record-preview-profile-not-first-pass:${runtime.formulaId}`);
  }
  const first = renderRecordPreviewV1(
    compiled.value.backend,
    artifact.profile,
    gates.profilePolicy.verificationWidth,
    gates.profilePolicy.verificationHeight,
  );
  const second = renderRecordPreviewV1(
    compiled.value.backend,
    artifact.profile,
    gates.profilePolicy.verificationWidth,
    gates.profilePolicy.verificationHeight,
  );
  invariant(
    viable(
      first,
      artifact.profile.coloring.insideColoringId,
      gates.profilePolicy.verificationMinimumUniqueColors,
    ) &&
      Buffer.from(first.rgba).equals(Buffer.from(second.rgba)) &&
      canonicalJson(probeMetrics(first)) ===
        canonicalJson(probeMetrics(second)) &&
      canonicalJson(probeMetrics(first)) ===
        canonicalJson(artifact.verification),
    `record-preview-profile-verification-invalid:${runtime.formulaId}`,
  );
  if (requireSourceValidation) {
    const sourcePreview = renderRecordPreviewV1(
      compiled.value.backend,
      artifact.profile,
      gates.profilePolicy.sourceValidationWidth,
      gates.profilePolicy.sourceValidationHeight,
    );
    invariant(
      viable(
        sourcePreview,
        artifact.profile.coloring.insideColoringId,
        gates.profilePolicy.verificationMinimumUniqueColors,
      ) &&
        canonicalJson(probeMetrics(sourcePreview)) ===
          canonicalJson(artifact.sourceValidation),
      `record-preview-profile-source-validation-invalid:${runtime.formulaId}`,
    );
  } else {
    invariant(
      artifact.sourceValidation === null,
      `record-preview-profile-source-validation-unexpected:${runtime.formulaId}`,
    );
  }
}

async function main(): Promise<void> {
  invariant(existsSync(artifactPath), 'record-preview-profile-artifact-missing');
  invariant(
    gates.schema === 'fractalpark-formula-record-preview-gates/v1' &&
      gates.revision === 7 &&
      gates.publishedCount === 534 &&
      gates.renderer.iterationCap === 16 &&
      gates.profilePolicy.schema ===
        'fractalpark-record-preview-profile-policy/v1' &&
      gates.profilePolicy.revision === 6 &&
      gates.profilePolicy.iterationCap === 16 &&
      canonicalJson(gates.profilePolicy.iterationCandidates) ===
        canonicalJson([16, 8, 4, 2]) &&
      canonicalJson(gates.profilePolicy.sourceValidationIterationCandidates) ===
        canonicalJson([2, 4, 8, 16]) &&
      gates.profilePolicy.searchWidth === 16 &&
      gates.profilePolicy.searchHeight === 10 &&
      gates.profilePolicy.verificationWidth === 48 &&
      gates.profilePolicy.verificationHeight === 30 &&
      gates.profilePolicy.sourceValidationWidth === 400 &&
      gates.profilePolicy.sourceValidationHeight === 250 &&
      gates.profilePolicy.sourceValidationTrigger ===
        'legacy-non-finite-pixels' &&
      gates.profilePolicy.verificationRenders === 2 &&
      gates.profilePolicy.searchMinimumUniqueColors === 3 &&
      gates.profilePolicy.verificationMinimumUniqueColors === 4 &&
      gates.profilePolicy.maximumNonFiniteFraction === 0 &&
      gates.profilePolicy.minimumEscapedFractionForBlack === 0.05 &&
      canonicalJson(gates.profilePolicy.strategies) ===
        canonicalJson([
          'runtime-black',
          'runtime-orbit-average',
          'bounded-black',
          'bounded-orbit-average',
        ]) &&
      canonicalJson(gates.profilePolicy.insideColoringIds) ===
        canonicalJson(['black', 'record-preview-orbit-average-v1']) &&
      gates.profilePolicy.runtimeParameterCandidateId === 'defaults' &&
      gates.profilePolicy.runtimeViewCandidateId === 'effective-default' &&
      gates.profilePolicy.parameterSlotOrder === 'runtime-descriptor-order' &&
      gates.profilePolicy.deduplicationRule ===
        'canonical-profile-input-first-occurrence' &&
      gates.profilePolicy.selectionRule ===
        'first-search-pass-then-verification-pass-then-risk-source-pass' &&
      canonicalJson(gates.profilePolicy.parameterStrategies) ===
        canonicalJson([
          'defaults',
          'single-slot',
          'same-type-all-slots',
          'complex-function-cartesian',
        ]),
    'record-preview-profile-gates-invalid',
  );
  const raw = JSON.parse(readFileSync(artifactPath, 'utf8')) as unknown;
  invariant(isRecord(raw), 'record-preview-profile-artifact-invalid');
  const unsigned = { ...raw };
  delete unsigned.contentHash;
  invariant(
    raw.schema === 'fractalpark-formula-record-preview-profiles/v1' &&
      raw.revision === 1 &&
      raw.status === 'ready' &&
      raw.rowCount === gates.publishedCount &&
      typeof raw.contentHash === 'string' &&
      raw.contentHash === sha256(canonicalJson(unsigned)) &&
      raw.policySha256 === sha256(canonicalJson(gates.profilePolicy)) &&
      canonicalJson(raw.sourceBindings) ===
        canonicalJson(expectedSourceBindings()) &&
      Array.isArray(raw.rows) &&
      raw.rows.length === gates.publishedCount &&
      isRecord(raw.summary),
    'record-preview-profile-artifact-invalid',
  );
  const artifactRows = raw.rows as unknown as ArtifactRow[];
  const sortedRuntime = [...runtimeRows].sort((left, right) =>
    left.formulaId.localeCompare(right.formulaId),
  );
  const legacyById = new Map(
    legacyRows.map((row) => [row.formulaId, row.anomalies]),
  );
  invariant(
    sortedRuntime.length === gates.publishedCount &&
      new Set(sortedRuntime.map((row) => row.formulaId)).size ===
        gates.publishedCount &&
      new Set(artifactRows.map((row) => row.formulaId)).size ===
        gates.publishedCount &&
      artifactRows.every(
        (row, index) => row.formulaId === sortedRuntime[index]!.formulaId,
      ),
    'record-preview-profile-exact-set-invalid',
  );
  const strategyCounts: Record<Strategy, number> = {
    'runtime-black': 0,
    'bounded-black': 0,
    'runtime-orbit-average': 0,
    'bounded-orbit-average': 0,
  };
  let maximumCandidateOrdinal = 0;
  let sourceValidationRows = 0;
  for (const [index, runtime] of sortedRuntime.entries()) {
    const row = artifactRows[index]!;
    const legacyAnomalies = legacyById.get(runtime.formulaId)!;
    const requireSourceValidation = legacyAnomalies.includes(
      'non-finite-pixels',
    );
    invariant(
      canonicalJson(row.legacyPreviewAnomalies) ===
        canonicalJson(legacyAnomalies),
      `record-preview-profile-legacy-binding-invalid:${runtime.formulaId}`,
    );
    await verifyRow(runtime, row, requireSourceValidation);
    if (requireSourceValidation) sourceValidationRows += 1;
    strategyCounts[row.selection.strategy] += 1;
    maximumCandidateOrdinal = Math.max(
      maximumCandidateOrdinal,
      row.selection.candidateOrdinal,
    );
    if ((index + 1) % 25 === 0 || index + 1 === sortedRuntime.length) {
      console.log(
        `[record-preview:profiles:verify] ${String(index + 1)}/${String(sortedRuntime.length)}`,
      );
    }
  }
  const expectedSummary = {
    strategyCounts,
    maximumCandidateOrdinal,
    legacyFlatRows: legacyRows.filter((row) =>
      row.anomalies.includes('flat-preview'),
    ).length,
    legacyDiagnosticRows: legacyRows.filter(
      (row) => row.anomalies.length > 0,
    ).length,
    sourceValidationRows,
    orbitAverageRows:
      strategyCounts['runtime-orbit-average'] +
      strategyCounts['bounded-orbit-average'],
    verificationRendersPerSelectedProfile:
      gates.profilePolicy.verificationRenders,
    determinismVerifiedRows: artifactRows.length,
  };
  invariant(
    canonicalJson(raw.summary) === canonicalJson(expectedSummary),
    'record-preview-profile-summary-invalid',
  );
  console.log(
    `[record-preview:profiles:verify] PASS: ${String(artifactRows.length)} exact Profiles`,
  );
}

void main().catch((error) => {
  console.error(
    `[record-preview:profiles:verify] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
