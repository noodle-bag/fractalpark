import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

import { chromium, type Browser, type Page } from 'playwright';

import acceptedDeviationsAsset from '../resources/formula-library/v1/record-preview-accepted-deviations.v1.json';
import gatesAsset from '../resources/formula-library/v1/record-preview-gates.v1.json';
import recordPreviewProfilesAsset from '../resources/formula-library/v1/record-preview-profiles.v1.json';
import runtimeIndexAsset from '../public/formula-library/v1/runtime/published/index.json';
import { resolveActivatedPublishedFormulaDefaultProfileV1 } from '../src/engine/formulas/v1/julia-runtime-activation-v1';
import { compilePublishedFormulaPluginV1 } from '../src/engine/formulas/v1/published-adapter';
import { renderRecordPreviewV1 } from '../src/engine/formulas/v1/record-preview-renderer';
import type { PublishedFormulaRuntimeIndexRowV1 } from '../src/engine/formulas/v1/published-runtime';
import type { FormulaProfileV1 } from '../src/engine/formulas/v1/types';

const root = process.cwd();
const outputRoot = join(root, 'public/formula-library/v1/record-previews');
const preflightPath = join(
  root,
  'resources/formula-library/v1/record-preview-preflight.v1.json',
);
const qualityScanArtifactPath =
  'resources/formula-library/v1/record-preview-quality-scan.v1.json';
const qualityScanPath = join(root, qualityScanArtifactPath);
const gatesPath = 'resources/formula-library/v1/record-preview-gates.v1.json';
const runtimeIndexPath = 'public/formula-library/v1/runtime/published/index.json';
const activationPath = 'resources/formula-library/v1/julia-runtime-activation.v1.json';
const profileArtifactPath =
  'resources/formula-library/v1/record-preview-profiles.v1.json';
const acceptedDeviationsPath =
  'resources/formula-library/v1/record-preview-accepted-deviations.v1.json';
const generatorPath = 'scripts/generate-formula-record-masters.ts';
const runnerPath = 'scripts/run-formula-record-masters.ts';
const compilerPath = 'src/engine/formulas/v1/published-adapter.ts';
const activationResolverPath =
  'src/engine/formulas/v1/julia-runtime-activation-v1.ts';
const rendererPaths = [
  'src/engine/formulas/v1/record-preview-renderer.ts',
  'src/engine/frm/v1-backend.ts',
  'package-lock.json',
] as const;
const expectedProfileBindingPaths = [
  gatesPath,
  runtimeIndexPath,
  'public/formula-library/v1/previews/manifest.json',
  activationPath,
  'scripts/generate-formula-record-preview-profiles.ts',
  compilerPath,
  activationResolverPath,
  ...rendererPaths,
] as const;
const runtimeRoot = join(
  root,
  'public/formula-library/v1/runtime/published',
);

interface Gates {
  schema: 'fractalpark-formula-record-preview-gates/v1';
  revision: number;
  publishedCount: number;
  image: {
    format: 'webp';
    width: number;
    height: number;

    quality: number;
    sampleWidth: number;
    sampleHeight: number;
  };
  renderer: {
    engine: 'frm-like-v1-cpu-400x250-chromium-upscale';
    sourceWidth: 400;
    sourceHeight: 250;
    iterationCap: 16;
    scaler: 'chromium-canvas-high-quality';
    encoder: 'chromium-canvas-webp';
    workerConcurrency: 3;
    determinismRenders: number;
  };
  profilePolicy: {
    schema: 'fractalpark-record-preview-profile-policy/v1';
    revision: 6;
    iterationCap: 16;
    iterationCandidates: readonly [16, 8, 4, 2];
    sourceValidationIterationCandidates: readonly [2, 4, 8, 16];
    sourceValidationWidth: 400;
    sourceValidationHeight: 250;
    sourceValidationTrigger: 'legacy-non-finite-pixels';
    verificationRenders: 2;
    maximumNonFiniteFraction: number;
    searchMinimumUniqueColors: number;
    verificationMinimumUniqueColors: number;
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
  preflightRows: Array<{
    lane: string;
    formulaId: string;
    family: string;
  }>;
}

interface CaptureMetrics {
  luminanceRange: number;
  distinctLuminanceValues: number;
  edgeEnergy: number;
  opaqueFraction: number;
  darkFraction: number;
  lightFraction: number;

}

interface Capture {
  bytes: Buffer;
  pixelFingerprintSha256: string;
  perceptualHash: string;
  metrics: CaptureMetrics;
}

interface SourceRender {
  rgba: Uint8Array;
  metrics: {
    escapedPixels: number;
    interiorPixels: number;
    nonFinitePixels: number;
    uniqueColors: number;
    rawRgbaSha256: string;
  };
}

interface RecordPreviewProfileRow {
  formulaId: string;
  sourceRevision: string;
  semanticHash: string;
  runtimeDefaultProfileSha256: string;
  recordPreviewProfileRevision: string;
  recordPreviewProfileSha256: string;
  selection: {
    strategy:
      | 'runtime-black'
      | 'bounded-black'
      | 'runtime-orbit-average'
      | 'bounded-orbit-average';
    candidateOrdinal: number;
    iterationCandidate: 16 | 8 | 4 | 2;
    parameterCandidateId: string;
    viewCandidateId: string;
  };
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
  legacyPreviewAnomalies: string[];
}

interface RecordPreviewProfiles {
  schema: 'fractalpark-formula-record-preview-profiles/v1';
  revision: 1;
  status: 'ready';
  sourceBindings: Record<string, string>;
  policySha256: string;
  rowCount: 534;
  summary: {
    determinismVerifiedRows: 534;
    verificationRendersPerSelectedProfile: 2;
  };
  rows: RecordPreviewProfileRow[];
  contentHash: string;
}

interface RenderWorkerRequest {
  jobId: number;
  formulaId: string;
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
  formulaId: string;
  resolve: (value: SourceRender) => void;
  reject: (error: Error) => void;
}

interface BusyRender extends QueuedRender {
  jobId: number;
}

interface ManifestRow {
  formulaId: string;
  sourceRevision: string;
  semanticHash: string;
  runtimeDefaultProfileSha256: string;
  recordPreviewProfileRevision: string;
  recordPreviewProfileSha256: string;
  profileSelection: RecordPreviewProfileRow['selection'];
  assetRevision: string;
  file: string;
  webpSha256: string;
  width: number;
  height: number;
  bytes: number;
  sourceMetrics: SourceRender['metrics'];
  pixelFingerprintSha256: string;
  perceptualHash: string;
  metrics: CaptureMetrics;
  acceptedDeviations: Array<'source-non-finite' | 'visual-integrity'>;
}

interface AcceptedDeviations {
  schema: 'fractalpark-formula-record-preview-accepted-deviations/v1';
  revision: 1;
  status: 'temporarily-accepted';
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
  schema: 'fractalpark-formula-record-preview-quality-scan/v1';
  revision: 1;
  status: 'fail';
  sourceBindings: Record<string, string>;
  profileArtifactContentHash: string;
  rowCount: number;
  passedCount: number;
  failureCount: number;
  failures: Array<{ formulaId: string; error: string }>;
  contentHash: string;
}

const gates = gatesAsset as unknown as Gates;
const recordPreviewProfiles =
  recordPreviewProfilesAsset as unknown as RecordPreviewProfiles;
const acceptedDeviations =
  acceptedDeviationsAsset as unknown as AcceptedDeviations;
const runtimeRows = (
  runtimeIndexAsset as unknown as {
    rows: PublishedFormulaRuntimeIndexRowV1[];
  }
).rows;
const recordPreviewProfileById = new Map(
  recordPreviewProfiles.rows.map((row) => [row.formulaId, row]),
);
const acceptedDeviationById = new Map(
  acceptedDeviations.rows.map((row) => [row.formulaId, row]),
);

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function sha256Bytes(value: Buffer | string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(relativePath: string): string {
  return sha256Bytes(readFileSync(join(root, relativePath)));
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function sourceBindings(options: { includeAcceptance: boolean } = { includeAcceptance: true }): Record<string, string> {
  const paths = [
    gatesPath,
    runtimeIndexPath,
    activationPath,
    profileArtifactPath,
    generatorPath,
    runnerPath,
    compilerPath,
    activationResolverPath,
    ...rendererPaths,
  ];
  if (options.includeAcceptance)
    paths.splice(
      4,
      0,
      qualityScanArtifactPath,
      acceptedDeviationsPath,
    );
  return Object.fromEntries(
    paths.map((path) => [path, sha256File(path)]),
  );
}

function validateGates(): void {
  invariant(
    gates.schema === 'fractalpark-formula-record-preview-gates/v1' &&
      gates.revision === 7 &&
      gates.publishedCount === 534 &&
      gates.image.format === 'webp' &&
      gates.image.width === 1200 &&
      gates.image.height === 750 &&
      gates.image.quality > 0 &&
      gates.image.quality <= 1 &&
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
      gates.preflightRows.length === 21 &&
      new Set(gates.preflightRows.map((row) => row.formulaId)).size === 21 &&
      runtimeRows.length === gates.publishedCount,
    'record-preview-gates-invalid',
  );
  const runtimeIds = new Set(runtimeRows.map((row) => row.formulaId));
  invariant(
    gates.preflightRows.every((row) => runtimeIds.has(row.formulaId)),
    'record-preview-preflight-set-invalid',
  );
}

function runtimeDefaultProfileSha256(
  row: PublishedFormulaRuntimeIndexRowV1,
): string {
  return sha256Bytes(
    canonicalJson(resolveActivatedPublishedFormulaDefaultProfileV1(row)),
  );
}

function validateRecordPreviewProfiles(): void {
  const unsigned = {
    ...(recordPreviewProfiles as unknown as Record<string, unknown>),
  };
  delete unsigned.contentHash;
  const expectedIds = [...runtimeRows]
    .map((row) => row.formulaId)
    .sort((left, right) => left.localeCompare(right));
  const profileIds = recordPreviewProfiles.rows.map((row) => row.formulaId);
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
      canonicalJson(profileIds) === canonicalJson(expectedIds) &&
      recordPreviewProfiles.contentHash ===
        sha256Bytes(canonicalJson(unsigned)) &&
      recordPreviewProfiles.policySha256 ===
        sha256Bytes(canonicalJson(gates.profilePolicy)) &&
      canonicalJson(Object.keys(recordPreviewProfiles.sourceBindings).sort()) ===
        canonicalJson([...expectedProfileBindingPaths].sort()) &&
      expectedProfileBindingPaths.every(
        (path) => recordPreviewProfiles.sourceBindings[path] === sha256File(path),
      ),
    'record-preview-profiles-invalid',
  );
  const runtimeById = new Map(runtimeRows.map((row) => [row.formulaId, row]));
  for (const row of recordPreviewProfiles.rows) {
    const runtime = runtimeById.get(row.formulaId);
    invariant(
      runtime !== undefined &&
        row.sourceRevision === runtime.sourceRevision &&
        row.semanticHash === runtime.semanticHash &&
        row.runtimeDefaultProfileSha256 === runtimeDefaultProfileSha256(runtime) &&
        row.recordPreviewProfileRevision === row.profile.profileRevision &&
        row.recordPreviewProfileSha256 === sha256Bytes(canonicalJson(row.profile)) &&
        row.profile.formulaId === runtime.formulaId &&
        row.profile.sourceRevision === runtime.sourceRevision &&
        gates.profilePolicy.iterationCandidates.includes(row.profile.iterations as 16 | 8 | 4 | 2) &&
        row.profile.iterations === row.selection.iterationCandidate,
      `record-preview-profile-row-invalid:${row.formulaId}`,
    );
  }
}

function validateAcceptedDeviations(): void {
  const unsigned = {
    ...(acceptedDeviations as unknown as Record<string, unknown>),
  };
  delete unsigned.contentHash;
  const ids = acceptedDeviations.rows.map((row) => row.formulaId);
  const sortedIds = [...ids].sort((left, right) => left.localeCompare(right));
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
      acceptedDeviations.acceptedCount === acceptedDeviations.rows.length &&
      acceptedDeviations.acceptedCount === 43 &&
      visualCount === 37 &&
      sourceCount === 6 &&
      acceptedDeviationById.size === acceptedDeviations.acceptedCount &&
      canonicalJson(ids) === canonicalJson(sortedIds) &&
      acceptedDeviations.rows.every(
        (row) =>
          runtimeIds.has(row.formulaId) &&
          row.observedError.startsWith(
            row.category === 'source-non-finite'
              ? `record-preview-cpu-source-invalid:${row.formulaId}:`
              : `record-preview-visual-gate-failed:${row.formulaId}:`,
          ),
      ) &&
      acceptedDeviations.contentHash === sha256Bytes(canonicalJson(unsigned)),
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
      canonicalJson(scan.sourceBindings) ===
        canonicalJson(sourceBindings({ includeAcceptance: false })) &&
      scan.profileArtifactContentHash === recordPreviewProfiles.contentHash &&
      scan.rowCount === gates.publishedCount &&
      scan.passedCount === gates.publishedCount - acceptedDeviations.acceptedCount &&
      scan.failureCount === acceptedDeviations.acceptedCount &&
      scan.failures.length === scan.failureCount &&
      canonicalJson(scan.failures) === canonicalJson(expectedFailures) &&
      scan.contentHash === sha256Bytes(canonicalJson(unsignedScan)) &&
      acceptedDeviations.scanReportContentHash === scan.contentHash,
    'record-preview-quality-scan-invalid',
  );
}

function recordPreviewProfileRow(
  row: PublishedFormulaRuntimeIndexRowV1,
): RecordPreviewProfileRow {
  const selected = recordPreviewProfileById.get(row.formulaId);
  invariant(
    selected !== undefined &&
      selected.sourceRevision === row.sourceRevision &&
      selected.semanticHash === row.semanticHash,
    `record-preview-profile-missing:${row.formulaId}`,
  );
  return selected;
}

function assetRevision(
  row: PublishedFormulaRuntimeIndexRowV1,
  encoderVersion: string,
): string {
  const selected = recordPreviewProfileRow(row);
  return sha256Bytes(
    canonicalJson({
      formulaId: row.formulaId,
      sourceRevision: row.sourceRevision,
      semanticHash: row.semanticHash,
      runtimeDefaultProfileSha256: selected.runtimeDefaultProfileSha256,
      recordPreviewProfileRevision: selected.recordPreviewProfileRevision,
      recordPreviewProfileSha256: selected.recordPreviewProfileSha256,
      profileSelection: selected.selection,
      encoderVersion,
      image: gates.image,
      renderer: gates.renderer,
    }),
  ).slice(0, 16);
}

function assetFile(
  row: PublishedFormulaRuntimeIndexRowV1,
  encoderVersion: string,
): string {
  return `${row.formulaId}.${assetRevision(row, encoderVersion)}.webp`;
}

function processTreeRssBytes(rootPid: number): number {
  try {
    const output = execFileSync('ps', ['-eo', 'pid=,ppid=,rss='], {
      encoding: 'utf8',
    });
    const rows = output
      .trim()
      .split('\n')
      .map((line) => line.trim().split(/\s+/).map(Number))
      .filter((row) => row.length === 3 && row.every(Number.isFinite));
    const children = new Map<number, number[]>();
    for (const [pid, ppid] of rows) {
      const siblings = children.get(ppid) ?? [];
      siblings.push(pid);
      children.set(ppid, siblings);
    }
    const descendants = new Set<number>([rootPid]);
    const queue = [rootPid];
    while (queue.length > 0) {
      const parent = queue.shift();
      if (parent === undefined) break;
      for (const child of children.get(parent) ?? []) {
        if (!descendants.has(child)) {
          descendants.add(child);
          queue.push(child);
        }
      }
    }
    return rows.reduce(
      (sum, [pid, , rssKiB]) =>
        descendants.has(pid) ? sum + rssKiB * 1024 : sum,
      0,
    );
  } catch {
    return process.memoryUsage().rss;
  }
}

function startMemorySampler(): {
  readPeak: () => number;
  stop: () => void;
} {
  let peak = processTreeRssBytes(process.pid);
  const timer = setInterval(() => {
    peak = Math.max(peak, processTreeRssBytes(process.pid));
  }, 500);
  timer.unref();
  return {
    readPeak: () => Math.max(peak, processTreeRssBytes(process.pid)),
    stop: () => clearInterval(timer),
  };
}

async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: ['--disable-dev-shm-usage'],
  });
}

function masterProfile(row: PublishedFormulaRuntimeIndexRowV1): FormulaProfileV1 {
  return recordPreviewProfileRow(row).profile;
}

async function renderSource(formulaId: string): Promise<SourceRender> {
  const row = runtimeRows.find((candidate) => candidate.formulaId === formulaId);
  invariant(row, `record-preview-worker-row-missing:${formulaId}`);
  const source = readFileSync(join(runtimeRoot, row.definitionPath), 'utf8');
  invariant(
    sha256Bytes(source) === row.sourceRevision,
    `record-preview-source-revision-mismatch:${formulaId}`,
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
    `record-preview-compile-failed:${formulaId}:${compiled.ok ? 'unknown' : compiled.code}`,
  );
  const profile = masterProfile(row);
  const sourcePreview = renderRecordPreviewV1(
    compiled.value.backend,
    {
      ...profile,
      iterations: Math.min(profile.iterations, gates.renderer.iterationCap),
    },
    gates.renderer.sourceWidth,
    gates.renderer.sourceHeight,
  );
  const sourceMetrics: SourceRender['metrics'] = {
    escapedPixels: sourcePreview.escapedPixels,
    interiorPixels: sourcePreview.interiorPixels,
    nonFinitePixels: sourcePreview.nonFinitePixels,
    uniqueColors: sourcePreview.uniqueColors,
    rawRgbaSha256: sha256Bytes(sourcePreview.rgba),
  };
  const sourcePixels = gates.renderer.sourceWidth * gates.renderer.sourceHeight;
  invariant(
    sourcePreview.rgba.length === sourcePixels * 4,
    `record-preview-cpu-source-shape-invalid:${formulaId}`,
  );
  return { rgba: sourcePreview.rgba, metrics: sourceMetrics };
}

function verifySource(
  row: PublishedFormulaRuntimeIndexRowV1,
  source: SourceRender,
  allowAcceptedDeviation: boolean,
): Array<'source-non-finite'> {
  const profile = masterProfile(row);
  const sourcePixels = gates.renderer.sourceWidth * gates.renderer.sourceHeight;
  const metrics = source.metrics;
  const error = `record-preview-cpu-source-invalid:${row.formulaId}:${String(
    metrics.escapedPixels,
  )}:${String(metrics.interiorPixels)}:${String(metrics.nonFinitePixels)}:${String(
    metrics.uniqueColors,
  )}`;
  invariant(
    metrics.uniqueColors >= gates.profilePolicy.verificationMinimumUniqueColors &&
      (profile.coloring.insideColoringId ===
        'record-preview-orbit-average-v1' ||
        metrics.escapedPixels / sourcePixels >=
          gates.profilePolicy.minimumEscapedFractionForBlack),
    error,
  );
  if (
    metrics.nonFinitePixels / sourcePixels <=
    gates.profilePolicy.maximumNonFiniteFraction
  ) {
    return [];
  }
  invariant(
    allowAcceptedDeviation &&
      acceptedDeviationById.get(row.formulaId)?.category === 'source-non-finite',
    error,
  );
  return ['source-non-finite'];
}

function startRenderWorker(): void {
  const port = parentPort;
  invariant(port, 'record-preview-worker-port-missing');
  port.on('message', (request: RenderWorkerRequest) => {
    void renderSource(request.formulaId)
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
              : 'record-preview-worker-unknown-error',
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
    for (let index = 0; index < concurrency; index += 1) {
      const worker = new Worker(__filename, {
        workerData: { mode: 'formula-record-master-worker' },
      });
      worker.on('message', (response: RenderWorkerResponse) => {
        this.handleResponse(worker, response);
      });
      worker.on('error', (error) => {
        this.fail(error);
      });
      worker.on('exit', (code) => {
        if (!this.closing) {
          this.fail(new Error(`record-preview-worker-exit:${String(code)}`));
        }
      });
      this.workers.push(worker);
    }
  }

  render(formulaId: string): Promise<SourceRender> {
    if (this.failed) return Promise.reject(this.failed);
    return new Promise<SourceRender>((resolveRender, rejectRender) => {
      this.queue.push({
        formulaId,
        resolve: resolveRender,
        reject: rejectRender,
      });
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
      const busy: BusyRender = {
        ...queued,
        jobId: this.nextJobId,
      };
      this.nextJobId += 1;
      this.busy.set(worker, busy);
      const request: RenderWorkerRequest = {
        jobId: busy.jobId,
        formulaId: busy.formulaId,
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
      this.fail(new Error('record-preview-worker-response-mismatch'));
      return;
    }
    this.busy.delete(worker);
    if (response.ok)
      busy.resolve({ rgba: response.rgba, metrics: response.metrics });
    else busy.reject(new Error(response.error));
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

async function encodeCapture(
  page: Page,
  row: PublishedFormulaRuntimeIndexRowV1,
  sourceRender: SourceRender,
): Promise<Capture> {
  invariant(
    sourceRender.rgba.length ===
      gates.renderer.sourceWidth * gates.renderer.sourceHeight * 4,
    `record-preview-cpu-source-invalid:${row.formulaId}`,
  );
  const encoded = await page.evaluate(
    async (input) => {
      const binary = atob(input.sourceRgbaBase64);
      const sourcePixels = new Uint8ClampedArray(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        sourcePixels[index] = binary.charCodeAt(index);
      }
      if (
        sourcePixels.length !== input.sourceWidth * input.sourceHeight * 4
      ) {
        throw new Error('record-preview-cpu-source-invalid');
      }
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = input.sourceWidth;
      sourceCanvas.height = input.sourceHeight;
      const sourceContext = sourceCanvas.getContext('2d');
      if (!sourceContext) {
        throw new Error('record-preview-source-context-missing');
      }
      sourceContext.putImageData(
        new ImageData(sourcePixels, input.sourceWidth, input.sourceHeight),
        0,
        0,
      );

      const output = document.createElement('canvas');
      output.width = input.width;
      output.height = input.height;
      const context = output.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('record-preview-2d-context-missing');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(sourceCanvas, 0, 0, input.width, input.height);
      const dataUrl = output.toDataURL('image/webp', input.quality);
      if (!dataUrl.startsWith('data:image/webp;base64,')) {
        throw new Error('record-preview-webp-encoder-unavailable');
      }
      const encodedImage = new Image();
      encodedImage.src = dataUrl;
      await encodedImage.decode();
      if (
        encodedImage.naturalWidth !== input.width ||
        encodedImage.naturalHeight !== input.height
      ) {
        throw new Error('record-preview-webp-dimensions-invalid');
      }

      const sample = document.createElement('canvas');
      sample.width = input.sampleWidth;
      sample.height = input.sampleHeight;
      const sampleContext = sample.getContext('2d', { willReadFrequently: true });
      if (!sampleContext) throw new Error('record-preview-sample-context-missing');
      sampleContext.imageSmoothingEnabled = true;
      sampleContext.imageSmoothingQuality = 'high';
      sampleContext.drawImage(
        encodedImage,
        0,
        0,
        input.sampleWidth,
        input.sampleHeight,
      );
      const pixels = sampleContext.getImageData(
        0,
        0,
        input.sampleWidth,
        input.sampleHeight,
      ).data;
      const luminance: number[] = [];
      let opaque = 0;
      let dark = 0;
      let light = 0;
      const distinct = new Set<number>();
      for (let index = 0; index < pixels.length; index += 4) {
        const value = Math.round(
          0.2126 * pixels[index] +
            0.7152 * pixels[index + 1] +
            0.0722 * pixels[index + 2],
        );
        luminance.push(value);
        distinct.add(value);
        if (pixels[index + 3] === 255) opaque += 1;
        if (value < 24) dark += 1;
        if (value > 231) light += 1;
      }
      let edgeEnergy = 0;
      let edgeCount = 0;
      for (let y = 0; y < input.sampleHeight; y += 1) {
        for (let x = 0; x < input.sampleWidth; x += 1) {
          const index = y * input.sampleWidth + x;
          if (x + 1 < input.sampleWidth) {
            edgeEnergy +=
              Math.abs(luminance[index] - luminance[index + 1]) / 255;
            edgeCount += 1;
          }
          if (y + 1 < input.sampleHeight) {
            edgeEnergy +=
              Math.abs(
                luminance[index] - luminance[index + input.sampleWidth],
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
            let y = Math.floor((blockY * input.sampleHeight) / 8);
            y < Math.floor(((blockY + 1) * input.sampleHeight) / 8);
            y += 1
          ) {
            for (
              let x = Math.floor((blockX * input.sampleWidth) / 8);
              x < Math.floor(((blockX + 1) * input.sampleWidth) / 8);
              x += 1
            ) {
              total += luminance[y * input.sampleWidth + x];
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
        dataUrl,
        sampleRgbaBase64: btoa(sampleBinary),
        perceptualHash,
        metrics: {
          luminanceRange: Math.max(...luminance) - Math.min(...luminance),
          distinctLuminanceValues: distinct.size,
          edgeEnergy: edgeEnergy / Math.max(1, edgeCount),
          opaqueFraction: opaque / luminance.length,
          darkFraction: dark / luminance.length,
          lightFraction: light / luminance.length,
        },
      };
    },
    {
      sourceRgbaBase64: Buffer.from(sourceRender.rgba).toString('base64'),
      sourceWidth: gates.renderer.sourceWidth,
      sourceHeight: gates.renderer.sourceHeight,
      width: gates.image.width,
      height: gates.image.height,
      quality: gates.image.quality,
      sampleWidth: gates.image.sampleWidth,
      sampleHeight: gates.image.sampleHeight,
    },
  );
  const bytes = Buffer.from(encoded.dataUrl.split(',')[1] ?? '', 'base64');
  return {
    bytes,
    pixelFingerprintSha256: sha256Bytes(
      Buffer.from(encoded.sampleRgbaBase64, 'base64'),
    ),
    perceptualHash: encoded.perceptualHash,
    metrics: encoded.metrics,
  };
}

function verifyCapture(
  row: PublishedFormulaRuntimeIndexRowV1,
  value: Capture,
  allowAcceptedDeviation = false,
): Array<'visual-integrity'> {
  const metrics = value.metrics;
  invariant(
    value.bytes.length <= gates.resourceBudgets.maximumImageBytes,
    `record-preview-image-budget-exceeded:${row.formulaId}`,
  );
  const valid =
    metrics.luminanceRange >= gates.visualBudgets.minimumLuminanceRange &&
    metrics.distinctLuminanceValues >=
      gates.visualBudgets.minimumDistinctLuminanceValues &&
    metrics.edgeEnergy >= gates.visualBudgets.minimumEdgeEnergy &&
    metrics.opaqueFraction >= gates.visualBudgets.minimumOpaqueFraction;
  invariant(
    valid || (allowAcceptedDeviation && acceptedDeviationById.has(row.formulaId)),
    `record-preview-visual-gate-failed:${row.formulaId}:${JSON.stringify(metrics)}`,
  );
  return valid ? [] : ['visual-integrity'];
}

function manifestRow(
  row: PublishedFormulaRuntimeIndexRowV1,
  sourceRender: SourceRender,
  captureValue: Capture,
  encoderVersion: string,
  rowAcceptedDeviations: Array<'source-non-finite' | 'visual-integrity'>,
): ManifestRow {
  const selected = recordPreviewProfileRow(row);
  return {
    formulaId: row.formulaId,
    sourceRevision: row.sourceRevision,
    semanticHash: row.semanticHash,
    runtimeDefaultProfileSha256: selected.runtimeDefaultProfileSha256,
    recordPreviewProfileRevision: selected.recordPreviewProfileRevision,
    recordPreviewProfileSha256: selected.recordPreviewProfileSha256,
    profileSelection: selected.selection,
    assetRevision: assetRevision(row, encoderVersion),
    file: assetFile(row, encoderVersion),
    webpSha256: sha256Bytes(captureValue.bytes),
    width: gates.image.width,
    height: gates.image.height,
    bytes: captureValue.bytes.length,
    sourceMetrics: sourceRender.metrics,
    pixelFingerprintSha256: captureValue.pixelFingerprintSha256,
    perceptualHash: captureValue.perceptualHash,
    metrics: captureValue.metrics,
    acceptedDeviations: rowAcceptedDeviations,
  };
}

function verifyDeterminism(
  row: PublishedFormulaRuntimeIndexRowV1,
  firstSource: SourceRender,
  secondSource: SourceRender,
  first: Capture,
  second: Capture,
): void {
  invariant(
    firstSource.metrics.rawRgbaSha256 ===
      secondSource.metrics.rawRgbaSha256 &&
      canonicalJson(firstSource.metrics) === canonicalJson(secondSource.metrics) &&
      sha256Bytes(first.bytes) === sha256Bytes(second.bytes) &&
      first.pixelFingerprintSha256 === second.pixelFingerprintSha256 &&
      first.perceptualHash === second.perceptualHash &&
      canonicalJson(first.metrics) === canonicalJson(second.metrics),
    `record-preview-nondeterministic:${row.formulaId}`,
  );
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function assertPreflightCurrent(): void {
  invariant(existsSync(preflightPath), 'record-preview-preflight-missing');
  const evidence = JSON.parse(readFileSync(preflightPath, 'utf8')) as {
    schema?: string;
    status?: string;
    sourceBindings?: Record<string, string>;
  };
  invariant(
    evidence.schema === 'fractalpark-formula-record-preview-preflight/v1' &&
      evidence.status === 'pass' &&
      canonicalJson(evidence.sourceBindings) === canonicalJson(sourceBindings()),
    'record-preview-preflight-stale',
  );
}

async function run(): Promise<void> {
  const preflight = process.argv.includes('--preflight');
  const scan = process.argv.includes('--scan');
  const acceptDeviationsForDiagnostic = process.argv.includes(
    '--accept-deviations',
  );
  const writeEvidence = process.argv.includes('--write-evidence');
  const writeAssets = process.argv.includes('--write');
  const selectedFormulaArgument = process.argv.find((argument) =>
    argument.startsWith('--formula='),
  );
  const selectedFormulaId = selectedFormulaArgument?.slice('--formula='.length);
  invariant(
    Number(preflight) + Number(scan) + Number(writeAssets) === 1,
    'record-preview-mode-required',
  );
  if (writeEvidence)
    invariant(preflight || scan, 'record-preview-evidence-mode-invalid');
  if (selectedFormulaId) {
    invariant(
      (preflight || scan) && !writeEvidence,
      'record-preview-diagnostic-mode-invalid',
    );
  }
  invariant(
    !acceptDeviationsForDiagnostic || (scan && selectedFormulaId !== undefined),
    'record-preview-accept-deviations-mode-invalid',
  );
  validateGates();
  validateRecordPreviewProfiles();
  if (!scan) validateAcceptedDeviations();
  const acceptDeviations = writeAssets || acceptDeviationsForDiagnostic;
  if (writeAssets) assertPreflightCurrent();

  const selectedIds = preflight || (scan && selectedFormulaId)
    ? new Set(
        selectedFormulaId
          ? [selectedFormulaId]
          : gates.preflightRows.map((row) => row.formulaId),
      )
    : null;
  const selectedRows = runtimeRows
    .filter((row) => selectedIds === null || selectedIds.has(row.formulaId))
    .sort((left, right) => left.formulaId.localeCompare(right.formulaId));
  invariant(
    selectedRows.length ===
      (selectedFormulaId
        ? 1
        : preflight
          ? gates.preflightRows.length
          : gates.publishedCount),
    'record-preview-selected-count-invalid',
  );
  const startedAt = Date.now();
  const memory = startMemorySampler();
  let browser: Browser | null = null;
  let pool: RenderWorkerPool | null = null;
  let browserVersion = '';
  let sourceRenderCount = 0;
  const rows: ManifestRow[] = [];
  const scanFailures: Array<{ formulaId: string; error: string }> = [];
  const acceptedDeviationFormulaIds = new Set<string>();
  const renderer = gates.renderer.engine;
  const temporaryRoot = resolve(
    '/tmp',
    `fractalpark-record-previews-${String(process.pid)}`,
  );
  if (writeAssets) {
    invariant(!existsSync(outputRoot), 'record-preview-output-exists');
    rmSync(temporaryRoot, { recursive: true, force: true });
    mkdirSync(temporaryRoot, { recursive: true });
  }

  try {
    pool = new RenderWorkerPool(gates.renderer.workerConcurrency);
    browser = await launchBrowser();
    browserVersion = browser.version();
    const context = await browser.newContext({
      viewport: { width: gates.image.width + 64, height: gates.image.height + 64 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(90_000);
    await page.setContent('<!doctype html><meta charset="utf-8"><title>encoder</title>');
    await page.evaluate('globalThis.__name = (value) => value');
    const deterministicIds = new Set(
      gates.preflightRows.map((row) => row.formulaId),
    );
    for (
      let batchStart = 0;
      batchStart < selectedRows.length;
      batchStart += gates.renderer.workerConcurrency
    ) {
      const batch = selectedRows.slice(
        batchStart,
        batchStart + gates.renderer.workerConcurrency,
      );
      const jobs = batch.flatMap((row) => [
        { key: `${row.formulaId}:first`, row },
        ...(preflight || (!scan && deterministicIds.has(row.formulaId))
          ? [{ key: `${row.formulaId}:second`, row }]
          : []),
      ]);
      sourceRenderCount += jobs.length;
      const rendered = await Promise.all(
        jobs.map(async (job) => {
          try {
            return {
              key: job.key,
              value: await pool!.render(job.row.formulaId),
              error: null,
            };
          } catch (error) {
            if (!scan) throw error;
            return {
              key: job.key,
              value: null,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }),
      );
      const sourceByKey = new Map<string, SourceRender>();
      const sourceErrorByKey = new Map<string, string>();
      for (const result of rendered) {
        if (result.value) sourceByKey.set(result.key, result.value);
        if (result.error) sourceErrorByKey.set(result.key, result.error);
      }
      for (const [batchIndex, row] of batch.entries()) {
        try {
          const firstKey = `${row.formulaId}:first`;
          const firstSource = sourceByKey.get(firstKey);
          invariant(
            firstSource,
            sourceErrorByKey.get(firstKey) ??
              `record-preview-first-source-missing:${row.formulaId}`,
          );
          const rowAcceptedDeviations: Array<
            'source-non-finite' | 'visual-integrity'
          > = verifySource(row, firstSource, acceptDeviations);
          const first = await encodeCapture(page, row, firstSource);
          if (selectedFormulaId) {
            writeFileSync(
              '/tmp/fractalpark-record-preview-diagnostic.webp',
              first.bytes,
            );
          }
          rowAcceptedDeviations.push(
            ...verifyCapture(row, first, acceptDeviations),
          );
          if (preflight || (!scan && deterministicIds.has(row.formulaId))) {
            const secondSource = sourceByKey.get(`${row.formulaId}:second`);
            invariant(
              secondSource,
              `record-preview-second-source-missing:${row.formulaId}`,
            );
            const secondAcceptedDeviations: Array<
              'source-non-finite' | 'visual-integrity'
            > = verifySource(
              row,
              secondSource,
              acceptDeviations,
            );
            const second = await encodeCapture(page, row, secondSource);
            secondAcceptedDeviations.push(
              ...verifyCapture(row, second, acceptDeviations),
            );
            verifyDeterminism(row, firstSource, secondSource, first, second);
            invariant(
              canonicalJson(secondAcceptedDeviations) ===
                canonicalJson(rowAcceptedDeviations),
              `record-preview-accepted-deviation-nondeterministic:${row.formulaId}`,
            );
          }
          if (rowAcceptedDeviations.length > 0) {
            acceptedDeviationFormulaIds.add(row.formulaId);
          }
          const projected = manifestRow(
            row,
            firstSource,
            first,
            browserVersion,
            rowAcceptedDeviations,
          );
          rows.push(projected);
          if (writeAssets) {
            writeFileSync(join(temporaryRoot, projected.file), first.bytes);
          }
          const index = batchStart + batchIndex;
          console.log(
            `[record-preview] ${String(index + 1)}/${String(selectedRows.length)} ${row.formulaId} ${(first.bytes.length / 1024).toFixed(1)} KiB`,
          );
        } catch (error) {
          if (!scan) throw error;
          const message = error instanceof Error ? error.message : String(error);
          scanFailures.push({ formulaId: row.formulaId, error: message });
          console.error(
            `[record-preview:scan] FAIL ${row.formulaId} ${message}`,
          );
        }
      }
    }
    if (writeAssets) {
      invariant(
        canonicalJson([...acceptedDeviationFormulaIds].sort()) ===
          canonicalJson(
            acceptedDeviations.rows.map((row) => row.formulaId).sort(),
          ),
        'record-preview-accepted-deviation-set-invalid',
      );
    }
    await page.close();
    await context.close();
  } catch (error) {
    if (writeAssets) rmSync(temporaryRoot, { recursive: true, force: true });
    throw error;
  } finally {
    if (pool) await pool.close();
    if (browser) await browser.close();
    memory.stop();
  }

  const wallMs = Date.now() - startedAt;
  const peakRssBytes = memory.readPeak();
  const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0);
  const maximumBytes = Math.max(...rows.map((row) => row.bytes));
  const projectedTotalBytes = Math.ceil(
    (totalBytes / rows.length) * gates.publishedCount,
  );
  const projectedWallMs = Math.ceil(
    (wallMs / sourceRenderCount) *
      (gates.publishedCount + gates.preflightRows.length),
  );
  const wallBudget = preflight
    ? gates.resourceBudgets.maximumPreflightWallMs
    : gates.resourceBudgets.maximumFullGenerationWallMs;
  invariant(wallMs <= wallBudget, 'record-preview-wall-budget-exceeded');
  invariant(
    sourceRenderCount ===
      (preflight
        ? selectedRows.length * gates.renderer.determinismRenders
        : scan
          ? selectedRows.length
          : selectedRows.length + gates.preflightRows.length),
    'record-preview-source-render-count-invalid',
  );
  if (preflight && !selectedFormulaId) {
    invariant(
      projectedWallMs <=
        gates.resourceBudgets.maximumFullGenerationWallMs,
      'record-preview-projected-wall-budget-exceeded',
    );
  }
  invariant(
    peakRssBytes <= gates.resourceBudgets.maximumProcessTreeRssBytes,
    'record-preview-memory-budget-exceeded',
  );
  invariant(
    maximumBytes <= gates.resourceBudgets.maximumImageBytes,
    'record-preview-maximum-image-budget-exceeded',
  );
  if (!selectedFormulaId) {
    invariant(
      (preflight ? projectedTotalBytes : totalBytes) <=
        gates.resourceBudgets.maximumTotalBytes,
      'record-preview-total-budget-exceeded',
    );
  }

  if (scan) {
    const reportWithoutHash = {
      schema: 'fractalpark-formula-record-preview-quality-scan/v1',
      revision: 1,
      status: scanFailures.length === 0 ? 'pass' : 'fail',
      sourceBindings: sourceBindings({ includeAcceptance: false }),
      profileArtifactContentHash: recordPreviewProfiles.contentHash,
      browserVersion,
      rowCount: selectedRows.length,
      passedCount: rows.length,
      failureCount: scanFailures.length,
      sourceRenderCount,
      wallMs,
      peakProcessTreeRssBytes: peakRssBytes,
      totalBytes,
      maximumBytes,
      failures: scanFailures,
    };
    const report = {
      ...reportWithoutHash,
      contentHash: sha256Bytes(canonicalJson(reportWithoutHash)),
    };
    writeJson(
      writeEvidence
        ? qualityScanPath
        : '/tmp/fractalpark-record-preview-quality-scan.json',
      report,
    );
    console.log(
      `[record-preview:scan] ${scanFailures.length === 0 ? 'PASS' : 'FAIL'}: ${String(rows.length)}/${String(selectedRows.length)} rows passed, ${String(scanFailures.length)} failures`,
    );
    invariant(
      scanFailures.length === 0,
      `record-preview-quality-scan-failed:${String(scanFailures.length)}`,
    );
    return;
  }

  const common = {
    sourceBindings: sourceBindings(),
    profileArtifactContentHash: recordPreviewProfiles.contentHash,
    profilePolicySha256: recordPreviewProfiles.policySha256,
    acceptedDeviationPolicyContentHash: acceptedDeviations.contentHash,
    acceptedDeviationPolicyRows: acceptedDeviations.acceptedCount,
    acceptedDeviationRows: acceptedDeviationFormulaIds.size,
    profileDeterminismVerifiedRows:
      recordPreviewProfiles.summary.determinismVerifiedRows,
    profileVerificationRenders:
      recordPreviewProfiles.summary.verificationRendersPerSelectedProfile,
    sourceEncoderDeterminismFormulaIds: [...gates.preflightRows]
      .map((row) => row.formulaId)
      .sort((left, right) => left.localeCompare(right)),
    sourceEncoderDeterminismRows: gates.preflightRows.length,
    sourceEncoderDeterminismRenders: gates.renderer.determinismRenders,
    renderer,
    encoder: `${gates.renderer.encoder}-q${String(gates.image.quality)}`,
    browserVersion,
    nodeVersion: process.version,
    platform: `${process.platform}-${process.arch}`,
    width: gates.image.width,
    height: gates.image.height,
    rowCount: rows.length,
    sourceRenderCount,
    wallMs,
    peakProcessTreeRssBytes: peakRssBytes,
    totalBytes,
    maximumBytes,
    projectedTotalBytes,
    projectedWallMs,
    rows,
  };

  if (preflight) {
    const evidenceWithoutHash = {
      schema: 'fractalpark-formula-record-preview-preflight/v1',
      revision: 1,
      status: 'pass',
      ...common,
    };
    const evidence = {
      ...evidenceWithoutHash,
      contentHash: sha256Bytes(canonicalJson(evidenceWithoutHash)),
    };
    if (writeEvidence) writeJson(preflightPath, evidence);
    console.log(
      `[record-preview] preflight PASS: ${String(rows.length)} rows, ${(projectedTotalBytes / 1024 / 1024).toFixed(1)} MiB projected, ${(peakRssBytes / 1024 / 1024).toFixed(1)} MiB peak tree RSS`,
    );
    return;
  }

  const manifestWithoutHash = {
    schema: 'fractalpark-formula-record-preview-masters/v1',
    revision: 1,
    status: 'ready',
    ...common,
  };
  const manifest = {
    ...manifestWithoutHash,
    manifestContentHash: sha256Bytes(canonicalJson(manifestWithoutHash)),
  };
  writeJson(join(temporaryRoot, 'manifest.json'), manifest);
  renameSync(temporaryRoot, outputRoot);
  console.log(
    `[record-preview] wrote ${String(rows.length)} masters to ${basename(outputRoot)} (${(totalBytes / 1024 / 1024).toFixed(1)} MiB)`,
  );
}

if (isMainThread) {
  void run().catch((error) => {
    console.error(
      `[record-preview] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
} else {
  invariant(
    (workerData as { mode?: unknown } | null)?.mode ===
      'formula-record-master-worker',
    'record-preview-worker-mode-invalid',
  );
  startRenderWorker();
}
