import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";

const ROOT = process.cwd();
const DEFAULT_PRIVATE_ROOT = join(
  ROOT,
  ".formula-library-private/formula-library-v1/julia-pixel-recovery-v1",
);
const CONTRACT_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-pixel-recovery-contract.v1.json",
);
const UUID_V5 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA256 = /^[a-f0-9]{64}$/;

type JsonRecord = Record<string, unknown>;

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function record(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    invariant(Number.isFinite(value), "holdout-transition-non-finite");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  invariant(record(value), "holdout-transition-non-json");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function sha(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function contentHash(value: JsonRecord): string {
  const content: JsonRecord = { ...value };
  delete content.contentHash;
  return sha(canonicalJson(content));
}

function sealedAuthority(value: unknown): boolean {
  return (
    record(value) &&
    exactKeys(value, ["authorityState", "supersededBy", "withdrawnBy"]) &&
    value.authorityState === "sealed" &&
    value.supersededBy === null &&
    value.withdrawnBy === null
  );
}

function readJson(path: string, requirePrivateMode: boolean): JsonRecord {
  const stat = lstatSync(path);
  invariant(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, "holdout-transition-input-not-regular");
  if (requirePrivateMode)
    invariant((stat.mode & 0o777) === 0o600, "holdout-transition-input-mode-invalid");
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  invariant(record(parsed), "holdout-transition-input-invalid");
  return parsed;
}

function ensurePrivateRoot(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  invariant(stat.isDirectory() && !stat.isSymbolicLink(), "holdout-transition-private-root-invalid");
  invariant((stat.mode & 0o777) === 0o700, "holdout-transition-private-root-mode-invalid");
}

function writeExclusive(path: string, artifact: JsonRecord): void {
  if (existsSync(path)) {
    const existing = readJson(path, true);
    invariant(canonicalJson(existing) === canonicalJson(artifact), "holdout-transition-output-conflict");
    return;
  }
  let descriptor: number | undefined;
  let created = false;
  try {
    descriptor = openSync(
      path,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    created = true;
    fchmodSync(descriptor, 0o600);
    invariant(fstatSync(descriptor).nlink === 1, "holdout-transition-output-hardlinked");
    writeFileSync(descriptor, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
  } catch (error) {
    if (record(error) && error.code === "EEXIST") {
      const existing = readJson(path, true);
      invariant(canonicalJson(existing) === canonicalJson(artifact), "holdout-transition-output-conflict");
      return;
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (created) {
      try {
        readJson(path, true);
      } catch (error) {
        unlinkSync(path);
        throw error;
      }
    }
  }
}

function parseArguments(): {
  command: "freeze-wave" | "seal-attempts";
  privateRoot: string;
  candidateManifestPath: string;
  attemptManifestPath: string | null;
} {
  const [command, ...args] = process.argv.slice(2);
  invariant(command === "freeze-wave" || command === "seal-attempts", "holdout-transition-command-invalid");
  let privateRoot = DEFAULT_PRIVATE_ROOT;
  let candidateManifestPath: string | null = null;
  let attemptManifestPath: string | null = null;
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    invariant(value !== undefined, "holdout-transition-argument-missing");
    if (flag === "--private-root") privateRoot = resolve(value);
    else if (flag === "--candidate-manifest") candidateManifestPath = resolve(value);
    else if (flag === "--attempt-manifest") attemptManifestPath = resolve(value);
    else throw new Error("holdout-transition-argument-invalid");
  }
  invariant(isAbsolute(privateRoot), "holdout-transition-private-root-not-absolute");
  invariant(candidateManifestPath !== null, "holdout-transition-candidate-manifest-missing");
  invariant(
    command === "freeze-wave" ? attemptManifestPath === null : attemptManifestPath !== null,
    "holdout-transition-attempt-manifest-invalid",
  );
  return { command, privateRoot, candidateManifestPath, attemptManifestPath };
}

interface CandidateRow {
  formulaId: string;
  rewriteClass: "E0-operational-equivalence" | "E1-mathematical-identity";
  candidateContentHash: string;
  sourceRevision: string;
  semanticHash: string;
}

function parseCandidateManifest(path: string, contractContentHash: string): {
  waveId: string;
  rows: CandidateRow[];
} {
  const value = readJson(path, false);
  invariant(
    exactKeys(value, [
      "schema",
      "revision",
      "authority",
      "contractContentHash",
      "rowCount",
      "rows",
      "waveId",
      "contentHash",
    ]) &&
      value.schema === "fractalpark-julia-pixel-candidate-manifest/v1" &&
      value.revision === 1 &&
      sealedAuthority(value.authority) &&
      value.contractContentHash === contractContentHash &&
      Array.isArray(value.rows) &&
      Number.isInteger(value.rowCount) &&
      value.rowCount === value.rows.length &&
      typeof value.waveId === "string" &&
      SHA256.test(value.waveId) &&
      value.contentHash === value.waveId,
    "holdout-transition-candidate-manifest-invalid",
  );
  const manifestRows = value.rows as unknown[];
  const rows: CandidateRow[] = manifestRows.map((row, index) => {
    const previous = index > 0 ? manifestRows[index - 1] : null;
    invariant(
      record(row) &&
        exactKeys(row, [
          "formulaId",
          "rewriteClass",
          "candidateContentHash",
          "sourceRevision",
          "semanticHash",
        ]) &&
        typeof row.formulaId === "string" &&
        UUID_V5.test(row.formulaId) &&
        (row.rewriteClass === "E0-operational-equivalence" ||
          row.rewriteClass === "E1-mathematical-identity") &&
        typeof row.candidateContentHash === "string" &&
        SHA256.test(row.candidateContentHash) &&
        typeof row.sourceRevision === "string" &&
        SHA256.test(row.sourceRevision) &&
        typeof row.semanticHash === "string" &&
        SHA256.test(row.semanticHash) &&
        (index === 0 ||
          (record(previous) &&
            typeof previous.formulaId === "string" &&
            previous.formulaId < row.formulaId)),
      "holdout-transition-candidate-row-invalid",
    );
    return row as unknown as CandidateRow;
  });
  const base = {
    schema: value.schema,
    revision: value.revision,
    authority: value.authority,
    contractContentHash: value.contractContentHash,
    rowCount: value.rowCount,
    rows: value.rows,
  };
  invariant(sha(canonicalJson(base)) === value.waveId, "holdout-transition-wave-id-invalid");
  return { waveId: value.waveId, rows };
}

function parseInitialLedger(path: string, corpusDigest: string): JsonRecord {
  const value = readJson(path, true);
  invariant(
    exactKeys(value, [
      "schema",
      "revision",
      "stage",
      "currentCorpusDigest",
      "waveId",
      "candidateManifestContentHash",
      "attempts",
      "predecessorContentHash",
      "contentHash",
    ]) &&
      value.schema === "fractalpark-julia-pixel-holdout-attempt-ledger/v1" &&
      value.revision === 1 &&
      value.stage === "pre-candidate" &&
      value.currentCorpusDigest === corpusDigest &&
      value.waveId === null &&
      value.candidateManifestContentHash === null &&
      Array.isArray(value.attempts) &&
      value.attempts.length === 0 &&
      value.predecessorContentHash === null &&
      typeof value.contentHash === "string" &&
      value.contentHash === contentHash(value),
    "holdout-transition-initial-ledger-invalid",
  );
  return value;
}

function waveLedger(
  initial: JsonRecord,
  corpusDigest: string,
  waveId: string,
): JsonRecord {
  const content: JsonRecord = {
    schema: "fractalpark-julia-pixel-holdout-attempt-ledger/v1",
    revision: 1,
    stage: "wave-frozen",
    currentCorpusDigest: corpusDigest,
    waveId,
    candidateManifestContentHash: waveId,
    attempts: [],
    predecessorContentHash: initial.contentHash,
  };
  return { ...content, contentHash: sha(canonicalJson(content)) };
}

function parseAttemptReceipt(
  path: string,
  expected: {
    formulaId: string;
    waveId: string;
    corpusDigest: string;
    result: "pass" | "fail";
    contentHash: string;
  },
): void {
  const value = readJson(path, true);
  invariant(
    exactKeys(value, [
      "schema",
      "revision",
      "authority",
      "formulaId",
      "waveId",
      "candidateManifestContentHash",
      "holdoutCorpusDigest",
      "result",
      "contentHash",
    ]) &&
      value.schema === "fractalpark-julia-pixel-holdout-attempt-receipt/v1" &&
      value.revision === 1 &&
      sealedAuthority(value.authority) &&
      value.formulaId === expected.formulaId &&
      value.waveId === expected.waveId &&
      value.candidateManifestContentHash === expected.waveId &&
      value.holdoutCorpusDigest === expected.corpusDigest &&
      value.result === expected.result &&
      value.contentHash === expected.contentHash &&
      value.contentHash === contentHash(value),
    "holdout-transition-attempt-receipt-invalid",
  );
}

function parseAttemptManifest(
  path: string,
  privateRoot: string,
  candidate: { waveId: string; rows: CandidateRow[] },
  corpusDigest: string,
): JsonRecord[] {
  const value = readJson(path, true);
  invariant(
    exactKeys(value, [
      "schema",
      "revision",
      "authority",
      "waveId",
      "candidateManifestContentHash",
      "rowCount",
      "rows",
      "contentHash",
    ]) &&
      value.schema === "fractalpark-julia-pixel-holdout-attempt-manifest/v1" &&
      value.revision === 1 &&
      sealedAuthority(value.authority) &&
      value.waveId === candidate.waveId &&
      value.candidateManifestContentHash === candidate.waveId &&
      Array.isArray(value.rows) &&
      Number.isInteger(value.rowCount) &&
      value.rowCount === value.rows.length &&
      typeof value.contentHash === "string" &&
      value.contentHash === contentHash(value),
    "holdout-transition-attempt-manifest-invalid",
  );
  const expectedIds = candidate.rows
    .filter((row) => row.rewriteClass === "E1-mathematical-identity")
    .map((row) => row.formulaId);
  const attempts = value.rows.map((row, index) => {
    invariant(
      record(row) &&
        exactKeys(row, [
          "formulaId",
          "attemptNumber",
          "result",
          "receiptFile",
          "receiptContentHash",
        ]) &&
        row.formulaId === expectedIds[index] &&
        row.attemptNumber === 1 &&
        (row.result === "pass" || row.result === "fail") &&
        typeof row.receiptFile === "string" &&
        basename(row.receiptFile) === row.receiptFile &&
        typeof row.receiptContentHash === "string" &&
        SHA256.test(row.receiptContentHash),
      "holdout-transition-attempt-row-invalid",
    );
    parseAttemptReceipt(join(privateRoot, "attempt-receipts", row.receiptFile), {
      formulaId: row.formulaId as string,
      waveId: candidate.waveId,
      corpusDigest,
      result: row.result as "pass" | "fail",
      contentHash: row.receiptContentHash as string,
    });
    return {
      formulaId: row.formulaId,
      attemptNumber: 1,
      result: row.result,
      receiptContentHash: row.receiptContentHash,
    };
  });
  invariant(attempts.length === expectedIds.length, "holdout-transition-attempt-set-incomplete");
  return attempts;
}

function main(): void {
  const args = parseArguments();
  ensurePrivateRoot(args.privateRoot);
  const contract = readJson(CONTRACT_PATH, false);
  invariant(typeof contract.contentHash === "string" && SHA256.test(contract.contentHash), "holdout-transition-contract-invalid");
  const corpus = readJson(join(args.privateRoot, "blind-holdout.v2.json"), true);
  invariant(typeof corpus.contentHash === "string" && SHA256.test(corpus.contentHash), "holdout-transition-corpus-invalid");
  const initial = parseInitialLedger(
    join(args.privateRoot, "attempt-ledger.v2.json"),
    corpus.contentHash,
  );
  const candidate = parseCandidateManifest(
    args.candidateManifestPath,
    contract.contentHash,
  );
  const frozen = waveLedger(initial, corpus.contentHash, candidate.waveId);
  const wavePath = join(args.privateRoot, `attempt-ledger.wave-${candidate.waveId}.json`);
  if (args.command === "freeze-wave") {
    writeExclusive(wavePath, frozen);
    process.stdout.write(
      `${JSON.stringify({ ok: true, stage: "wave-frozen", waveId: candidate.waveId, attemptCount: 0, ledgerContentHash: frozen.contentHash })}\n`,
    );
    return;
  }
  invariant(existsSync(wavePath), "holdout-transition-wave-ledger-missing");
  const installedWave = readJson(wavePath, true);
  invariant(
    canonicalJson(installedWave) === canonicalJson(frozen),
    "holdout-transition-wave-ledger-invalid",
  );
  invariant(args.attemptManifestPath !== null, "holdout-transition-attempt-manifest-missing");
  const attempts = parseAttemptManifest(
    args.attemptManifestPath,
    args.privateRoot,
    candidate,
    corpus.contentHash,
  );
  const content: JsonRecord = {
    schema: "fractalpark-julia-pixel-holdout-attempt-ledger/v1",
    revision: 1,
    stage: "sealed",
    currentCorpusDigest: corpus.contentHash,
    waveId: candidate.waveId,
    candidateManifestContentHash: candidate.waveId,
    attempts,
    predecessorContentHash: frozen.contentHash,
  };
  const sealed = { ...content, contentHash: sha(canonicalJson(content)) };
  const sealedPath = join(
    args.privateRoot,
    `attempt-ledger.sealed-${candidate.waveId}.json`,
  );
  writeExclusive(sealedPath, sealed);
  process.stdout.write(
    `${JSON.stringify({ ok: true, stage: "sealed", waveId: candidate.waveId, attemptCount: attempts.length, ledgerContentHash: sealed.contentHash })}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ ok: false, code: error instanceof Error ? error.message : "holdout-transition-failed" })}\n`,
  );
  process.exitCode = 1;
}
