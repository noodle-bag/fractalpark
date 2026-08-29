import { createHash } from 'node:crypto';
import {
  existsSync,
  realpathSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

import { chromium } from 'playwright';

import { compilePublishedFormulaPluginV1 } from '../src/engine/formulas/v1/published-adapter';
import { renderRecordPreviewV1 } from '../src/engine/formulas/v1/record-preview-renderer';
import type { PublishedFormulaRuntimeIndexRowV1 } from '../src/engine/formulas/v1/published-runtime';
import type { FormulaProfileV1 } from '../src/engine/formulas/v1/types';

const root = process.cwd();
const parseJsonFile = (path: string): unknown =>
  JSON.parse(readFileSync(join(root, path), 'utf8')) as unknown;
const activationAsset = parseJsonFile(
  'resources/formula-library/v1/julia-runtime-activation.v1.json',
);
const acceptedDeviationsAsset = parseJsonFile(
  'resources/formula-library/v1/record-preview-accepted-deviations.v1.json',
);
const gatesAsset = parseJsonFile(
  'resources/formula-library/v1/record-preview-gates.v1.json',
);
const recordPreviewProfilesAsset = parseJsonFile(
  'resources/formula-library/v1/record-preview-profiles.v1.json',
);
const runtimeIndexAsset = parseJsonFile(
  'public/formula-library/v1/runtime/published/index.json',
);
const publishedRuntimeRoot = realpathSync(
  join(root, 'public/formula-library/v1/runtime/published'),
);
const outputRoot = join(root, 'public/formula-library/v1/record-previews');
const manifestPath = join(outputRoot, 'manifest.json');
const preflightPath = join(
  root,
  'resources/formula-library/v1/record-preview-preflight.v1.json',
);
const qualityScanArtifactPath =
  'resources/formula-library/v1/record-preview-quality-scan.v1.json';
const qualityScanPath = join(root, qualityScanArtifactPath);
const scanSourcePaths = [
  'resources/formula-library/v1/record-preview-gates.v1.json',
  'public/formula-library/v1/runtime/published/index.json',
  'resources/formula-library/v1/julia-runtime-activation.v1.json',
  'resources/formula-library/v1/record-preview-profiles.v1.json',
  'scripts/generate-formula-record-masters.ts',
  'scripts/run-formula-record-masters.ts',
  'src/engine/formulas/v1/published-adapter.ts',
  'src/engine/formulas/v1/julia-runtime-activation-v1.ts',
  'src/engine/formulas/v1/record-preview-renderer.ts',
  'src/engine/frm/v1-backend.ts',
  'package-lock.json',
] as const;
const sourcePaths = [
  ...scanSourcePaths.slice(0, 4),
  qualityScanArtifactPath,
  'resources/formula-library/v1/record-preview-accepted-deviations.v1.json',
  ...scanSourcePaths.slice(4),
] as const;

type JsonRecord = Record<string, unknown>;

interface Gates {
  schema: string;
  revision: number;
  publishedCount: number;
  image: {
    format: string;
    width: number;
    height: number;

    quality: number;
    sampleWidth: number;
    sampleHeight: number;
  };
  renderer: {
    engine: string;
    sourceWidth: 400;
    sourceHeight: 250;
    iterationCap: 16;
    scaler: string;
    encoder: string;
    workerConcurrency: 3;
    determinismRenders: number;
  };
  profilePolicy: {
    schema: string;
    revision: number;
    iterationCap: 16;
    iterationCandidates: Array<16 | 8 | 4 | 2>;
    sourceValidationIterationCandidates: Array<2 | 4 | 8 | 16>;
    sourceValidationWidth: number;
    sourceValidationHeight: number;
    sourceValidationTrigger: string;
    verificationRenders: number;
    searchMinimumUniqueColors: number;
    verificationMinimumUniqueColors: number;
    maximumNonFiniteFraction: number;
    minimumEscapedFractionForBlack: number;
  };
  visualBudgets: {
    minimumLuminanceRange: number;
    minimumDistinctLuminanceValues: number;
    minimumEdgeEnergy: number;
    minimumOpaqueFraction: number;

  };
  resourceBudgets: {
    maximumImageBytes: number;
    maximumTotalBytes: number;
    maximumPreflightWallMs: number;
    maximumFullGenerationWallMs: number;
    maximumProcessTreeRssBytes: number;
  };
  preflightRows: Array<{ lane: string; formulaId: string; family: string }>;
}

interface RuntimeRow {
  formulaId: string;
  displayName: string;
  family: string;
  definitionPath: string;
  sourceRevision: string;
  semanticHash: string;
  profile: JsonRecord & { mode: string };
}

interface ProfileRow {
  formulaId: string;
  sourceRevision: string;
  semanticHash: string;
  runtimeDefaultProfileSha256: string;
  recordPreviewProfileRevision: string;
  recordPreviewProfileSha256: string;
  selection: {
    strategy: string;
    candidateOrdinal: number;
    iterationCandidate: 16 | 8 | 4 | 2;
    parameterCandidateId: string;
    viewCandidateId: string;
  };
  profile: JsonRecord & {
    formulaId: string;
    sourceRevision: string;
    profileRevision: string;
    iterations: number;
    coloring: JsonRecord & { insideColoringId: string };
  };
}

interface ManifestRow {
  formulaId: string;
  sourceRevision: string;
  semanticHash: string;
  runtimeDefaultProfileSha256: string;
  recordPreviewProfileRevision: string;
  recordPreviewProfileSha256: string;
  profileSelection: ProfileRow['selection'];
  assetRevision: string;
  file: string;
  webpSha256: string;
  width: number;
  height: number;
  bytes: number;
  sourceMetrics: {
    escapedPixels: number;
    interiorPixels: number;
    nonFinitePixels: number;
    uniqueColors: number;
    rawRgbaSha256: string;
  };
  pixelFingerprintSha256: string;
  perceptualHash: string;
  metrics: {
    luminanceRange: number;
    distinctLuminanceValues: number;
    edgeEnergy: number;
    opaqueFraction: number;
    darkFraction: number;
    lightFraction: number;

  };
  acceptedDeviations: Array<'source-non-finite' | 'visual-integrity'>;
}

interface SourceRender {
  rgba: Uint8Array;
  metrics: ManifestRow['sourceMetrics'];
}

interface RenderWorkerRequest {
  jobId: number;
  row: RuntimeRow;
}

type RenderWorkerResponse =
  | {
      ok: true;
      jobId: number;
      rgba: Uint8Array;
      metrics: SourceRender['metrics'];
    }
  | { ok: false; jobId: number; error: string };

interface QueuedRender {
  row: RuntimeRow;
  resolve: (value: SourceRender) => void;
  reject: (error: Error) => void;
}

interface BusyRender extends QueuedRender {
  jobId: number;
}

interface AcceptedDeviations {
  schema: string;
  revision: number;
  status: string;
  gateRevision: number;
  profileArtifactContentHash: string;
  scanReportContentHash: string;
  scanRowCount: number;
  acceptedCount: number;
  rows: Array<{
    formulaId: string;
    category: 'source-non-finite' | 'visual-integrity';
    observedError: string;
  }>;
  contentHash: string;
}

interface QualityScan {
  schema: string;
  revision: number;
  status: string;
  sourceBindings: Record<string, string>;
  profileArtifactContentHash: string;
  rowCount: number;
  passedCount: number;
  failureCount: number;
  failures: Array<{ formulaId: string; error: string }>;
  contentHash: string;
}

const gates = gatesAsset as unknown as Gates;
const recordPreviewProfiles = recordPreviewProfilesAsset as unknown as {
  schema: string;
  revision: number;
  status: string;
  policySha256: string;
  rowCount: number;
  summary: {
    determinismVerifiedRows: number;
    verificationRendersPerSelectedProfile: number;
  };
  sourceBindings: Record<string, string>;
  rows: ProfileRow[];
  contentHash: string;
};
const recordPreviewProfileById = new Map(
  recordPreviewProfiles.rows.map((row) => [row.formulaId, row]),
);
const acceptedDeviations =
  acceptedDeviationsAsset as unknown as AcceptedDeviations;
const acceptedDeviationById = new Map(
  acceptedDeviations.rows.map((row) => [row.formulaId, row]),
);
const runtimeRows = (runtimeIndexAsset as unknown as { rows: RuntimeRow[] }).rows;
const activationRows = (
  activationAsset as unknown as {
    rows: Array<{ formulaId: string; sourceRevision: string }>;
  }
).rows;
const activationPairs = new Set(
  activationRows.map((row) => `${row.formulaId}:${row.sourceRevision}`),
);

function fail(code: string): never {
  throw new Error(code);
}

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) fail(code);
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
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

function bindingsFor(paths: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    paths.map((path) => [path, sha256(readFileSync(join(root, path)))]),
  );
}

function expectedBindings(): Record<string, string> {
  return bindingsFor(sourcePaths);
}

function expectedScanBindings(): Record<string, string> {
  return bindingsFor(scanSourcePaths);
}

function effectiveProfile(row: RuntimeRow): JsonRecord {
  if (
    row.profile.mode !== 'julia' ||
    activationPairs.has(`${row.formulaId}:${row.sourceRevision}`)
  ) {
    return row.profile;
  }
  const downgraded: JsonRecord = {
    schema: row.profile.schema,
    quality: row.profile.quality,
    mode: 'parameter-plane',
    center: row.profile.center,
    zoom: row.profile.zoom,
    rotation: row.profile.rotation,
    iterations: row.profile.iterations,
  };
  if (row.profile.probe) downgraded.probe = row.profile.probe;
  return downgraded;
}

function expectedAssetRevision(
  row: RuntimeRow,
  encoderVersion: string,
): string {
  const profile = recordPreviewProfileById.get(row.formulaId);
  invariant(profile, `record-preview-profile-missing:${row.formulaId}`);
  return sha256(
    canonicalJson({
      formulaId: row.formulaId,
      sourceRevision: row.sourceRevision,
      semanticHash: row.semanticHash,
      runtimeDefaultProfileSha256: profile.runtimeDefaultProfileSha256,
      recordPreviewProfileRevision: profile.recordPreviewProfileRevision,
      recordPreviewProfileSha256: profile.recordPreviewProfileSha256,
      profileSelection: profile.selection,
      encoderVersion,
      image: gates.image,
      renderer: gates.renderer,
    }),
  ).slice(0, 16);
}

async function rerenderSource(row: RuntimeRow): Promise<SourceRender> {
  const definitionPath = realpathSync(
    resolve(publishedRuntimeRoot, row.definitionPath),
  );
  invariant(
    definitionPath.startsWith(`${publishedRuntimeRoot}${sep}`),
    `record-preview-definition-path-escape:${row.formulaId}`,
  );
  const source = readFileSync(definitionPath, 'utf8');
  invariant(
    sha256(source) === row.sourceRevision,
    `record-preview-source-revision-mismatch:${row.formulaId}`,
  );
  const compiled = await compilePublishedFormulaPluginV1({
    formulaId: row.formulaId,
    displayName: row.displayName,
    family: row.family as PublishedFormulaRuntimeIndexRowV1['family'],
    sourceRevision: row.sourceRevision,
    semanticHash: row.semanticHash,
    source,
  });
  invariant(
    compiled.ok,
    `record-preview-compile-failed:${row.formulaId}:${compiled.ok ? 'unknown' : compiled.code}`,
  );
  const selected = recordPreviewProfileById.get(row.formulaId);
  invariant(selected, `record-preview-profile-missing:${row.formulaId}`);
  const profile = selected.profile as unknown as FormulaProfileV1;
  const rendered = renderRecordPreviewV1(
    compiled.value.backend,
    {
      ...profile,
      iterations: Math.min(profile.iterations, gates.renderer.iterationCap),
    },
    gates.renderer.sourceWidth,
    gates.renderer.sourceHeight,
  );
  return {
    rgba: rendered.rgba,
    metrics: {
      escapedPixels: rendered.escapedPixels,
      interiorPixels: rendered.interiorPixels,
      nonFinitePixels: rendered.nonFinitePixels,
      uniqueColors: rendered.uniqueColors,
      rawRgbaSha256: sha256(Buffer.from(rendered.rgba)),
    },
  };
}

function startRenderWorker(): void {
  const port = parentPort;
  invariant(port, 'record-preview-verifier-worker-port-missing');
  port.on('message', (request: RenderWorkerRequest) => {
    void rerenderSource(request.row)
      .then((rendered) => {
        const response: RenderWorkerResponse = {
          ok: true,
          jobId: request.jobId,
          rgba: rendered.rgba,
          metrics: rendered.metrics,
        };
        port.postMessage(response, [rendered.rgba.buffer as ArrayBuffer]);
      })
      .catch((error: unknown) => {
        const response: RenderWorkerResponse = {
          ok: false,
          jobId: request.jobId,
          error:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : 'record-preview-verifier-worker-unknown-error',
        };
        port.postMessage(response);
      });
  });
}

class RenderWorkerPool {
  private readonly workers: Worker[] = [];
  private readonly queue: QueuedRender[] = [];
  private readonly busy = new Map<Worker, BusyRender>();
  private nextJobId = 1;
  private failed: Error | null = null;
  private closing = false;

  constructor(concurrency: number) {
    const bootstrap = `
      const { register } = require('tsx/cjs/api');
      register({ tsconfig: ${JSON.stringify(join(root, 'tsconfig.json'))} });
      require(${JSON.stringify(__filename)});
    `;
    for (let index = 0; index < concurrency; index += 1) {
      const worker = new Worker(bootstrap, {
        eval: true,
        workerData: { mode: 'formula-record-master-verifier-worker' },
      });
      worker.on('message', (response: RenderWorkerResponse) => {
        this.handleResponse(worker, response);
      });
      worker.on('error', (error) => {
        this.fail(error);
      });
      worker.on('exit', (code) => {
        if (!this.closing) {
          this.fail(
            new Error(`record-preview-verifier-worker-exit:${String(code)}`),
          );
        }
      });
      this.workers.push(worker);
    }
  }

  render(row: RuntimeRow): Promise<SourceRender> {
    if (this.failed) return Promise.reject(this.failed);
    return new Promise<SourceRender>((resolveRender, rejectRender) => {
      this.queue.push({ row, resolve: resolveRender, reject: rejectRender });
      this.dispatch();
    });
  }

  async close(): Promise<void> {
    this.closing = true;
    await Promise.all(this.workers.map(async (worker) => worker.terminate()));
  }

  private dispatch(): void {
    if (this.failed || this.closing) return;
    for (const worker of this.workers) {
      if (this.busy.has(worker)) continue;
      const queued = this.queue.shift();
      if (!queued) return;
      const busy: BusyRender = { ...queued, jobId: this.nextJobId };
      this.nextJobId += 1;
      this.busy.set(worker, busy);
      const request: RenderWorkerRequest = {
        jobId: busy.jobId,
        row: busy.row,
      };
      worker.postMessage(request);
    }
  }

  private handleResponse(
    worker: Worker,
    response: RenderWorkerResponse,
  ): void {
    const busy = this.busy.get(worker);
    if (!busy || busy.jobId !== response.jobId) {
      this.fail(new Error('record-preview-verifier-worker-response-mismatch'));
      return;
    }
    this.busy.delete(worker);
    if (response.ok) {
      busy.resolve({ rgba: response.rgba, metrics: response.metrics });
    } else {
      busy.reject(new Error(response.error));
    }
    this.dispatch();
  }

  private fail(error: Error): void {
    if (this.failed) return;
    this.failed = error;
    for (const queued of this.queue.splice(0)) queued.reject(error);
    for (const busy of this.busy.values()) busy.reject(error);
    this.busy.clear();
  }
}

function verifyRecordPreviewProfiles(): void {
  const unsigned = {
    ...(recordPreviewProfiles as unknown as Record<string, unknown>),
  };
  delete unsigned.contentHash;
  const sortedRuntime = [...runtimeRows].sort((left, right) =>
    left.formulaId.localeCompare(right.formulaId),
  );
  invariant(
    recordPreviewProfiles.schema ===
      'fractalpark-formula-record-preview-profiles/v1' &&
      recordPreviewProfiles.revision === 1 &&
      recordPreviewProfiles.status === 'ready' &&
      recordPreviewProfiles.rowCount === gates.publishedCount &&
      recordPreviewProfiles.rows.length === gates.publishedCount &&
      recordPreviewProfiles.summary.determinismVerifiedRows ===
        gates.publishedCount &&
      recordPreviewProfiles.summary.verificationRendersPerSelectedProfile ===
        gates.profilePolicy.verificationRenders &&
      recordPreviewProfileById.size === gates.publishedCount &&
      recordPreviewProfiles.contentHash === sha256(canonicalJson(unsigned)) &&
      recordPreviewProfiles.policySha256 ===
        sha256(canonicalJson(gates.profilePolicy)) &&
      recordPreviewProfiles.rows.every(
        (profile, index) => profile.formulaId === sortedRuntime[index]!.formulaId,
      ) &&
      Object.entries(recordPreviewProfiles.sourceBindings).every(
        ([path, digest]) =>
          existsSync(join(root, path)) && sha256(readFileSync(join(root, path))) === digest,
      ),
    'record-preview-profiles-invalid',
  );
  for (const runtime of runtimeRows) {
    const profile = recordPreviewProfileById.get(runtime.formulaId);
    invariant(
      profile !== undefined &&
        profile.sourceRevision === runtime.sourceRevision &&
        profile.semanticHash === runtime.semanticHash &&
        profile.runtimeDefaultProfileSha256 ===
          sha256(canonicalJson(effectiveProfile(runtime))) &&
        profile.recordPreviewProfileRevision ===
          profile.profile.profileRevision &&
        profile.recordPreviewProfileSha256 ===
          sha256(canonicalJson(profile.profile)) &&
        profile.profile.formulaId === runtime.formulaId &&
        profile.profile.sourceRevision === runtime.sourceRevision &&
        gates.profilePolicy.iterationCandidates.includes(profile.profile.iterations as 16 | 8 | 4 | 2) &&
        profile.profile.iterations === profile.selection.iterationCandidate,
      `record-preview-profile-row-invalid:${runtime.formulaId}`,
    );
  }
}

function verifyAcceptedDeviations(): void {
  const unsigned = {
    ...(acceptedDeviations as unknown as Record<string, unknown>),
  };
  delete unsigned.contentHash;
  const ids = acceptedDeviations.rows.map((row) => row.formulaId);
  const runtimeIds = new Set(runtimeRows.map((row) => row.formulaId));
  const visualCount = acceptedDeviations.rows.filter(
    (row) => row.category === 'visual-integrity',
  ).length;
  const sourceCount = acceptedDeviations.rows.filter(
    (row) => row.category === 'source-non-finite',
  ).length;
  invariant(
    acceptedDeviations.schema ===
      'fractalpark-formula-record-preview-accepted-deviations/v1' &&
      acceptedDeviations.revision === 1 &&
      acceptedDeviations.status === 'temporarily-accepted' &&
      acceptedDeviations.gateRevision === gates.revision &&
      acceptedDeviations.profileArtifactContentHash ===
        recordPreviewProfiles.contentHash &&
      /^[a-f0-9]{64}$/.test(acceptedDeviations.scanReportContentHash) &&
      acceptedDeviations.scanRowCount === gates.publishedCount &&
      acceptedDeviations.acceptedCount === 43 &&
      visualCount === 37 &&
      sourceCount === 6 &&
      acceptedDeviations.rows.length === acceptedDeviations.acceptedCount &&
      acceptedDeviationById.size === acceptedDeviations.acceptedCount &&
      canonicalJson(ids) === canonicalJson([...ids].sort()) &&
      acceptedDeviations.rows.every(
        (row) =>
          runtimeIds.has(row.formulaId) &&
          row.observedError.startsWith(
            row.category === 'source-non-finite'
              ? `record-preview-cpu-source-invalid:${row.formulaId}:`
              : `record-preview-visual-gate-failed:${row.formulaId}:`,
          ),
      ) &&
      acceptedDeviations.contentHash === sha256(canonicalJson(unsigned)),
    'record-preview-accepted-deviations-invalid',
  );

  invariant(existsSync(qualityScanPath), 'record-preview-quality-scan-missing');
  const scan = JSON.parse(readFileSync(qualityScanPath, 'utf8')) as QualityScan;
  const unsignedScan = {
    ...(scan as unknown as Record<string, unknown>),
  };
  delete unsignedScan.contentHash;
  const expectedFailures = acceptedDeviations.rows.map((row) => ({
    formulaId: row.formulaId,
    error: row.observedError,
  }));
  invariant(
    scan.schema === 'fractalpark-formula-record-preview-quality-scan/v1' &&
      scan.revision === 1 &&
      scan.status === 'fail' &&
      canonicalJson(scan.sourceBindings) === canonicalJson(expectedScanBindings()) &&
      scan.profileArtifactContentHash === recordPreviewProfiles.contentHash &&
      scan.rowCount === gates.publishedCount &&
      scan.passedCount === gates.publishedCount - acceptedDeviations.acceptedCount &&
      scan.failureCount === acceptedDeviations.acceptedCount &&
      scan.failures.length === scan.failureCount &&
      canonicalJson(scan.failures) === canonicalJson(expectedFailures) &&
      scan.contentHash === sha256(canonicalJson(unsignedScan)) &&
      acceptedDeviations.scanReportContentHash === scan.contentHash,
    'record-preview-quality-scan-invalid',
  );
}

function verifyEvidenceHash(value: JsonRecord, field: string, code: string): void {
  const stated = value[field];
  invariant(typeof stated === 'string' && /^[a-f0-9]{64}$/.test(stated), code);
  const unsigned = { ...value };
  delete unsigned[field];
  invariant(sha256(canonicalJson(unsigned)) === stated, code);
}

function verifyDeterminismCoverage(value: JsonRecord): void {
  const expectedIds = [...gates.preflightRows]
    .map((row) => row.formulaId)
    .sort((left, right) => left.localeCompare(right));
  invariant(
    value.profileArtifactContentHash === recordPreviewProfiles.contentHash &&
      value.profilePolicySha256 === recordPreviewProfiles.policySha256 &&
      value.acceptedDeviationPolicyContentHash === acceptedDeviations.contentHash &&
      value.acceptedDeviationPolicyRows === acceptedDeviations.acceptedCount &&
      value.profileDeterminismVerifiedRows === gates.publishedCount &&
      value.profileVerificationRenders ===
        gates.profilePolicy.verificationRenders &&
      value.sourceEncoderDeterminismRows === gates.preflightRows.length &&
      value.sourceEncoderDeterminismRenders ===
        gates.renderer.determinismRenders &&
      canonicalJson(value.sourceEncoderDeterminismFormulaIds) ===
        canonicalJson(expectedIds),
    'record-preview-determinism-coverage-invalid',
  );
}

function verifyPreflight(): void {
  invariant(existsSync(preflightPath), 'record-preview-preflight-missing');
  const raw = JSON.parse(readFileSync(preflightPath, 'utf8')) as unknown;
  invariant(isRecord(raw), 'record-preview-preflight-invalid');
  verifyEvidenceHash(raw, 'contentHash', 'record-preview-preflight-hash-invalid');
  invariant(
    raw.schema === 'fractalpark-formula-record-preview-preflight/v1' &&
      raw.revision === 1 &&
      raw.status === 'pass' &&
      raw.rowCount === 21 &&
      Array.isArray(raw.rows) &&
      raw.rows.length === 21 &&
      raw.acceptedDeviationRows === 0 &&
      canonicalJson(raw.sourceBindings) === canonicalJson(expectedBindings()) &&
      raw.renderer === gates.renderer.engine &&
      raw.encoder ===
        `${gates.renderer.encoder}-q${String(gates.image.quality)}` &&
      typeof raw.browserVersion === 'string' &&
      raw.browserVersion.length > 0 &&
      typeof raw.nodeVersion === 'string' &&
      raw.nodeVersion.length > 0 &&
      typeof raw.platform === 'string' &&
      raw.platform.length > 0 &&
      raw.sourceRenderCount ===
        gates.preflightRows.length * gates.renderer.determinismRenders &&
      typeof raw.wallMs === 'number' &&
      raw.wallMs <= gates.resourceBudgets.maximumPreflightWallMs &&
      typeof raw.peakProcessTreeRssBytes === 'number' &&
      raw.peakProcessTreeRssBytes <=
        gates.resourceBudgets.maximumProcessTreeRssBytes &&
      typeof raw.projectedTotalBytes === 'number' &&
      raw.projectedTotalBytes <= gates.resourceBudgets.maximumTotalBytes &&
      typeof raw.projectedWallMs === 'number' &&
      raw.projectedWallMs <=
        gates.resourceBudgets.maximumFullGenerationWallMs,
    'record-preview-preflight-invalid',
  );
  verifyDeterminismCoverage(raw);
  const expectedIds = [...gates.preflightRows]
    .map((row) => row.formulaId)
    .sort();
  const actualIds = (raw.rows as JsonRecord[])
    .map((row) => row.formulaId)
    .sort();
  invariant(
    canonicalJson(actualIds) === canonicalJson(expectedIds),
    'record-preview-preflight-set-invalid',
  );
}

function verifyManifest(): { manifest: JsonRecord; rows: ManifestRow[] } {
  invariant(existsSync(manifestPath), 'record-preview-manifest-missing');
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
  invariant(isRecord(raw), 'record-preview-manifest-invalid');
  verifyEvidenceHash(
    raw,
    'manifestContentHash',
    'record-preview-manifest-hash-invalid',
  );
  invariant(
    raw.schema === 'fractalpark-formula-record-preview-masters/v1' &&
      raw.revision === 1 &&
      raw.status === 'ready' &&
      raw.width === gates.image.width &&
      raw.height === gates.image.height &&
      raw.rowCount === gates.publishedCount &&
      Array.isArray(raw.rows) &&
      raw.rows.length === gates.publishedCount &&
      raw.acceptedDeviationRows === acceptedDeviations.acceptedCount &&
      canonicalJson(raw.sourceBindings) === canonicalJson(expectedBindings()) &&
      raw.renderer === gates.renderer.engine &&
      raw.encoder ===
        `${gates.renderer.encoder}-q${String(gates.image.quality)}` &&
      typeof raw.browserVersion === 'string' &&
      raw.browserVersion.length > 0 &&
      typeof raw.nodeVersion === 'string' &&
      raw.nodeVersion.length > 0 &&
      typeof raw.platform === 'string' &&
      raw.platform.length > 0 &&
      raw.sourceRenderCount ===
        gates.publishedCount + gates.preflightRows.length &&
      typeof raw.wallMs === 'number' &&
      raw.wallMs <= gates.resourceBudgets.maximumFullGenerationWallMs &&
      typeof raw.peakProcessTreeRssBytes === 'number' &&
      raw.peakProcessTreeRssBytes <=
        gates.resourceBudgets.maximumProcessTreeRssBytes,
    'record-preview-manifest-invalid',
  );
  verifyDeterminismCoverage(raw);
  const rows = raw.rows as unknown as ManifestRow[];
  const runtimeById = new Map(runtimeRows.map((row) => [row.formulaId, row]));
  const actualIds: string[] = [];
  const acceptedActualIds: string[] = [];
  const files = new Set<string>();
  let totalBytes = 0;
  let maximumBytes = 0;
  for (const row of rows) {
    const runtime = runtimeById.get(row.formulaId);
    invariant(runtime, 'record-preview-runtime-row-missing');
    const profile = recordPreviewProfileById.get(row.formulaId);
    invariant(profile, 'record-preview-profile-row-missing');
    const expectedRevision = expectedAssetRevision(runtime, raw.browserVersion as string);
    const expectedFile = `${row.formulaId}.${expectedRevision}.webp`;
    const sourcePixelCount =
      gates.renderer.sourceWidth * gates.renderer.sourceHeight;
    const acceptedDeviation = acceptedDeviationById.get(row.formulaId);
    const expectedDeviations = acceptedDeviation
      ? [acceptedDeviation.category]
      : [];
    const deviationValues = new Set(row.acceptedDeviations);
    const sourceDeviation = deviationValues.has('source-non-finite');
    const visualDeviation = deviationValues.has('visual-integrity');
    const visualValid =
      row.metrics.luminanceRange >= gates.visualBudgets.minimumLuminanceRange &&
      row.metrics.distinctLuminanceValues >=
        gates.visualBudgets.minimumDistinctLuminanceValues &&
      row.metrics.edgeEnergy >= gates.visualBudgets.minimumEdgeEnergy &&
      row.metrics.opaqueFraction >= gates.visualBudgets.minimumOpaqueFraction;
    invariant(
      Array.isArray(row.acceptedDeviations) &&
        row.acceptedDeviations.length === deviationValues.size &&
        row.acceptedDeviations.every(
          (value) =>
            value === 'source-non-finite' || value === 'visual-integrity',
        ) &&
        canonicalJson(row.acceptedDeviations) ===
          canonicalJson(expectedDeviations) &&
      row.sourceRevision === runtime.sourceRevision &&
        row.semanticHash === runtime.semanticHash &&
        row.runtimeDefaultProfileSha256 ===
          profile.runtimeDefaultProfileSha256 &&
        row.recordPreviewProfileRevision ===
          profile.recordPreviewProfileRevision &&
        row.recordPreviewProfileSha256 ===
          profile.recordPreviewProfileSha256 &&
        canonicalJson(row.profileSelection) ===
          canonicalJson(profile.selection) &&
        row.assetRevision === expectedRevision &&
        row.file === expectedFile &&
        /^[a-f0-9]{64}$/.test(row.webpSha256) &&
        row.width === gates.image.width &&
        row.height === gates.image.height &&
        Number.isInteger(row.bytes) &&
        row.bytes > 0 &&
        row.bytes <= gates.resourceBudgets.maximumImageBytes &&
        Number.isInteger(row.sourceMetrics.escapedPixels) &&
        Number.isInteger(row.sourceMetrics.interiorPixels) &&
        Number.isInteger(row.sourceMetrics.nonFinitePixels) &&
        row.sourceMetrics.escapedPixels +
          row.sourceMetrics.interiorPixels +
          row.sourceMetrics.nonFinitePixels ===
          sourcePixelCount &&
        row.sourceMetrics.uniqueColors >=
          gates.profilePolicy.verificationMinimumUniqueColors &&
        ((row.sourceMetrics.nonFinitePixels / sourcePixelCount <=
          gates.profilePolicy.maximumNonFiniteFraction &&
          !sourceDeviation) ||
          (sourceDeviation && row.sourceMetrics.nonFinitePixels > 0)) &&
        (profile.profile.coloring.insideColoringId ===
          'record-preview-orbit-average-v1' ||
          row.sourceMetrics.escapedPixels / sourcePixelCount >=
            gates.profilePolicy.minimumEscapedFractionForBlack) &&
        /^[a-f0-9]{64}$/.test(row.sourceMetrics.rawRgbaSha256) &&
        /^[a-f0-9]{64}$/.test(row.pixelFingerprintSha256) &&
        /^[a-f0-9]{16}$/.test(row.perceptualHash) &&
        !files.has(row.file),
      `record-preview-row-invalid:${row.formulaId}`,
    );
    invariant(
      (visualValid && !visualDeviation) || (!visualValid && visualDeviation),
      `record-preview-recorded-visual-gate-invalid:${row.formulaId}`,
    );
    const path = join(outputRoot, row.file);
    invariant(existsSync(path), `record-preview-file-missing:${row.formulaId}`);
    const bytes = readFileSync(path);
    invariant(
      bytes.length === row.bytes &&
        statSync(path).isFile() &&
        bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
        bytes.subarray(8, 12).toString('ascii') === 'WEBP' &&
        sha256(bytes) === row.webpSha256,
      `record-preview-file-invalid:${row.formulaId}`,
    );
    if (row.acceptedDeviations.length > 0) acceptedActualIds.push(row.formulaId);
    actualIds.push(row.formulaId);
    files.add(row.file);
    totalBytes += row.bytes;
    maximumBytes = Math.max(maximumBytes, row.bytes);
  }
  invariant(
    canonicalJson(actualIds) ===
      canonicalJson(runtimeRows.map((row) => row.formulaId).sort()) &&
      new Set(actualIds).size === gates.publishedCount &&
      canonicalJson(acceptedActualIds.sort()) ===
        canonicalJson(acceptedDeviations.rows.map((row) => row.formulaId).sort()) &&
      totalBytes === raw.totalBytes &&
      maximumBytes === raw.maximumBytes &&
      totalBytes <= gates.resourceBudgets.maximumTotalBytes,
    'record-preview-accounting-invalid',
  );
  const diskFiles = readdirSync(outputRoot).sort();
  invariant(
    canonicalJson(diskFiles) ===
      canonicalJson([...files, 'manifest.json'].sort()),
    'record-preview-output-set-invalid',
  );
  return { manifest: raw, rows };
}

async function verifyDecodedRows(
  rows: ManifestRow[],
  expectedBrowserVersion: string,
): Promise<void> {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: ['--disable-dev-shm-usage'],
  });
  invariant(
    browser.version() === expectedBrowserVersion,
    'record-preview-browser-version-invalid',
  );
  const page = await browser.newPage();
  const runtimeById = new Map(runtimeRows.map((row) => [row.formulaId, row]));
  const renderPool = new RenderWorkerPool(gates.renderer.workerConcurrency);
  const sourceById = new Map(
    runtimeRows.map((row) => [row.formulaId, renderPool.render(row)]),
  );
  try {
    for (const [index, row] of rows.entries()) {
      const runtime = runtimeById.get(row.formulaId);
      invariant(runtime, `record-preview-runtime-row-missing:${row.formulaId}`);
      const sourcePromise = sourceById.get(runtime.formulaId);
      invariant(
        sourcePromise,
        `record-preview-source-render-missing:${row.formulaId}`,
      );
      const source = await sourcePromise;
      invariant(
        canonicalJson(source.metrics) === canonicalJson(row.sourceMetrics),
        `record-preview-source-metrics-mismatch:${row.formulaId}`,
      );
      const bytes = readFileSync(join(outputRoot, row.file));
      const result = await page.evaluate(
        async ({
          base64,
          sourceRgbaBase64,
          sourceWidth,
          sourceHeight,
          width,
          height,
          quality,
          sampleWidth,
          sampleHeight,
        }) => {
          const sourceBinary = atob(sourceRgbaBase64);
          const sourcePixels = new Uint8ClampedArray(sourceBinary.length);
          for (let index = 0; index < sourceBinary.length; index += 1) {
            sourcePixels[index] = sourceBinary.charCodeAt(index);
          }
          if (sourcePixels.length !== sourceWidth * sourceHeight * 4) {
            throw new Error('record-preview-source-shape-invalid');
          }
          const sourceCanvas = document.createElement('canvas');
          sourceCanvas.width = sourceWidth;
          sourceCanvas.height = sourceHeight;
          const sourceContext = sourceCanvas.getContext('2d');
          if (!sourceContext)
            throw new Error('record-preview-source-context-missing');
          sourceContext.putImageData(
            new ImageData(sourcePixels, sourceWidth, sourceHeight),
            0,
            0,
          );
          const encodedCanvas = document.createElement('canvas');
          encodedCanvas.width = width;
          encodedCanvas.height = height;
          const encodedContext = encodedCanvas.getContext('2d');
          if (!encodedContext)
            throw new Error('record-preview-encode-context-missing');
          encodedContext.imageSmoothingEnabled = true;
          encodedContext.imageSmoothingQuality = 'high';
          encodedContext.drawImage(sourceCanvas, 0, 0, width, height);
          const encodedDataUrl = encodedCanvas.toDataURL('image/webp', quality);
          if (!encodedDataUrl.startsWith('data:image/webp;base64,')) {
            throw new Error('record-preview-webp-encoder-unavailable');
          }

          const image = new Image();
          image.src = `data:image/webp;base64,${base64}`;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = sampleWidth;
          canvas.height = sampleHeight;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context) throw new Error('record-preview-decode-context-missing');
          context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
          const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
          const luminance: number[] = [];
          const distinct = new Set<number>();
          let opaque = 0;
          let dark = 0;
          let light = 0;
          for (let offset = 0; offset < pixels.length; offset += 4) {
            const value = Math.round(
              pixels[offset] * 0.2126 +
                pixels[offset + 1] * 0.7152 +
                pixels[offset + 2] * 0.0722,
            );
            luminance.push(value);
            distinct.add(value);
            if (pixels[offset + 3] === 255) opaque += 1;
            if (value < 24) dark += 1;
            if (value > 231) light += 1;
          }
          let edgeTotal = 0;
          let edgeCount = 0;
          for (let y = 0; y < sampleHeight; y += 1) {
            for (let x = 0; x < sampleWidth; x += 1) {
              const position = y * sampleWidth + x;
              if (x + 1 < sampleWidth) {
                edgeTotal +=
                  Math.abs(luminance[position] - luminance[position + 1]) / 255;
                edgeCount += 1;
              }
              if (y + 1 < sampleHeight) {
                edgeTotal +=
                  Math.abs(
                    luminance[position] - luminance[position + sampleWidth],
                  ) / 255;
                edgeCount += 1;
              }
            }
          }
          const blocks: number[] = [];
          for (let blockY = 0; blockY < 8; blockY += 1) {
            for (let blockX = 0; blockX < 8; blockX += 1) {
              let total = 0;
              let count = 0;
              for (
                let y = Math.floor((blockY * sampleHeight) / 8);
                y < Math.floor(((blockY + 1) * sampleHeight) / 8);
                y += 1
              ) {
                for (
                  let x = Math.floor((blockX * sampleWidth) / 8);
                  x < Math.floor(((blockX + 1) * sampleWidth) / 8);
                  x += 1
                ) {
                  total += luminance[y * sampleWidth + x];
                  count += 1;
                }
              }
              blocks.push(total / Math.max(1, count));
            }
          }
          const average =
            blocks.reduce((sum, value) => sum + value, 0) / blocks.length;
          const perceptualHash =
            blocks
              .map((value) => (value >= average ? '1' : '0'))
              .join('')
              .match(/.{1,4}/g)
              ?.map((group) => Number.parseInt(group, 2).toString(16))
              .join('') ?? '';
          let sampleBinary = '';
          for (let index = 0; index < pixels.length; index += 1) {
            sampleBinary += String.fromCharCode(pixels[index]);
          }
          return {
            encodedBase64: encodedDataUrl.slice('data:image/webp;base64,'.length),
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
            sampleRgbaBase64: btoa(sampleBinary),
            perceptualHash,
            metrics: {
              luminanceRange: Math.max(...luminance) - Math.min(...luminance),
              distinctLuminanceValues: distinct.size,
              edgeEnergy: edgeCount === 0 ? 0 : edgeTotal / edgeCount,
              opaqueFraction: opaque / luminance.length,
              darkFraction: dark / luminance.length,
              lightFraction: light / luminance.length,
            },
          };
        },
        {
          base64: bytes.toString('base64'),
          sourceRgbaBase64: Buffer.from(source.rgba).toString('base64'),
          sourceWidth: gates.renderer.sourceWidth,
          sourceHeight: gates.renderer.sourceHeight,
          width: gates.image.width,
          height: gates.image.height,
          quality: gates.image.quality,
          sampleWidth: gates.image.sampleWidth,
          sampleHeight: gates.image.sampleHeight,
        },
      );
      const decodedVisualValid =
        result.metrics.luminanceRange >=
          gates.visualBudgets.minimumLuminanceRange &&
        result.metrics.distinctLuminanceValues >=
          gates.visualBudgets.minimumDistinctLuminanceValues &&
        result.metrics.edgeEnergy >= gates.visualBudgets.minimumEdgeEnergy &&
        result.metrics.opaqueFraction >=
          gates.visualBudgets.minimumOpaqueFraction;
      const visualDeviation = row.acceptedDeviations.includes('visual-integrity');
      const expectedBytes = Buffer.from(result.encodedBase64, 'base64');
      invariant(
        expectedBytes.equals(bytes) &&
          sha256(expectedBytes) === row.webpSha256 &&
          result.naturalWidth === gates.image.width &&
          result.naturalHeight === gates.image.height &&
          sha256(Buffer.from(result.sampleRgbaBase64, 'base64')) ===
            row.pixelFingerprintSha256 &&
          result.perceptualHash === row.perceptualHash &&
          canonicalJson(result.metrics) === canonicalJson(row.metrics) &&
          ((decodedVisualValid && !visualDeviation) ||
            (!decodedVisualValid && visualDeviation)),
        `record-preview-decoded-visual-gate-invalid:${row.formulaId}`,
      );
      if ((index + 1) % 50 === 0 || index + 1 === rows.length) {
        console.log(
          `[record-preview:verify] decoded ${String(index + 1)}/${String(rows.length)}`,
        );
      }
    }
  } finally {
    await renderPool.close();
    await page.close();
    await browser.close();
  }
}

async function main(): Promise<void> {
  invariant(
    gates.schema === 'fractalpark-formula-record-preview-gates/v1' &&
      gates.revision === 7 &&
      gates.publishedCount === 534 &&
      gates.image.width === 1200 &&
      gates.image.height === 750 &&
      gates.renderer.engine ===
        'frm-like-v1-cpu-400x250-chromium-upscale' &&
      gates.renderer.sourceWidth === 400 &&
      gates.renderer.sourceHeight === 250 &&
      gates.renderer.iterationCap === 16 &&
      gates.renderer.scaler === 'chromium-canvas-high-quality' &&
      gates.renderer.encoder === 'chromium-canvas-webp' &&
      gates.renderer.workerConcurrency === 3 &&
      gates.renderer.determinismRenders === 2 &&
      gates.profilePolicy.schema ===
        'fractalpark-record-preview-profile-policy/v1' &&
      gates.profilePolicy.revision === 6 &&
      gates.profilePolicy.iterationCap === 16 &&
      canonicalJson(gates.profilePolicy.iterationCandidates) ===
        canonicalJson([16, 8, 4, 2]) &&
      canonicalJson(gates.profilePolicy.sourceValidationIterationCandidates) ===
        canonicalJson([2, 4, 8, 16]) &&
      gates.profilePolicy.sourceValidationWidth === 400 &&
      gates.profilePolicy.sourceValidationHeight === 250 &&
      gates.profilePolicy.sourceValidationTrigger ===
        'legacy-non-finite-pixels' &&
      gates.profilePolicy.verificationRenders === 2 &&
      gates.profilePolicy.searchMinimumUniqueColors === 3 &&
      gates.profilePolicy.verificationMinimumUniqueColors === 4 &&
      gates.profilePolicy.maximumNonFiniteFraction === 0 &&
      gates.profilePolicy.minimumEscapedFractionForBlack === 0.05 &&
      runtimeRows.length === gates.publishedCount,
    'record-preview-gates-invalid',
  );
  verifyRecordPreviewProfiles();
  verifyAcceptedDeviations();
  verifyPreflight();
  const { manifest, rows } = verifyManifest();
  invariant(
    typeof manifest.browserVersion === 'string',
    'record-preview-browser-version-missing',
  );
  await verifyDecodedRows(rows, manifest.browserVersion);
  console.log(
    `[record-preview:verify] PASS: ${String(rows.length)} exact 1200x750 WebP masters`,
  );
}

if (isMainThread) {
  void main().catch((error) => {
    console.error(
      `[record-preview:verify] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
} else {
  invariant(
    (workerData as { mode?: unknown } | null)?.mode ===
      'formula-record-master-verifier-worker',
    'record-preview-verifier-worker-mode-invalid',
  );
  startRenderWorker();
}
