import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { generateCleanRoomEvidence } from "../../scripts/generate-formula-clean-room-evidence";
import { verifyCleanRoomEvidence } from "../../scripts/verify-formula-clean-room-evidence";

const integrationIt = process.env.FRACTALPARK_FORMULA_HANDOFF ? it : it.skip;

type JsonRecord = { [key: string]: unknown };

function isRecord(value: unknown): value is JsonRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isRecord(value)) throw new TypeError("non-canonical test fixture");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

describe.sequential("clean-room evidence private integration", () => {
  integrationIt(
    "generates and independently verifies, then rejects a rehashed semantic tamper",
    () => {
      const repositoryRoot = process.cwd();
      const manifestPath = join(
        repositoryRoot,
        ".formula-library-private",
        "formula-library-v1",
        "clean-room-evidence-v1",
        "manifest.json",
      );

      const generated = generateCleanRoomEvidence(repositoryRoot);
      expect(generated).toMatchObject({
        rightsProvenanceClassificationBound: 452,
        privateProvenanceEvidenceBound: 452,
        sourceOracleEvidenceBound: 452,
        technicalFailedMissingInput: 452,
        implementationAuthorized: 0,
        candidateAdmitted: 0,
      });
      const verified = verifyCleanRoomEvidence(repositoryRoot);
      expect(verified.manifestContentHash).toBe(generated.manifestContentHash);

      const original = readFileSync(manifestPath);
      try {
        const manifest = JSON.parse(original.toString("utf8")) as JsonRecord;
        expect(Array.isArray(manifest.rows)).toBe(true);
        const rows = manifest.rows as JsonRecord[];
        const first = rows[0];
        expect(isRecord(first)).toBe(true);
        first.sourceOracleStatus =
          first.sourceOracleStatus === "waiver-probe-not-executable-oracle"
            ? "legacy-compatibility-orbit-oracle-available"
            : "waiver-probe-not-executable-oracle";
        const rowBody = { ...first };
        delete rowBody.rowProjectionHash;
        first.rowProjectionHash = sha256Canonical({
          inputHashes: manifest.inputHashes,
          row: rowBody,
        });
        const manifestBody = { ...manifest };
        delete manifestBody.manifestContentHash;
        manifest.manifestContentHash = sha256Canonical(manifestBody);
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
          mode: 0o600,
        });
        chmodSync(manifestPath, 0o600);
        expect(() => verifyCleanRoomEvidence(repositoryRoot)).toThrow();
      } finally {
        writeFileSync(manifestPath, original, { mode: 0o600 });
        chmodSync(manifestPath, 0o600);
      }

      const replacementPath = `${manifestPath}.replacement`;
      try {
        expect(() =>
          verifyCleanRoomEvidence(repositoryRoot, () => {
            writeFileSync(replacementPath, original, { mode: 0o600 });
            chmodSync(replacementPath, 0o600);
            renameSync(replacementPath, manifestPath);
          }),
        ).toThrow();
      } finally {
        try {
          unlinkSync(replacementPath);
        } catch {
          // The atomic replacement consumes this path on the expected branch.
        }
        writeFileSync(manifestPath, original, { mode: 0o600 });
        chmodSync(manifestPath, 0o600);
      }

      try {
        expect(() =>
          verifyCleanRoomEvidence(repositoryRoot, undefined, () => {
            writeFileSync(replacementPath, original, { mode: 0o600 });
            chmodSync(replacementPath, 0o600);
            renameSync(replacementPath, manifestPath);
          }),
        ).toThrow();
      } finally {
        try {
          unlinkSync(replacementPath);
        } catch {
          // The late atomic replacement consumes this path on the expected branch.
        }
        writeFileSync(manifestPath, original, { mode: 0o600 });
        chmodSync(manifestPath, 0o600);
      }

      const outputDirectory = dirname(manifestPath);
      const movedOutputDirectory = `${outputDirectory}.moved`;
      try {
        expect(() =>
          verifyCleanRoomEvidence(repositoryRoot, undefined, () => {
            renameSync(outputDirectory, movedOutputDirectory);
            mkdirSync(outputDirectory, { mode: 0o700 });
            writeFileSync(manifestPath, original, { mode: 0o600 });
            chmodSync(manifestPath, 0o600);
          }),
        ).toThrow();
      } finally {
        rmSync(outputDirectory, { force: true, recursive: true });
        renameSync(movedOutputDirectory, outputDirectory);
      }

      expect(verifyCleanRoomEvidence(repositoryRoot).manifestContentHash).toBe(
        generated.manifestContentHash,
      );
    },
  );
});
