import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

import runtimeIndexAsset from '../public/formula-library/v1/runtime/published/index.json';
import {
  compilePublishedFormulaPluginV1,
  parsePublishedFormulaRuntimeIndexV1,
  type FormulaParameterValueV1,
  type FormulaProfileV1,
  type PublishedFormulaRuntimeIndexRowV1,
} from '../src/engine/formulas/v1/index';
import { renderProvisionalPreviewV1 } from '../src/engine/formulas/v1/provisional-preview';

const OUTPUT_ROOT = join(
  process.cwd(),
  'public',
  'formula-library',
  'v1',
  'previews',
);
const RUNTIME_ROOT = join(
  process.cwd(),
  'public',
  'formula-library',
  'v1',
  'runtime',
  'published',
);
const WIDTH = 96;
const HEIGHT = 60;
const WORKER_COUNT = 4;

interface PreviewWorkerData {
  readonly start: number;
  readonly end: number;
}

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function crc32(value: Buffer): number {
  let crc = 0xffffffff;
  for (const octet of value) {
    crc ^= octet;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return output;
}

export function encodeFormulaRecordPreviewPngV1(
  width: number,
  height: number,
  rgba: Uint8Array,
): Buffer {
  invariant(
    Number.isInteger(width) &&
      Number.isInteger(height) &&
      width > 0 &&
      height > 0 &&
      rgba.length === width * height * 4,
    'formula-record-preview-rgba-invalid',
  );
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const target = y * (width * 4 + 1);
    scanlines[target] = 0;
    scanlines.set(
      rgba.subarray(y * width * 4, (y + 1) * width * 4),
      target + 1,
    );
  }
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function cloneDefault(value: unknown): FormulaParameterValueV1 {
  if (Array.isArray(value)) {
    invariant(
      value.length === 2 && value.every((part) => typeof part === 'number'),
      'formula-record-preview-parameter-invalid',
    );
    return [value[0], value[1]];
  }
  invariant(
    typeof value === 'number' || typeof value === 'string',
    'formula-record-preview-parameter-invalid',
  );
  return value as FormulaParameterValueV1;
}

function buildProfile(
  row: PublishedFormulaRuntimeIndexRowV1,
): FormulaProfileV1 {
  const parameters = Object.fromEntries(
    row.parameters.map((parameter) => [
      parameter.slotName,
      cloneDefault(parameter.default),
    ]),
  );
  return {
    schemaVersion: 1,
    formulaId: row.formulaId as FormulaProfileV1['formulaId'],
    sourceRevision: row.sourceRevision as FormulaProfileV1['sourceRevision'],
    profileRevision: sha256(
      JSON.stringify(row.profile),
    ) as FormulaProfileV1['profileRevision'],
    parameters,
    mode: row.profile.mode,
    ...(row.profile.mode === 'julia' && row.profile.juliaC
      ? { juliaC: row.profile.juliaC }
      : {}),
    view: {
      centerX: row.profile.center[0],
      centerY: row.profile.center[1],
      zoom: row.profile.zoom,
      rotation: row.profile.rotation,
    },
    iterations: row.profile.iterations,
    coloring: {
      pipelineVersion: 1,
      outsideColoringId: 'smooth',
      insideColoringId: 'black',
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
}

function filesUnder(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(relative(root, path));
      else throw new Error('formula-record-preview-output-invalid');
    }
  };
  visit(root);
  return files.sort();
}

async function buildOutput(
  start = 0,
  end = Number.POSITIVE_INFINITY,
  reportProgress = true,
): Promise<ReadonlyMap<string, Buffer>> {
  const parsed = parsePublishedFormulaRuntimeIndexV1(runtimeIndexAsset);
  invariant(parsed.ok, 'formula-record-preview-index-invalid');
  const files = new Map<string, Buffer>();
  const manifestRows: Array<Record<string, unknown>> = [];
  const selectedRows = parsed.value.rows.slice(start, end);

  for (const [index, row] of selectedRows.entries()) {
    const sourcePath = join(RUNTIME_ROOT, row.definitionPath);
    const source = readFileSync(sourcePath, 'utf8');
    invariant(sha256(source) === row.sourceRevision, 'formula-record-preview-source-invalid');
    const compiled = await compilePublishedFormulaPluginV1({
      formulaId: row.formulaId,
      displayName: row.displayName,
      family: row.family,
      sourceRevision: row.sourceRevision,
      semanticHash: row.semanticHash,
      source,
    });
    invariant(compiled.ok, 'formula-record-preview-compile-failed');
    const preview = renderProvisionalPreviewV1(
      compiled.value.backend,
      buildProfile(row),
      WIDTH,
      HEIGHT,
    );
    const png = encodeFormulaRecordPreviewPngV1(WIDTH, HEIGHT, preview.rgba);
    const filename = `${row.formulaId}.png`;
    files.set(filename, png);
    manifestRows.push({
      formulaId: row.formulaId,
      sourceRevision: row.sourceRevision,
      profileQuality: row.profile.quality,
      file: filename,
      pngSha256: sha256(png),
      escapedPixels: preview.escapedPixels,
      interiorPixels: preview.interiorPixels,
      nonFinitePixels: preview.nonFinitePixels,
      uniqueColors: preview.uniqueColors,
      anomalies: preview.anomalies,
    });
    if (
      reportProgress &&
      ((index + 1) % 25 === 0 || index + 1 === selectedRows.length)
    ) {
      process.stderr.write(
        `formula-record-previews:${start + index + 1}/${parsed.value.rows.length}\n`,
      );
    }
  }

  const manifestWithoutHash = {
    schema: 'fractalpark-formula-record-previews/v1',
    decisionRevision: parsed.value.decisionRevision,
    publicationDecisionsContentHash:
      parsed.value.publicationDecisionsContentHash,
    deterministic: true,
    width: WIDTH,
    height: HEIGHT,
    rowCount: manifestRows.length,
    rows: manifestRows,
  };
  const manifestContentHash = sha256(JSON.stringify(manifestWithoutHash));
  files.set(
    'manifest.json',
    Buffer.from(
      `${JSON.stringify({ ...manifestWithoutHash, manifestContentHash }, null, 2)}\n`,
    ),
  );
  return files;
}

type WorkerFileEntry = readonly [string, Uint8Array];

function runPreviewWorker(data: PreviewWorkerData): Promise<readonly WorkerFileEntry[]> {
  return new Promise((resolveWorker, rejectWorker) => {
    const script = resolve(process.argv[1] ?? '');
    const tsx = join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const child = spawn(
      tsx,
      [
        script,
        `--worker-start=${data.start}`,
        `--worker-end=${data.end}`,
      ],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.once('error', rejectWorker);
    child.once('close', (code) => {
      if (code !== 0) {
        rejectWorker(
          new Error(
            stderr.trim() || 'formula-record-preview-worker-failed',
          ),
        );
        return;
      }
      try {
        const payload = JSON.parse(stdout) as {
          files?: Array<readonly [string, string]>;
        };
        invariant(
          Array.isArray(payload.files),
          'formula-record-preview-worker-output-invalid',
        );
        resolveWorker(
          payload.files.map(([path, base64]) => [
            path,
            Buffer.from(base64, 'base64'),
          ] as const),
        );
      } catch {
        rejectWorker(new Error('formula-record-preview-worker-output-invalid'));
      }
    });
  });
}

async function buildParallelOutput(): Promise<ReadonlyMap<string, Buffer>> {
  const parsed = parsePublishedFormulaRuntimeIndexV1(runtimeIndexAsset);
  invariant(parsed.ok, 'formula-record-preview-index-invalid');
  const chunkSize = Math.ceil(parsed.value.rows.length / WORKER_COUNT);
  const shards = await Promise.all(
    Array.from({ length: WORKER_COUNT }, (_, index) =>
      runPreviewWorker({
        start: index * chunkSize,
        end: Math.min((index + 1) * chunkSize, parsed.value.rows.length),
      }),
    ),
  );
  const files = new Map<string, Buffer>();
  const manifestRows: Array<Record<string, unknown>> = [];
  for (const shard of shards) {
    for (const [path, bytes] of shard) {
      const buffer = Buffer.from(bytes);
      if (path === 'manifest.json') {
        const manifest = JSON.parse(buffer.toString('utf8')) as {
          rows?: Array<Record<string, unknown>>;
        };
        invariant(
          Array.isArray(manifest.rows),
          'formula-record-preview-worker-manifest-invalid',
        );
        manifestRows.push(...manifest.rows);
        continue;
      }
      invariant(!files.has(path), 'formula-record-preview-worker-duplicate');
      files.set(path, buffer);
    }
  }
  manifestRows.sort((left, right) =>
    String(left.formulaId).localeCompare(String(right.formulaId)),
  );
  invariant(
    files.size === parsed.value.rows.length &&
      manifestRows.length === parsed.value.rows.length,
    'formula-record-preview-worker-count-invalid',
  );
  const manifestWithoutHash = {
    schema: 'fractalpark-formula-record-previews/v1',
    decisionRevision: parsed.value.decisionRevision,
    publicationDecisionsContentHash:
      parsed.value.publicationDecisionsContentHash,
    deterministic: true,
    width: WIDTH,
    height: HEIGHT,
    rowCount: manifestRows.length,
    rows: manifestRows,
  };
  const manifestContentHash = sha256(JSON.stringify(manifestWithoutHash));
  files.set(
    'manifest.json',
    Buffer.from(
      `${JSON.stringify({ ...manifestWithoutHash, manifestContentHash }, null, 2)}\n`,
    ),
  );
  return files;
}

function writeOutput(files: ReadonlyMap<string, Buffer>): void {
  mkdirSync(dirname(OUTPUT_ROOT), { recursive: true });
  const temp = `${OUTPUT_ROOT}.tmp-${process.pid}`;
  const backup = `${OUTPUT_ROOT}.backup-${process.pid}`;
  rmSync(temp, { recursive: true, force: true });
  rmSync(backup, { recursive: true, force: true });
  mkdirSync(temp, { recursive: true, mode: 0o755 });
  for (const [path, bytes] of files) {
    const destination = join(temp, path);
    mkdirSync(dirname(destination), { recursive: true, mode: 0o755 });
    writeFileSync(destination, bytes, { mode: 0o644 });
    chmodSync(destination, 0o644);
  }
  let backedUp = false;
  try {
    if (existsSync(OUTPUT_ROOT)) {
      renameSync(OUTPUT_ROOT, backup);
      backedUp = true;
    }
    renameSync(temp, OUTPUT_ROOT);
    if (backedUp) rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    if (backedUp && !existsSync(OUTPUT_ROOT)) renameSync(backup, OUTPUT_ROOT);
    throw error;
  }
}

function verifyOutput(files: ReadonlyMap<string, Buffer>): void {
  invariant(
    filesUnder(OUTPUT_ROOT).join('\u0000') === [...files.keys()].sort().join('\u0000'),
    'formula-record-preview-output-set-invalid',
  );
  for (const [path, expected] of files) {
    const target = join(OUTPUT_ROOT, path);
    const metadata = statSync(target);
    invariant(
      metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1,
      'formula-record-preview-output-invalid',
    );
    invariant(
      readFileSync(target).equals(expected),
      'formula-record-preview-output-drift',
    );
  }
}

async function main(): Promise<void> {
  const workerStartArgument = process.argv.find((value) =>
    value.startsWith('--worker-start='),
  );
  const workerEndArgument = process.argv.find((value) =>
    value.startsWith('--worker-end='),
  );
  if (workerStartArgument || workerEndArgument) {
    const start = Number(workerStartArgument?.split('=')[1]);
    const end = Number(workerEndArgument?.split('=')[1]);
    invariant(
      Number.isInteger(start) &&
        Number.isInteger(end) &&
        start >= 0 &&
        end >= start,
      'formula-record-preview-worker-input-invalid',
    );
    const workerFiles = await buildOutput(start, end, true);
    process.stdout.write(
      JSON.stringify({
        files: [...workerFiles].map(([path, bytes]) => [
          path,
          bytes.toString('base64'),
        ]),
      }),
    );
    return;
  }

  const files = await buildParallelOutput();
  if (process.argv.includes('--write')) writeOutput(files);
  else verifyOutput(files);
  process.stdout.write(
    `${JSON.stringify({ ok: true, files: files.size, rows: files.size - 1 })}\n`,
  );
}

const executableUrl = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (executableUrl === import.meta.url) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ ok: false, code: error instanceof Error ? error.message : 'formula-record-preview-failed' })}\n`,
    );
    process.exitCode = 1;
  });
}
