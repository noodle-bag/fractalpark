import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  chmodSync,
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
import { dirname, join } from "node:path";

const ROOT = process.cwd();
const DEFAULT_OUTPUT = join(
  ROOT,
  ".formula-library-private/formula-library-v1/julia-pixel-recovery-v1/blind-holdout.v2.json",
);
const SCHEMA = "fractalpark-julia-pixel-blind-holdout/v1";
const CASE_COUNT = 48;
const DEPTHS = Object.freeze([3, 5, 7, 12, 24, 48, 96, 127] as const);

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

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number") {
    invariant(Number.isFinite(value), "holdout-non-finite");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  invariant(record(value), "holdout-canonical-invalid");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function generatorRevision(): string {
  return sha256(readFileSync(__filename));
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

function casesForSeed(seedHex: string): readonly HoldoutCase[] {
  invariant(/^[a-f0-9]{64}$/.test(seedHex), "holdout-seed-invalid");
  const seed = Buffer.from(seedHex, "hex");
  const cases = Array.from({ length: CASE_COUNT }, (_, index) => {
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
    return Object.freeze({
      caseKey: sha256(canonicalJson(unsigned)),
      ...unsigned,
    });
  });
  invariant(
    new Set(cases.map((entry) => entry.caseKey)).size === CASE_COUNT,
    "holdout-case-key-collision",
  );
  return Object.freeze(cases);
}

function build(seedHex: string) {
  const cases = casesForSeed(seedHex);
  const content = {
    schema: SCHEMA,
    revision: 1,
    generatorRevision: generatorRevision(),
    seedHex,
    caseCount: cases.length,
    cases,
    caseKeySetDigest: sha256(
      canonicalJson(cases.map((entry) => entry.caseKey).sort()),
    ),
  };
  return Object.freeze({
    ...content,
    contentHash: sha256(canonicalJson(content)),
  });
}

function parseExisting(path: string): ReturnType<typeof build> {
  const stat = lstatSync(path);
  invariant(
    stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1,
    "holdout-file-invalid",
  );
  invariant((stat.mode & 0o777) === 0o600, "holdout-mode-invalid");
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  invariant(record(value), "holdout-document-invalid");
  invariant(typeof value.seedHex === "string", "holdout-document-invalid");
  const expected = build(value.seedHex);
  invariant(
    canonicalJson(value) === canonicalJson(expected),
    "holdout-document-drift",
  );
  return expected;
}

function writeImmutable(path: string, value: ReturnType<typeof build>): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  chmodSync(dirname(path), 0o700);
  const parent = lstatSync(dirname(path));
  invariant(
    parent.isDirectory() &&
      !parent.isSymbolicLink() &&
      (parent.mode & 0o777) === 0o700,
    "holdout-parent-invalid",
  );
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
    const opened = fstatSync(descriptor);
    invariant(
      opened.isFile() && opened.nlink === 1,
      "holdout-created-file-invalid",
    );
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
    const complete = fstatSync(descriptor);
    invariant(
      complete.isFile() &&
        complete.nlink === 1 &&
        (complete.mode & 0o777) === 0o600,
      "holdout-created-file-invalid",
    );
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    if (created && !existsSync(path)) created = false;
    if (created) {
      try {
        parseExisting(path);
      } catch (error) {
        unlinkSync(path);
        throw error;
      }
    }
  }
}

function argumentValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main(): void {
  const output = argumentValue("--output") ?? DEFAULT_OUTPUT;
  const write = process.argv.includes("--write");
  let artifact: ReturnType<typeof build>;
  if (existsSync(output)) artifact = parseExisting(output);
  else {
    invariant(write, "holdout-missing");
    const created = build(randomBytes(32).toString("hex"));
    try {
      writeImmutable(output, created);
    } catch (error) {
      const code = record(error) ? error.code : undefined;
      if (code !== "EEXIST") throw error;
    }
    artifact = parseExisting(output);
  }
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      schema: artifact.schema,
      generatorRevision: artifact.generatorRevision,
      sealedCorpusDigest: artifact.contentHash,
      caseKeySetDigest: artifact.caseKeySetDigest,
      caseCount: artifact.caseCount,
    })}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      code: error instanceof Error ? error.message : "holdout-generation-failed",
    })}\n`,
  );
  process.exitCode = 1;
}
