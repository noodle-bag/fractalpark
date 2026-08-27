import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
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
const HISTORY_SCHEMA = "fractalpark-julia-pixel-blind-holdout-history/v1";
const ATTEMPT_SCHEMA = "fractalpark-julia-pixel-holdout-attempt-ledger/v1";
const SHA256 = /^[a-f0-9]{64}$/;
const UUID_V5 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

type JsonRecord = Record<string, unknown>;
type CorpusProjection = Readonly<{
  contentHash: string;
  generatorRevision: string;
  caseKeySetDigest: string;
  caseCount: number;
  caseKeys: readonly string[];
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
    invariant(Number.isFinite(value), "holdout-state-non-finite");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  invariant(record(value), "holdout-state-canonical-invalid");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function secureJson(path: string): unknown {
  const stat = lstatSync(path);
  invariant(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.nlink === 1 &&
      (stat.mode & 0o777) === 0o600,
    "holdout-state-private-file-invalid",
  );
  return JSON.parse(readFileSync(path, "utf8"));
}

function corpusProjection(path: string): CorpusProjection {
  const value = secureJson(path);
  invariant(
    record(value) &&
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
      value.schema === "fractalpark-julia-pixel-blind-holdout/v1" &&
      value.revision === 1 &&
      typeof value.generatorRevision === "string" &&
      SHA256.test(value.generatorRevision) &&
      typeof value.seedHex === "string" &&
      SHA256.test(value.seedHex) &&
      Number.isSafeInteger(value.caseCount) &&
      (value.caseCount as number) > 0 &&
      Array.isArray(value.cases) &&
      value.cases.length === value.caseCount &&
      typeof value.caseKeySetDigest === "string" &&
      SHA256.test(value.caseKeySetDigest) &&
      typeof value.contentHash === "string" &&
      SHA256.test(value.contentHash),
    "holdout-state-corpus-invalid",
  );
  const caseKeys = value.cases.map((entry) => {
    invariant(
      record(entry) && typeof entry.caseKey === "string" && SHA256.test(entry.caseKey),
      "holdout-state-case-invalid",
    );
    return entry.caseKey;
  });
  invariant(
    new Set(caseKeys).size === caseKeys.length &&
      sha256(canonicalJson([...caseKeys].sort())) === value.caseKeySetDigest,
    "holdout-state-case-set-invalid",
  );
  const content = { ...value };
  delete content.contentHash;
  invariant(
    sha256(canonicalJson(content)) === value.contentHash,
    "holdout-state-corpus-content-hash-invalid",
  );
  return Object.freeze({
    contentHash: value.contentHash,
    generatorRevision: value.generatorRevision,
    caseKeySetDigest: value.caseKeySetDigest,
    caseCount: value.caseCount as number,
    caseKeys: Object.freeze(caseKeys),
  });
}

function historyDocument(
  current: CorpusProjection,
  historical: readonly CorpusProjection[],
) {
  const currentKeys = new Set(current.caseKeys);
  const intersectionCount = historical.reduce(
    (count, corpus) =>
      count + corpus.caseKeys.filter((caseKey) => currentKeys.has(caseKey)).length,
    0,
  );
  invariant(intersectionCount === 0, "holdout-state-case-key-reuse");
  const content = {
    schema: HISTORY_SCHEMA,
    revision: 1,
    current: {
      corpusDigest: current.contentHash,
      generatorRevision: current.generatorRevision,
      caseKeySetDigest: current.caseKeySetDigest,
      caseCount: current.caseCount,
    },
    historical: historical.map((corpus) => ({
      corpusDigest: corpus.contentHash,
      generatorRevision: corpus.generatorRevision,
      caseKeySetDigest: corpus.caseKeySetDigest,
      caseCount: corpus.caseCount,
    })),
    caseKeyIntersectionCount: intersectionCount,
  };
  return Object.freeze({
    ...content,
    contentHash: sha256(canonicalJson(content)),
  });
}

function initialAttemptLedger(current: CorpusProjection) {
  const content = {
    schema: ATTEMPT_SCHEMA,
    revision: 1,
    stage: "pre-candidate",
    currentCorpusDigest: current.contentHash,
    waveId: null,
    candidateManifestContentHash: null,
    attempts: [],
    predecessorContentHash: null,
  };
  return Object.freeze({
    ...content,
    contentHash: sha256(canonicalJson(content)),
  });
}

function writeExclusive(path: string, value: unknown): void {
  let descriptor: number | null = null;
  let created = false;
  try {
    descriptor = openSync(
      path,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    created = true;
    fchmodSync(descriptor, 0o600);
    invariant(
      fstatSync(descriptor).isFile() && fstatSync(descriptor).nlink === 1,
      "holdout-state-output-invalid",
    );
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
  } catch (error) {
    if (created) {
      try {
        unlinkSync(path);
      } catch {
        // Preserve the primary fail-closed error.
      }
    }
    throw error;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function installOrVerify(path: string, value: unknown, write: boolean): void {
  if (!existsSync(path)) {
    invariant(write, "holdout-state-output-missing");
    writeExclusive(path, value);
  }
  const actual = secureJson(path);
  invariant(
    canonicalJson(actual) === canonicalJson(value),
    "holdout-state-output-drift",
  );
}

function validateAttemptLedger(value: unknown, currentDigest: string): string {
  invariant(
    record(value) &&
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
    "holdout-attempt-ledger-invalid",
  );
  if (value.stage === "pre-candidate") {
    invariant(
      value.waveId === null &&
        value.candidateManifestContentHash === null &&
        value.attempts.length === 0 &&
        value.predecessorContentHash === null,
      "holdout-attempt-ledger-pre-candidate-invalid",
    );
  } else {
    invariant(
      typeof value.waveId === "string" &&
        SHA256.test(value.waveId) &&
        typeof value.candidateManifestContentHash === "string" &&
        SHA256.test(value.candidateManifestContentHash) &&
        typeof value.predecessorContentHash === "string" &&
        SHA256.test(value.predecessorContentHash),
      "holdout-attempt-ledger-wave-invalid",
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
      "holdout-attempt-ledger-row-invalid",
    );
    previousFormulaId = attempt.formulaId;
  }
  invariant(
    value.stage !== "wave-frozen" || value.attempts.length === 0,
    "holdout-attempt-ledger-wave-frozen-invalid",
  );
  const content = { ...value };
  delete content.contentHash;
  invariant(
    sha256(canonicalJson(content)) === value.contentHash,
    "holdout-attempt-ledger-content-hash-invalid",
  );
  return value.contentHash;
}

function main(): void {
  const write = process.argv.includes("--write");
  const current = corpusProjection(CURRENT_PATH);
  const historical = HISTORICAL_PATHS.map(corpusProjection);
  const history = historyDocument(current, historical);
  const initialLedger = initialAttemptLedger(current);
  installOrVerify(HISTORY_PATH, history, write);
  installOrVerify(ATTEMPT_LEDGER_PATH, initialLedger, write);
  const installedHistory = secureJson(HISTORY_PATH);
  invariant(
    canonicalJson(installedHistory) === canonicalJson(history),
    "holdout-state-history-invalid",
  );
  const installedLedger = secureJson(ATTEMPT_LEDGER_PATH);
  const attemptLedgerDigest = validateAttemptLedger(
    installedLedger,
    current.contentHash,
  );
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      currentCorpusDigest: current.contentHash,
      currentGeneratorRevision: current.generatorRevision,
      currentCaseKeySetDigest: current.caseKeySetDigest,
      currentCaseCount: current.caseCount,
      historicalCorpusDigests: historical.map((entry) => entry.contentHash),
      historicalGeneratorRevisions: historical.map(
        (entry) => entry.generatorRevision,
      ),
      historicalCaseKeySetDigests: historical.map(
        (entry) => entry.caseKeySetDigest,
      ),
      historicalCaseCounts: historical.map((entry) => entry.caseCount),
      caseKeyIntersectionCount: 0,
      historyManifestDigest: history.contentHash,
      attemptLedgerDigest,
      attemptCount: 0,
    })}\n`,
  );
}

try {
  main();
} catch (error) {
  const code = error instanceof Error ? error.message : "holdout-state-failed";
  process.stderr.write(`${JSON.stringify({ ok: false, code })}\n`);
  process.exitCode = 1;
}
