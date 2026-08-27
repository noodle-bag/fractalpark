import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PRIVATE_ROOT = join(
  ROOT,
  ".formula-library-private/formula-library-v1/julia-pixel-recovery-v1",
);
const CURRENT_PATH = join(PRIVATE_ROOT, "blind-holdout.v2.json");
const HISTORICAL_PATHS = Object.freeze([
  join(PRIVATE_ROOT, "blind-holdout.v1.json"),
]);
const HISTORY_PATH = join(PRIVATE_ROOT, "blind-holdout-history.v2.json");
const ATTEMPT_LEDGER_PATH = join(PRIVATE_ROOT, "attempt-ledger.v2.json");
const GENERATOR_PATH = join(ROOT, "scripts/generate-julia-pixel-blind-holdout.ts");
const STATE_SEALER_PATH = join(
  ROOT,
  "scripts/seal-julia-pixel-blind-holdout-state.ts",
);
const CORPUS_SCHEMA = "fractalpark-julia-pixel-blind-holdout/v1";
const HISTORY_SCHEMA = "fractalpark-julia-pixel-blind-holdout-history/v1";
const ATTEMPT_SCHEMA = "fractalpark-julia-pixel-holdout-attempt-ledger/v1";
const CASE_COUNT = 48;
const DEPTHS = Object.freeze([3, 5, 7, 12, 24, 48, 96, 127] as const);
const SHA256 = /^[a-f0-9]{64}$/;
const UUID_V5 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

type JsonRecord = Record<string, unknown>;
type HoldoutCase = Readonly<{
  caseKey: string;
  point: readonly [number, number];
  juliaConstant: readonly [number, number];
  depth: number;
}>;

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join("|") === [...expected].sort().join("|");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number") {
    invariant(Number.isFinite(value), "holdout-verifier-non-finite");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  invariant(record(value), "holdout-verifier-canonical-invalid");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function digest(seed: Buffer, label: string, index: number): Buffer {
  return createHash("sha256")
    .update(seed)
    .update(Buffer.from([0]))
    .update(label)
    .update(Buffer.from([0]))
    .update(String(index))
    .digest();
}

function unit(value: Buffer, offset: number): number {
  return value.readUInt32BE(offset) / 0x1_0000_0000;
}

function bounded(value: number, minimum: number, maximum: number): number {
  return Math.fround(minimum + (maximum - minimum) * value);
}

function rebuildCases(seedHex: string): readonly HoldoutCase[] {
  invariant(SHA256.test(seedHex), "holdout-verifier-seed-invalid");
  const seed = Buffer.from(seedHex, "hex");
  return Array.from({ length: CASE_COUNT }, (_, index) => {
    const bytes = digest(seed, "julia-pixel-blind-holdout-v1", index);
    const unsigned = {
      point: [
        bounded(unit(bytes, 0), -1.25, 1.25),
        bounded(unit(bytes, 4), -1, 1),
      ] as const,
      juliaConstant: [
        bounded(unit(bytes, 8), -0.9, 0.9),
        bounded(unit(bytes, 12), -0.9, 0.9),
      ] as const,
      depth: DEPTHS[bytes[16]! % DEPTHS.length]!,
    };
    return {
      caseKey: sha256(canonicalJson(unsigned)),
      ...unsigned,
    };
  });
}

function stablePrivateJson(path: string): JsonRecord {
  const before = lstatSync(path);
  invariant(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      (before.mode & 0o777) === 0o600,
    "holdout-verifier-file-invalid",
  );
  const bytes = readFileSync(path, "utf8");
  const after = lstatSync(path);
  invariant(
    before.dev === after.dev &&
      before.ino === after.ino &&
      before.size === after.size &&
      before.mtimeMs === after.mtimeMs &&
      after.nlink === 1 &&
      (after.mode & 0o777) === 0o600,
    "holdout-verifier-file-raced",
  );
  const value: unknown = JSON.parse(bytes);
  invariant(record(value), "holdout-verifier-document-invalid");
  return value;
}

function verifyCorpus(path: string, current: boolean) {
  const value = stablePrivateJson(path);
  invariant(
    exactKeys(value, [
      "schema",
      "revision",
      "generatorRevision",
      "seedHex",
      "caseCount",
      "cases",
      "caseKeySetDigest",
      "contentHash",
    ]) &&
      value.schema === CORPUS_SCHEMA &&
      value.revision === 1 &&
      typeof value.generatorRevision === "string" &&
      SHA256.test(value.generatorRevision) &&
      (!current || value.generatorRevision === sha256(readFileSync(GENERATOR_PATH))) &&
      typeof value.seedHex === "string" &&
      SHA256.test(value.seedHex) &&
      value.caseCount === CASE_COUNT &&
      Array.isArray(value.cases) &&
      value.cases.length === CASE_COUNT &&
      typeof value.caseKeySetDigest === "string" &&
      SHA256.test(value.caseKeySetDigest) &&
      typeof value.contentHash === "string" &&
      SHA256.test(value.contentHash),
    "holdout-verifier-document-invalid",
  );
  const expectedCases = rebuildCases(value.seedHex);
  invariant(
    canonicalJson(value.cases) === canonicalJson(expectedCases),
    "holdout-verifier-case-drift",
  );
  const caseKeys = expectedCases.map((entry) => entry.caseKey).sort();
  invariant(
    new Set(caseKeys).size === CASE_COUNT &&
      value.caseKeySetDigest === sha256(canonicalJson(caseKeys)),
    "holdout-verifier-case-key-set-invalid",
  );
  const content = { ...value };
  delete content.contentHash;
  invariant(
    value.contentHash === sha256(canonicalJson(content)),
    "holdout-verifier-content-hash-invalid",
  );
  return Object.freeze({
    generatorRevision: value.generatorRevision,
    sealedCorpusDigest: value.contentHash,
    caseKeySetDigest: value.caseKeySetDigest,
    caseCount: CASE_COUNT,
    caseKeys: new Set(caseKeys),
  });
}

function verifyHistory(
  current: ReturnType<typeof verifyCorpus>,
  historical: readonly ReturnType<typeof verifyCorpus>[],
): string {
  const value = stablePrivateJson(HISTORY_PATH);
  invariant(
    exactKeys(value, [
      "schema",
      "revision",
      "current",
      "historical",
      "caseKeyIntersectionCount",
      "contentHash",
    ]) &&
      value.schema === HISTORY_SCHEMA &&
      value.revision === 1 &&
      record(value.current) &&
      Array.isArray(value.historical) &&
      value.historical.length === historical.length &&
      value.caseKeyIntersectionCount === 0 &&
      typeof value.contentHash === "string" &&
      SHA256.test(value.contentHash),
    "holdout-verifier-history-invalid",
  );
  const projection = (entry: ReturnType<typeof verifyCorpus>) => ({
    corpusDigest: entry.sealedCorpusDigest,
    generatorRevision: entry.generatorRevision,
    caseKeySetDigest: entry.caseKeySetDigest,
    caseCount: entry.caseCount,
  });
  invariant(
    canonicalJson(value.current) === canonicalJson(projection(current)) &&
      canonicalJson(value.historical) ===
        canonicalJson(historical.map(projection)),
    "holdout-verifier-history-binding-invalid",
  );
  const content = { ...value };
  delete content.contentHash;
  invariant(
    sha256(canonicalJson(content)) === value.contentHash,
    "holdout-verifier-history-content-hash-invalid",
  );
  return value.contentHash;
}

function verifyAttemptLedger(currentDigest: string): {
  contentHash: string;
  attemptCount: number;
} {
  const value = stablePrivateJson(ATTEMPT_LEDGER_PATH);
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
      value.schema === ATTEMPT_SCHEMA &&
      value.revision === 1 &&
      ["pre-candidate", "wave-frozen", "sealed"].includes(value.stage as string) &&
      value.currentCorpusDigest === currentDigest &&
      Array.isArray(value.attempts) &&
      typeof value.contentHash === "string" &&
      SHA256.test(value.contentHash),
    "holdout-verifier-attempt-ledger-invalid",
  );
  if (value.stage === "pre-candidate") {
    invariant(
      value.waveId === null &&
        value.candidateManifestContentHash === null &&
        value.attempts.length === 0 &&
        value.predecessorContentHash === null,
      "holdout-verifier-attempt-ledger-pre-candidate-invalid",
    );
  } else {
    invariant(
      typeof value.waveId === "string" &&
        SHA256.test(value.waveId) &&
        typeof value.candidateManifestContentHash === "string" &&
        SHA256.test(value.candidateManifestContentHash) &&
        typeof value.predecessorContentHash === "string" &&
        SHA256.test(value.predecessorContentHash),
      "holdout-verifier-attempt-ledger-wave-invalid",
    );
  }
  let previousFormulaId: string | undefined;
  for (const attempt of value.attempts) {
    invariant(
      record(attempt) &&
        exactKeys(attempt, [
          "formulaId",
          "attemptNumber",
          "result",
          "receiptContentHash",
        ]) &&
        typeof attempt.formulaId === "string" &&
        UUID_V5.test(attempt.formulaId) &&
        attempt.attemptNumber === 1 &&
        (attempt.result === "pass" || attempt.result === "fail") &&
        typeof attempt.receiptContentHash === "string" &&
        SHA256.test(attempt.receiptContentHash) &&
        (previousFormulaId === undefined || previousFormulaId < attempt.formulaId),
      "holdout-verifier-attempt-row-invalid",
    );
    previousFormulaId = attempt.formulaId;
  }
  invariant(
    value.stage !== "wave-frozen" || value.attempts.length === 0,
    "holdout-verifier-attempt-ledger-wave-frozen-invalid",
  );
  const content = { ...value };
  delete content.contentHash;
  invariant(
    sha256(canonicalJson(content)) === value.contentHash,
    "holdout-verifier-attempt-ledger-content-hash-invalid",
  );
  return { contentHash: value.contentHash, attemptCount: value.attempts.length };
}

function main(): void {
  const current = verifyCorpus(CURRENT_PATH, true);
  const historical = HISTORICAL_PATHS.map((path) => verifyCorpus(path, false));
  invariant(
    new Set(historical.map((entry) => entry.sealedCorpusDigest)).size ===
      historical.length,
    "holdout-verifier-history-duplicate",
  );
  let intersectionCount = 0;
  for (const prior of historical)
    for (const caseKey of current.caseKeys)
      if (prior.caseKeys.has(caseKey)) intersectionCount += 1;
  invariant(intersectionCount === 0, "holdout-verifier-history-overlap");
  const historyManifestDigest = verifyHistory(current, historical);
  const attemptLedger = verifyAttemptLedger(current.sealedCorpusDigest);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      schema: CORPUS_SCHEMA,
      generatorRevision: current.generatorRevision,
      verifierRevision: sha256(readFileSync(__filename)),
      stateSealerRevision: sha256(readFileSync(STATE_SEALER_PATH)),
      sealedCorpusDigest: current.sealedCorpusDigest,
      caseKeySetDigest: current.caseKeySetDigest,
      caseCount: current.caseCount,
      historicalCorpusDigests: historical.map(
        (entry) => entry.sealedCorpusDigest,
      ),
      historicalGeneratorRevisions: historical.map(
        (entry) => entry.generatorRevision,
      ),
      historicalCaseKeySetDigests: historical.map(
        (entry) => entry.caseKeySetDigest,
      ),
      historicalCaseCounts: historical.map((entry) => entry.caseCount),
      caseKeyIntersectionCount: intersectionCount,
      historyManifestDigest,
      attemptLedgerDigest: attemptLedger.contentHash,
      attemptCount: attemptLedger.attemptCount,
    })}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      code:
        error instanceof Error
          ? error.message
          : "holdout-independent-verification-failed",
    })}\n`,
  );
  process.exitCode = 1;
}
