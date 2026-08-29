import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import activationAsset from '../resources/formula-library/v1/julia-runtime-activation.v1.json';
import gatesAsset from '../resources/formula-library/v1/record-preview-gates.v1.json';
import legacyPreviewManifestAsset from '../public/formula-library/v1/previews/manifest.json';
import runtimeIndexAsset from '../public/formula-library/v1/runtime/published/index.json';
import { resolveActivatedPublishedFormulaDefaultProfileV1 } from '../src/engine/formulas/v1/julia-runtime-activation-v1';
import { compilePublishedFormulaPluginV1 } from '../src/engine/formulas/v1/published-adapter';
import { renderRecordPreviewV1 } from '../src/engine/formulas/v1/record-preview-renderer';
import type { PublishedFormulaRuntimeIndexRowV1 } from '../src/engine/formulas/v1/published-runtime';
import type { FormulaProfileV1 } from '../src/engine/formulas/v1/types';

const root = process.cwd();
const outputPath = join(
  root,
  'resources/formula-library/v1/record-preview-profiles.v1.json',
);
const runtimeRoot = join(root, 'public/formula-library/v1/runtime/published');
const generatorPath = 'scripts/generate-formula-record-preview-profiles.ts';
const sourcePaths = [
  'resources/formula-library/v1/record-preview-gates.v1.json',
  'public/formula-library/v1/runtime/published/index.json',
  'public/formula-library/v1/previews/manifest.json',
  'resources/formula-library/v1/julia-runtime-activation.v1.json',
  generatorPath,
  'src/engine/formulas/v1/published-adapter.ts',
  'src/engine/formulas/v1/julia-runtime-activation-v1.ts',
  'src/engine/formulas/v1/record-preview-renderer.ts',
  'src/engine/frm/v1-backend.ts',
  'package-lock.json',
] as const;

interface ViewCandidate {
  id: string;
  mode: 'parameter-plane' | 'julia';
  center: readonly [number, number];
  zoom: number;
  juliaC?: readonly [number, number];
}

interface ProfilePolicy {
  schema: 'fractalpark-record-preview-profile-policy/v1';
  revision: 6;
  iterationCap: 16;
  iterationCandidates: readonly [16, 8, 4, 2];
  sourceValidationIterationCandidates: readonly [2, 4, 8, 16];
  searchWidth: number;
  searchHeight: number;
  verificationWidth: number;
  verificationHeight: number;
  sourceValidationWidth: 400;
  sourceValidationHeight: 250;
  sourceValidationTrigger: 'legacy-non-finite-pixels';
  verificationRenders: 2;
  searchMinimumUniqueColors: number;
  verificationMinimumUniqueColors: number;
  maximumNonFiniteFraction: number;
  minimumEscapedFractionForBlack: number;
  strategies: readonly [
    'runtime-black',
    'runtime-orbit-average',
    'bounded-black',
    'bounded-orbit-average',
  ];
  insideColoringIds: readonly [
    'black',
    'record-preview-orbit-average-v1',
  ];
  runtimeParameterCandidateId: 'defaults';
  runtimeViewCandidateId: 'effective-default';
  parameterSlotOrder: 'runtime-descriptor-order';
  deduplicationRule: 'canonical-profile-input-first-occurrence';
  selectionRule: 'first-search-pass-then-verification-pass-then-risk-source-pass';
  parameterStrategies: readonly [
    'defaults',
    'single-slot',
    'same-type-all-slots',
    'complex-function-cartesian',
  ];
  realValues: readonly number[];
  complexValues: readonly (readonly [number, number])[];
  functionValues: readonly string[];
  viewCandidates: readonly ViewCandidate[];
}

interface Gates {
  schema: 'fractalpark-formula-record-preview-gates/v1';
  revision: 7;
  publishedCount: 534;
  renderer: { iterationCap: 16 };
  profilePolicy: ProfilePolicy;
}

interface ParameterCandidate {
  id: string;
  parameters: FormulaProfileV1['parameters'];
}

interface Selection {
  strategy:
    | 'runtime-black'
    | 'bounded-black'
    | 'runtime-orbit-average'
    | 'bounded-orbit-average';
  candidateOrdinal: number;
  iterationCandidate: 16 | 8 | 4 | 2;
  parameterCandidateId: string;
  viewCandidateId: string;
}

interface ProbeMetrics {
  width: number;
  height: number;
  escapedPixels: number;
  interiorPixels: number;
  nonFinitePixels: number;
  uniqueColors: number;
  rawRgbaSha256: string;
}

interface SelectedCandidate {
  selection: Selection;
  profile: FormulaProfileV1;
  metrics: ProbeMetrics;
  sourceMetrics: ProbeMetrics | null;
}

type JsonRecord = Record<string, unknown>;

const gates = gatesAsset as unknown as Gates;
const runtimeRows = (
  runtimeIndexAsset as unknown as { rows: PublishedFormulaRuntimeIndexRowV1[] }
).rows;
const legacyRows = (
  legacyPreviewManifestAsset as unknown as {
    rows: Array<{
      formulaId: string;
      anomalies: string[];
    }>;
  }
).rows;

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
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

function sourceBindings(): Record<string, string> {
  return Object.fromEntries(
    sourcePaths.map((path) => [path, sha256(readFileSync(join(root, path)))]),
  );
}

function validatePolicy(): void {
  const policy = gates.profilePolicy;
  invariant(
    gates.schema === 'fractalpark-formula-record-preview-gates/v1' &&
      gates.revision === 7 &&
      gates.publishedCount === 534 &&
      gates.renderer.iterationCap === 16 &&
      policy.schema === 'fractalpark-record-preview-profile-policy/v1' &&
      policy.revision === 6 &&
      policy.iterationCap === 16 &&
      canonicalJson(policy.iterationCandidates) ===
        canonicalJson([16, 8, 4, 2]) &&
      canonicalJson(policy.sourceValidationIterationCandidates) ===
        canonicalJson([2, 4, 8, 16]) &&
      policy.searchWidth === 16 &&
      policy.searchHeight === 10 &&
      policy.verificationWidth === 48 &&
      policy.verificationHeight === 30 &&
      policy.sourceValidationWidth === 400 &&
      policy.sourceValidationHeight === 250 &&
      policy.sourceValidationTrigger === 'legacy-non-finite-pixels' &&
      policy.verificationRenders === 2 &&
      policy.searchMinimumUniqueColors === 3 &&
      policy.verificationMinimumUniqueColors === 4 &&
      policy.maximumNonFiniteFraction === 0 &&
      policy.minimumEscapedFractionForBlack === 0.05 &&
      canonicalJson(policy.strategies) ===
        canonicalJson([
          'runtime-black',
          'runtime-orbit-average',
          'bounded-black',
          'bounded-orbit-average',
        ]) &&
      canonicalJson(policy.insideColoringIds) ===
        canonicalJson(['black', 'record-preview-orbit-average-v1']) &&
      policy.runtimeParameterCandidateId === 'defaults' &&
      policy.runtimeViewCandidateId === 'effective-default' &&
      policy.parameterSlotOrder === 'runtime-descriptor-order' &&
      policy.deduplicationRule ===
        'canonical-profile-input-first-occurrence' &&
      policy.selectionRule ===
        'first-search-pass-then-verification-pass-then-risk-source-pass' &&
      canonicalJson(policy.parameterStrategies) ===
        canonicalJson([
          'defaults',
          'single-slot',
          'same-type-all-slots',
          'complex-function-cartesian',
        ]) &&
      policy.realValues.length > 0 &&
      policy.complexValues.length > 0 &&
      policy.functionValues.length > 0 &&
      policy.viewCandidates.length > 0 &&
      runtimeRows.length === gates.publishedCount &&
      legacyRows.length === gates.publishedCount,
    'record-preview-profile-policy-invalid',
  );
  const viewIds = new Set<string>();
  for (const view of policy.viewCandidates) {
    invariant(
      !viewIds.has(view.id) &&
        (view.mode === 'parameter-plane' || view.mode === 'julia') &&
        Array.isArray(view.center) &&
        view.center.length === 2 &&
        view.center.every(Number.isFinite) &&
        Number.isFinite(view.zoom) &&
        view.zoom > 0 &&
        (view.mode === 'parameter-plane' ||
          (Array.isArray(view.juliaC) &&
            view.juliaC.length === 2 &&
            view.juliaC.every(Number.isFinite))),
      'record-preview-profile-view-invalid',
    );
    viewIds.add(view.id);
  }
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
  const effective = resolveActivatedPublishedFormulaDefaultProfileV1(row);
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
    strategy: Selection['strategy'],
    parameter: ParameterCandidate,
    view: ViewCandidate,
    iterations: Selection['iterationCandidate'],
    insideColoringId: 'black' | 'record-preview-orbit-average-v1',
  ): void => {
    const nextOrdinal = candidateOrdinal + 1;
    const selection: Selection = {
      strategy,
      candidateOrdinal: nextOrdinal,
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
    candidateOrdinal = nextOrdinal;
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

function metrics(
  preview: ReturnType<typeof renderRecordPreviewV1>,
): ProbeMetrics {
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

async function selectProfile(
  row: PublishedFormulaRuntimeIndexRowV1,
  requireSourceValidation: boolean,
): Promise<SelectedCandidate> {
  const source = readFileSync(join(runtimeRoot, row.definitionPath), 'utf8');
  invariant(
    sha256(source) === row.sourceRevision,
    `record-preview-profile-source-revision-mismatch:${row.formulaId}`,
  );
  const compiled = await compilePublishedFormulaPluginV1({
    formulaId: row.formulaId,
    displayName: row.displayName,
    family: row.family,
    sourceRevision: row.sourceRevision,
    semanticHash: row.semanticHash,
    source,
  });
  invariant(
    compiled.ok,
    `record-preview-profile-compile-failed:${row.formulaId}`,
  );
  const iterationCandidates = requireSourceValidation
    ? gates.profilePolicy.sourceValidationIterationCandidates
    : gates.profilePolicy.iterationCandidates;
  for (const candidate of candidateProfiles(row, iterationCandidates)) {
    const search = renderRecordPreviewV1(
      compiled.value.backend,
      candidate.profile,
      gates.profilePolicy.searchWidth,
      gates.profilePolicy.searchHeight,
    );
    if (
      !viable(
        search,
        candidate.profile.coloring.insideColoringId,
        gates.profilePolicy.searchMinimumUniqueColors,
      )
    )
      continue;
    const first = renderRecordPreviewV1(
      compiled.value.backend,
      candidate.profile,
      gates.profilePolicy.verificationWidth,
      gates.profilePolicy.verificationHeight,
    );
    if (
      !viable(
        first,
        candidate.profile.coloring.insideColoringId,
        gates.profilePolicy.verificationMinimumUniqueColors,
      )
    )
      continue;
    const second = renderRecordPreviewV1(
      compiled.value.backend,
      candidate.profile,
      gates.profilePolicy.verificationWidth,
      gates.profilePolicy.verificationHeight,
    );
    invariant(
      Buffer.from(first.rgba).equals(Buffer.from(second.rgba)) &&
        canonicalJson(metrics(first)) === canonicalJson(metrics(second)),
      `record-preview-profile-nondeterministic:${row.formulaId}`,
    );
    let sourceMetrics: ProbeMetrics | null = null;
    if (requireSourceValidation) {
      if (
        candidate.selection.candidateOrdinal === 1 ||
        candidate.selection.candidateOrdinal % 25 === 0
      ) {
        console.log(
          `[record-preview:profiles:source] ${row.formulaId} candidate ${String(candidate.selection.candidateOrdinal)}`,
        );
      }
      const sourcePreview = renderRecordPreviewV1(
        compiled.value.backend,
        candidate.profile,
        gates.profilePolicy.sourceValidationWidth,
        gates.profilePolicy.sourceValidationHeight,
      );
      if (
        !viable(
          sourcePreview,
          candidate.profile.coloring.insideColoringId,
          gates.profilePolicy.verificationMinimumUniqueColors,
        )
      )
        continue;
      sourceMetrics = metrics(sourcePreview);
    }
    return {
      selection: candidate.selection,
      profile: candidate.profile,
      metrics: metrics(first),
      sourceMetrics,
    };
  }
  throw new Error(`record-preview-profile-unresolved:${row.formulaId}`);
}

async function main(): Promise<void> {
  validatePolicy();
  invariant(
    (activationAsset as { schema?: unknown }).schema ===
      'fractalpark-julia-runtime-activation/v1',
    'record-preview-profile-activation-invalid',
  );
  const legacyById = new Map(
    legacyRows.map((row) => [row.formulaId, row]),
  );
  const sortedRows = [...runtimeRows].sort((left, right) =>
    left.formulaId.localeCompare(right.formulaId),
  );
  invariant(
    new Set(sortedRows.map((row) => row.formulaId)).size ===
      gates.publishedCount &&
      new Set(legacyRows.map((row) => row.formulaId)).size ===
        gates.publishedCount &&
      sortedRows.every((row) => legacyById.has(row.formulaId)),
    'record-preview-profile-exact-set-invalid',
  );
  const rows: JsonRecord[] = [];
  const strategyCounts: Record<Selection['strategy'], number> = {
    'runtime-black': 0,
    'bounded-black': 0,
    'runtime-orbit-average': 0,
    'bounded-orbit-average': 0,
  };
  let maximumCandidateOrdinal = 0;
  let sourceValidationRows = 0;
  for (const [index, row] of sortedRows.entries()) {
    const legacy = legacyById.get(row.formulaId)!;
    const requireSourceValidation = legacy.anomalies.includes(
      'non-finite-pixels',
    );
    const selected = await selectProfile(row, requireSourceValidation);
    if (requireSourceValidation) sourceValidationRows += 1;
    strategyCounts[selected.selection.strategy] += 1;
    maximumCandidateOrdinal = Math.max(
      maximumCandidateOrdinal,
      selected.selection.candidateOrdinal,
    );
    const runtimeDefaultProfileSha256 = sha256(
      canonicalJson(resolveActivatedPublishedFormulaDefaultProfileV1(row)),
    );
    const recordPreviewProfileSha256 = sha256(
      canonicalJson(selected.profile),
    );
    rows.push({
      formulaId: row.formulaId,
      sourceRevision: row.sourceRevision,
      semanticHash: row.semanticHash,
      runtimeDefaultProfileSha256,
      recordPreviewProfileRevision: selected.profile.profileRevision,
      recordPreviewProfileSha256,
      selection: selected.selection,
      profile: selected.profile,
      verification: selected.metrics,
      sourceValidation: selected.sourceMetrics,
      legacyPreviewAnomalies: legacy.anomalies,
    });
    if ((index + 1) % 25 === 0 || index + 1 === sortedRows.length) {
      console.log(
        `[record-preview:profiles] ${String(index + 1)}/${String(sortedRows.length)}`,
      );
    }
  }
  const legacyFlatRows = legacyRows.filter((row) =>
    row.anomalies.includes('flat-preview'),
  ).length;
  const legacyDiagnosticRows = legacyRows.filter(
    (row) => row.anomalies.length > 0,
  ).length;
  const artifactWithoutHash = {
    schema: 'fractalpark-formula-record-preview-profiles/v1',
    revision: 1,
    status: 'ready',
    sourceBindings: sourceBindings(),
    policySha256: sha256(canonicalJson(gates.profilePolicy)),
    rowCount: rows.length,
    summary: {
      strategyCounts,
      maximumCandidateOrdinal,
      legacyFlatRows,
      legacyDiagnosticRows,
      sourceValidationRows,
      orbitAverageRows:
        strategyCounts['runtime-orbit-average'] +
        strategyCounts['bounded-orbit-average'],
      verificationRendersPerSelectedProfile:
        gates.profilePolicy.verificationRenders,
      determinismVerifiedRows: rows.length,
    },
    rows,
  };
  const artifact = {
    ...artifactWithoutHash,
    contentHash: sha256(canonicalJson(artifactWithoutHash)),
  };
  const bytes = `${JSON.stringify(artifact, null, 2)}\n`;
  if (process.argv.includes('--write')) {
    const temporaryPath = `${outputPath}.tmp-${String(process.pid)}`;
    rmSync(temporaryPath, { force: true });
    try {
      writeFileSync(temporaryPath, bytes, { flag: 'wx' });
      renameSync(temporaryPath, outputPath);
    } finally {
      rmSync(temporaryPath, { force: true });
    }
  } else {
    invariant(
      existsSync(outputPath) && readFileSync(outputPath, 'utf8') === bytes,
      'record-preview-profile-artifact-drift',
    );
  }
  console.log(
    `[record-preview:profiles] PASS: ${String(rows.length)} exact Profiles, ${String(artifactWithoutHash.summary.orbitAverageRows)} orbit-average`,
  );
}

void main().catch((error) => {
  console.error(
    `[record-preview:profiles] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
