import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hashFrmLikeV1, parseFrmLikeV1 } from '@/engine/frm/v1';
import {
  TEACHING_SEMANTIC_ANCHOR_SCHEMA_V1,
  deriveTeachingSemanticAnchorsV1,
} from '@/content/teaching/semantic-anchors';

interface SelectionRow {
  readonly ordinal: number;
  readonly batch: number;
  readonly formulaId: string;
  readonly sourceRevision: string;
  readonly semanticHash: string;
}

interface SelectionAsset {
  readonly schema: string;
  readonly packageCount: number;
  readonly contentUnitCount: number;
  readonly rows: SelectionRow[];
  readonly batches: ReadonlyArray<
    Readonly<{ batch: number; formulaIds: readonly string[] }>
  >;
}

interface RuntimeRow {
  readonly formulaId: string;
  readonly sourceRevision: string;
  readonly semanticHash: string;
  readonly definitionPath: string;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function assertTeachingSelectionAssetV1(selection: SelectionAsset): void {
  const rows = [...selection.rows].sort(
    (left, right) => left.ordinal - right.ordinal,
  );
  if (
    selection.schema !== 'fractalpark-teaching-selection/v1' ||
    selection.packageCount !== 50 ||
    selection.contentUnitCount !== 350 ||
    rows.length !== 50 ||
    selection.batches.length !== 5 ||
    new Set(rows.map((row) => row.formulaId)).size !== 50 ||
    new Set(rows.map((row) => row.semanticHash)).size !== 50
  ) {
    throw new Error('teaching-anchor-selection-invalid');
  }
  for (const [index, row] of rows.entries()) {
    if (
      row.ordinal !== index + 1 ||
      row.batch !== Math.floor(index / 10) + 1 ||
      !/^[a-f0-9-]{36}$/.test(row.formulaId) ||
      !/^[a-f0-9]{64}$/.test(row.sourceRevision) ||
      !/^[a-f0-9]{64}$/.test(row.semanticHash)
    ) {
      throw new Error('teaching-anchor-selection-row-invalid');
    }
  }
  for (let batch = 1; batch <= 5; batch += 1) {
    const expected = rows
      .filter((row) => row.batch === batch)
      .map((row) => row.formulaId);
    const declared = selection.batches.find((entry) => entry.batch === batch);
    if (!declared || JSON.stringify(declared.formulaIds) !== JSON.stringify(expected)) {
      throw new Error('teaching-anchor-selection-batch-invalid');
    }
  }
}

export async function buildTeachingSemanticAnchorAsset(
  repositoryRoot: string,
): Promise<unknown> {
  const selectionPath = join(
    repositoryRoot,
    'resources/formula-library/v1/teaching-selection.v1.json',
  );
  const runtimeRoot = join(
    repositoryRoot,
    'public/formula-library/v1/runtime/published',
  );
  const selectionBytes = readFileSync(selectionPath);
  const selection = JSON.parse(
    selectionBytes.toString('utf8'),
  ) as SelectionAsset;
  const runtime = readJson(join(runtimeRoot, 'index.json')) as {
    rows: RuntimeRow[];
  };
  assertTeachingSelectionAssetV1(selection);
  const runtimeById = new Map(runtime.rows.map((row) => [row.formulaId, row]));
  const rows = [];

  for (const selected of [...selection.rows].sort(
    (left, right) => left.ordinal - right.ordinal,
  )) {
    const runtimeRow = runtimeById.get(selected.formulaId);
    if (
      !runtimeRow ||
      runtimeRow.sourceRevision !== selected.sourceRevision ||
      runtimeRow.semanticHash !== selected.semanticHash
    ) {
      throw new Error('teaching-anchor-runtime-binding-mismatch');
    }
    const definitionPath = resolve(
      runtimeRoot,
      runtimeRow.definitionPath.replace(/^\/+/, ''),
    );
    if (!definitionPath.startsWith(`${resolve(runtimeRoot)}${sep}`)) {
      throw new Error('teaching-anchor-definition-path-invalid');
    }
    const source = readFileSync(definitionPath, 'utf8');
    const parsed = parseFrmLikeV1(source);
    if (!parsed.ok) throw new Error('teaching-anchor-source-invalid');
    const revisions = await hashFrmLikeV1(source, parsed.ir);
    if (
      revisions.sourceRevision !== selected.sourceRevision ||
      revisions.semanticHash !== selected.semanticHash
    ) {
      throw new Error('teaching-anchor-revision-mismatch');
    }
    const anchors = deriveTeachingSemanticAnchorsV1(
      selected.sourceRevision,
      parsed.ir,
    );
    rows.push({
      formulaId: selected.formulaId,
      sourceRevision: selected.sourceRevision,
      semanticHash: selected.semanticHash,
      anchorCount: anchors.length,
      anchors,
    });
  }

  return {
    schema: TEACHING_SEMANTIC_ANCHOR_SCHEMA_V1,
    generatorRevision: 1,
    selectionSha256: sha256(selectionBytes),
    rowCount: rows.length,
    rows,
  };
}

export function canonicalTeachingSemanticAnchorJson(asset: unknown): string {
  return `${JSON.stringify(asset, null, 2)}\n`;
}

async function main(): Promise<void> {
  const repositoryRoot = process.cwd();
  const asset = await buildTeachingSemanticAnchorAsset(repositoryRoot);
  const output = canonicalTeachingSemanticAnchorJson(asset);
  const outputPath = join(
    repositoryRoot,
    'resources/formula-library/v1/teaching-semantic-anchors.v1.json',
  );
  const write = process.argv.includes('--write');
  if (write) writeFileSync(outputPath, output, 'utf8');
  else if (readFileSync(outputPath, 'utf8') !== output) {
    throw new Error('teaching-semantic-anchor-asset-stale');
  }
  process.stdout.write(
    `${JSON.stringify({ ok: true, write, bytes: Buffer.byteLength(output), sha256: sha256(output) })}\n`,
  );
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'teaching-anchor-internal-error'}\n`,
    );
    process.exitCode = 1;
  });
}
