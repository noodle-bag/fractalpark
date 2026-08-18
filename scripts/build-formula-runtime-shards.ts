import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { parseFrmLikeV1, hashFrmLikeV1 } from "../src/engine/frm/v1";
import { writePublicAsset } from "./generate-formula-publication-decisions";

/**
 * Builds the public runtime shards for decision revision 3 from the pinned
 * clean-room release manifest and a staging directory of implementation
 * outputs. Every shard row is validated BEFORE any public write: the staged
 * file must parse as frm-like/1, its semantic hash must equal the manifest
 * entry, and its byte hash must equal the receipt-pinned output hash. Shards
 * are namespaced under runtime/rev3/ so rollback is a directory delete plus
 * restoring the prior decisions asset (see the rollback runbook). Writes use
 * the same pinned-inode atomic protocol as the decisions asset.
 *
 * Usage: npx tsx scripts/build-formula-runtime-shards.ts <stagingDir> [--write]
 * Without --write the script validates and reports drift only.
 */

const EXPECTED_RELEASE_MANIFEST_HASH: string =
  "45761691cd3867b7e42bc3a434a0b7dacd45b0f24316df455ec40d4d47884e6b";
const DECISION_REVISION = 3;
const SHARD_SIZE = 64;
const SCHEMA = "fractalpark-formula-library-runtime-shard/v1";
const MANIFEST_SCHEMA = "fractalpark-formula-library-runtime-manifest/v1";
const RELEASE_MANIFEST_RELATIVE_PATH = join(
  ".formula-library-private",
  "formula-library-v1",
  "clean-room-bulk-v1",
  "release-manifest-rev3.json",
);
const RUNTIME_RELATIVE_DIR = join(
  "resources",
  "formula-library",
  "v1",
  "runtime",
  "rev3",
);

type JsonRecord = Record<string, unknown>;

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function sha256Bytes(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

async function main(): Promise<void> {
  const staging = process.argv[2];
  const write = process.argv.includes("--write");
  invariant(staging, "shards-usage");
  const repositoryRoot = process.cwd();

  const manifestBytes = readFileSync(
    join(repositoryRoot, RELEASE_MANIFEST_RELATIVE_PATH),
  );
  invariant(
    sha256Bytes(manifestBytes) === EXPECTED_RELEASE_MANIFEST_HASH,
    "shards-release-manifest-drift",
  );
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
    schema: string;
    decisionRevision: number;
    rows: {
      formulaId: string;
      displayName: string;
      family: string;
      semanticHash: string;
      pilotCarryover: boolean;
      evidence: { outputSha256?: string };
    }[];
  };
  invariant(
    manifest.schema === "fractalpark-bulk-release-manifest/1" &&
      manifest.decisionRevision === DECISION_REVISION,
    "shards-release-manifest-drift",
  );

  const carryoverDir = join(
    repositoryRoot,
    ".formula-library-private",
    "formula-library-v1",
    "clean-room-pilot-v1",
    "carryover-outputs",
  );

  const rows: JsonRecord[] = [];
  for (const entry of [...manifest.rows].sort((a, b) =>
    a.formulaId < b.formulaId ? -1 : 1,
  )) {
    const dir = entry.pilotCarryover ? carryoverDir : staging;
    const bytes = readFileSync(join(dir, `${entry.formulaId}.frm`));
    if (entry.evidence.outputSha256) {
      invariant(
        sha256Bytes(bytes) === entry.evidence.outputSha256,
        "shards-output-hash-mismatch",
      );
    }
    const text = bytes.toString("utf8");
    const parsed = parseFrmLikeV1(text);
    invariant(parsed.ok, "shards-definition-parse-failed");
    const { semanticHash } = await hashFrmLikeV1(text, parsed.ir);
    invariant(
      semanticHash === entry.semanticHash,
      "shards-semantic-hash-mismatch",
    );
    rows.push({
      formulaId: entry.formulaId,
      displayName: entry.displayName,
      family: entry.family,
      implementationBasis: "separated-independent-rewrite",
      semanticHash,
      definition: text,
    });
  }

  const shardCount = Math.ceil(rows.length / SHARD_SIZE);
  const shardFiles: { file: string; sha256: string; rows: number }[] = [];
  const writes: { path: string; serialized: string }[] = [];
  for (let index = 0; index < shardCount; index += 1) {
    const shardRows = rows.slice(index * SHARD_SIZE, (index + 1) * SHARD_SIZE);
    const doc = {
      schema: SCHEMA,
      decisionRevision: DECISION_REVISION,
      shardIndex: index,
      shardCount,
      rows: shardRows,
    };
    const serialized = `${JSON.stringify(doc, null, 2)}\n`;
    const file = `shard-${String(index).padStart(3, "0")}.json`;
    shardFiles.push({ file, sha256: sha256Bytes(serialized), rows: shardRows.length });
    writes.push({
      path: join(repositoryRoot, RUNTIME_RELATIVE_DIR, file),
      serialized,
    });
  }
  const manifestDoc = {
    schema: MANIFEST_SCHEMA,
    decisionRevision: DECISION_REVISION,
    releaseManifestSha256: EXPECTED_RELEASE_MANIFEST_HASH,
    shardCount,
    rowCount: rows.length,
    shards: shardFiles,
  };
  writes.push({
    path: join(repositoryRoot, RUNTIME_RELATIVE_DIR, "manifest.json"),
    serialized: `${JSON.stringify(manifestDoc, null, 2)}\n`,
  });

  if (write) {
    for (const { path, serialized } of writes) {
      writePublicAsset(path, serialized);
    }
  }
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      mode: write ? "write" : "check",
      decisionRevision: DECISION_REVISION,
      rows: rows.length,
      shardCount,
      files: writes.length,
    })}\n`,
  );
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "shards-internal-error";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
