import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { NATIVE_FORMULA_RECIPES_V1 } from "../src/engine/formulas/v1/native-recipes";
import { NATIVE_RECIPE_HOLDS_V1 } from "../src/engine/formulas/v1/native-recipes-b94-held";

/**
 * Independent accounting verifier for the frozen publication decision ledger.
 * It imports neither the generator nor the engine validator: every invariant
 * is recomputed from raw bytes — the committed public asset, the public
 * identity manifest, the frozen private work-package handoff, and (since
 * decision revision 2) the pinned private census ledger. The native-recipe
 * registry and diagnosis-held list are imported as evidence data only; the
 * publish selection is recomputed here, never taken from the generator.
 * A pass is accounting evidence only; it never authorizes implementation or
 * publication.
 */

const EXPECTED_WORK_PACKAGE_HASH =
  "29d4501d05f712f154d11809414876f9625c5efa202885579080d61fa88633bd";
/**
 * Census rerun on the guarded engine (commit 783a8fc): the revision-2
 * A-class publish set is exactly the `passed` rows of this ledger. The hash
 * is recomputed here from raw bytes with this script's own canonical JSON.
 */
const EXPECTED_CENSUS_LEDGER_HASH =
  "fa7f6b35cd7e9d5afa77754755d3439ea949c7be2964024a4163a3874e9a5a37";
const EXPECTED_REV2_PUBLISH_COUNT = 174;
const EXPECTED_B94_HELD_COUNT = 21;
/**
 * Decision revision 3 pins (2026-08-19): the final census over all 378
 * oracle/waiver rows under the hardened webgl-rev2 toolchain (Codex R3-R6
 * closed, R6 PASS) and the clean-room release manifest rebuilt from it
 * (339 admitted rows: 331 bulk accepted + 8 pilot carryover; 5 kill-held
 * demoted fail-closed). The rev3 publish set = rev2's 174 (unchanged) +
 * these 339 class-C clean-room rows.
 */
const EXPECTED_FINAL_CENSUS_HASH =
  "6de7caa2c1921db8f4e9a851fce6cd281dd77dd2c1fc1d44ba20f63132ef2e95";
const EXPECTED_RELEASE_MANIFEST_HASH =
  "0dc2a95de29e939987db5cedc84685c6b5a027d2ae24db780c95a3f3d5ea849f";
const EXPECTED_CLEANROOM_PUBLISH_COUNT = 339;
const EXPECTED_REV3_PUBLISH_COUNT = 513;
const BASIS_RECORDED_AT = "2026-08-18T00:05:00.000Z";
const REVIEWED_AT = "2026-08-18";
const CENSUS_LEDGER_RELATIVE_PATH = join(
  ".formula-library-private",
  "formula-library-v1",
  "bulk-migration-ledger.json",
);
const FINAL_CENSUS_RELATIVE_PATH = join(
  ".formula-library-private",
  "formula-library-v1",
  "clean-room-bulk-v1",
  "final-census-ledger.json",
);
const RELEASE_MANIFEST_RELATIVE_PATH = join(
  ".formula-library-private",
  "formula-library-v1",
  "clean-room-bulk-v1",
  "release-manifest-rev3.json",
);
const RUNTIME_REV3_RELATIVE_DIR = join(
  "resources",
  "formula-library",
  "v1",
  "runtime",
  "rev3",
);
const WORK_PACKAGE_START =
  "<!-- BEGIN STANDARD_MIGRATION_WORK_PACKAGES_JSON -->";
const SCHEMA = "fractalpark-formula-library-publication-decisions/v1";
const SHA256 = /^[a-f0-9]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const UUID_V5 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const RIGHTS_STATUSES = [
  "project-owned",
  "source-declared-public-domain-assumption",
  "gpl-3.0-only",
  "no-explicit-permission",
] as const;
const DECISIONS = ["publish", "hold", "exclude"] as const;
const BASES = [
  "project-owned",
  "direct-adaptation",
  "separated-independent-rewrite",
] as const;
const SCAN_STATUSES = ["not-applicable", "pending", "passed", "failed"] as const;
const EXPECTED_RIGHTS_COUNTS: Readonly<Record<string, number>> = {
  "project-owned": 89,
  "source-declared-public-domain-assumption": 137,
  "gpl-3.0-only": 73,
  "no-explicit-permission": 378,
};
const CLASS_TO_RIGHTS_STATUS: Readonly<Record<string, string>> = {
  P: "project-owned",
  A: "source-declared-public-domain-assumption",
  B: "gpl-3.0-only",
  C: "no-explicit-permission",
};
const GPL_FIXED_HOLD_REASON = "held-license-gpl-3.0-only";
const TOP_LEVEL_KEYS = [
  "schema",
  "version",
  "decisionRevision",
  "formulaCount",
  "identityBinding",
  "rightsStatusCounts",
  "decisionCounts",
  "rows",
  "contentHash",
];
const ROW_KEYS = [
  "formulaId",
  "rightsStatus",
  "publicationDecision",
  "decisionReason",
  "implementationBasis",
  "implementationBasisRecordedAt",
  "leakageScanStatus",
  "reviewedAt",
];

type JsonRecord = Record<string, unknown>;

function fail(): never {
  throw new Error("verification-invalid");
}

function invariant(condition: unknown): asserts condition {
  if (!condition) fail();
}

function isRecord(value: unknown): value is JsonRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.getOwnPropertySymbols(value).length === 0
  );
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  return (
    Array.isArray(value) &&
    Object.keys(value).length === value.length &&
    Object.getOwnPropertySymbols(value).length === 0
  );
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return true;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    if (typeof value === "string") invariant(!hasLoneSurrogate(value));
    if (typeof value === "number") invariant(Number.isFinite(value));
    return JSON.stringify(value);
  }
  if (isDenseArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  invariant(isRecord(value));
  return `{${Object.keys(value)
    .sort()
    .map((key) => {
      invariant(!hasLoneSurrogate(key));
      return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
    })
    .join(",")}}`;
}

function sha256Bytes(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function readStableFile(path: string, requirePrivateMode: boolean): Buffer {
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    fail();
  }
  try {
    const opened = fstatSync(descriptor);
    invariant(
      opened.isFile() &&
        opened.nlink === 1 &&
        (!requirePrivateMode || (opened.mode & 0o777) === 0o600),
    );
    const bytes = readFileSync(descriptor);
    const afterRead = fstatSync(descriptor);
    const current = lstatSync(path);
    invariant(
      afterRead.isFile() &&
        afterRead.dev === opened.dev &&
        afterRead.ino === opened.ino &&
        afterRead.nlink === 1 &&
        afterRead.size === opened.size &&
        afterRead.mtimeMs === opened.mtimeMs &&
        afterRead.ctimeMs === opened.ctimeMs &&
        current.isFile() &&
        !current.isSymbolicLink() &&
        current.dev === opened.dev &&
        current.ino === opened.ino &&
        current.nlink === 1 &&
        (!requirePrivateMode || (current.mode & 0o777) === 0o600),
    );
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function extractWorkPackage(): JsonRecord {
  const path = process.env.FRACTALPARK_FORMULA_HANDOFF;
  invariant(path);
  try {
    const markdown = readStableFile(path, true).toString("utf8");
    const marker = markdown.indexOf(WORK_PACKAGE_START);
    const start = markdown.indexOf("{", marker);
    const end = markdown.indexOf("```", start);
    invariant(marker >= 0 && start > marker && end > start);
    const parsed = JSON.parse(markdown.slice(start, end)) as unknown;
    invariant(isRecord(parsed));
    return parsed;
  } catch {
    fail();
  }
}

function verifyPublicationDecisions(repositoryRoot: string): {
  published: number;
  held: number;
  excluded: number;
  gplHeld: number;
  contentHash: string;
  assetSha256: string;
} {
  const assetPath = join(
    repositoryRoot,
    "resources",
    "formula-library",
    "v1",
    "publication-decisions.json",
  );
  const identityPath = join(
    repositoryRoot,
    "resources",
    "formula-library",
    "v1",
    "standard-formula-ids.json",
  );
  const assetBytes = readStableFile(assetPath, false);
  const identityBytes = readStableFile(identityPath, false);
  const asset = JSON.parse(assetBytes.toString("utf8")) as unknown;
  const identities = JSON.parse(identityBytes.toString("utf8")) as unknown;
  invariant(
    isRecord(asset) &&
      exactKeys(asset, TOP_LEVEL_KEYS) &&
      asset.schema === SCHEMA &&
      asset.version === 1 &&
      (asset.decisionRevision === 2 || asset.decisionRevision === 3) &&
      asset.formulaCount === 677 &&
      typeof asset.contentHash === "string" &&
      SHA256.test(asset.contentHash),
  );
  const decisionRevision = asset.decisionRevision as 2 | 3;
  invariant(
    isRecord(asset.identityBinding) &&
      exactKeys(asset.identityBinding, ["standardFormulaIdsSha256"]) &&
      asset.identityBinding.standardFormulaIdsSha256 ===
        sha256Bytes(identityBytes),
  );
  invariant(
    isRecord(identities) &&
      identities.formulaCount === 677 &&
      isDenseArray(identities.formulas) &&
      identities.formulas.length === 677,
  );
  const identityIds = identities.formulas.map((row) => {
    invariant(isRecord(row) && typeof row.formulaId === "string");
    return row.formulaId;
  });
  const sortedIdentityIds = [...identityIds].sort();
  invariant(
    isRecord(asset.rightsStatusCounts) &&
      exactKeys(asset.rightsStatusCounts, RIGHTS_STATUSES) &&
      isRecord(asset.decisionCounts) &&
      exactKeys(asset.decisionCounts, DECISIONS) &&
      isDenseArray(asset.rows) &&
      asset.rows.length === 677,
  );

  const unsigned = { ...asset };
  delete unsigned.contentHash;
  invariant(sha256Bytes(canonicalJson(unsigned)) === asset.contentHash);

  const seen = new Set<string>();
  const rightsCounts = new Map<string, number>();
  const decisionCounts = new Map<string, number>();
  const statusById = new Map<string, string>();
  let gplHeld = 0;
  for (let index = 0; index < 677; index++) {
    const row = asset.rows[index];
    invariant(isRecord(row) && exactKeys(row, ROW_KEYS));
    const {
      formulaId,
      rightsStatus,
      publicationDecision,
      decisionReason,
      implementationBasis,
      implementationBasisRecordedAt,
      leakageScanStatus,
      reviewedAt,
    } = row;
    invariant(
      typeof formulaId === "string" &&
        UUID_V5.test(formulaId) &&
        !seen.has(formulaId) &&
        formulaId === sortedIdentityIds[index],
    );
    seen.add(formulaId);
    invariant(
      RIGHTS_STATUSES.includes(rightsStatus as (typeof RIGHTS_STATUSES)[number]) &&
        DECISIONS.includes(
          publicationDecision as (typeof DECISIONS)[number],
        ) &&
        typeof decisionReason === "string" &&
        decisionReason.length > 0 &&
        (implementationBasis === null ||
          BASES.includes(implementationBasis as (typeof BASES)[number])) &&
        (implementationBasisRecordedAt === null ||
          (typeof implementationBasisRecordedAt === "string" &&
            ISO_DATE_TIME.test(implementationBasisRecordedAt))) &&
        SCAN_STATUSES.includes(
          leakageScanStatus as (typeof SCAN_STATUSES)[number],
        ) &&
        typeof reviewedAt === "string" &&
        ISO_DATE.test(reviewedAt),
    );
    invariant(
      (implementationBasis === null) ===
        (implementationBasisRecordedAt === null),
    );
    if (rightsStatus === "gpl-3.0-only") {
      invariant(
        publicationDecision === "hold" &&
          decisionReason === GPL_FIXED_HOLD_REASON &&
          implementationBasis === null &&
          implementationBasisRecordedAt === null &&
          leakageScanStatus === "not-applicable" &&
          reviewedAt === REVIEWED_AT,
      );
      gplHeld++;
    } else {
      invariant(leakageScanStatus !== "not-applicable");
    }
    if (publicationDecision === "publish") {
      invariant(
        implementationBasis !== null &&
          implementationBasisRecordedAt !== null &&
          leakageScanStatus === "passed",
      );
    }
    rightsCounts.set(
      String(rightsStatus),
      (rightsCounts.get(String(rightsStatus)) ?? 0) + 1,
    );
    decisionCounts.set(
      String(publicationDecision),
      (decisionCounts.get(String(publicationDecision)) ?? 0) + 1,
    );
    statusById.set(formulaId, String(rightsStatus));
  }
  invariant(seen.size === 677 && gplHeld === 73);
  for (const status of RIGHTS_STATUSES) {
    invariant(rightsCounts.get(status) === EXPECTED_RIGHTS_COUNTS[status]);
    invariant(asset.rightsStatusCounts[status] === rightsCounts.get(status));
  }
  const published = decisionCounts.get("publish") ?? 0;
  const held = decisionCounts.get("hold") ?? 0;
  const excluded = decisionCounts.get("exclude") ?? 0;
  invariant(published + held + excluded === 677 && published <= 604);
  invariant(
    asset.decisionCounts.publish === published &&
      asset.decisionCounts.hold === held &&
      asset.decisionCounts.exclude === excluded,
  );

  // Independent rights-source recomputation from the frozen private handoff.
  const workPackage = extractWorkPackage();
  invariant(
    workPackage.schema === "fractalpark-standard-migration-work-packages/v1" &&
      workPackage.status === "candidate-ledger-not-implementation-approval" &&
      isDenseArray(workPackage.rows) &&
      workPackage.rows.length === 677 &&
      typeof workPackage.payloadContentHash === "string",
  );
  const unhashedHandoff = { ...workPackage };
  delete unhashedHandoff.payloadContentHash;
  invariant(
    workPackage.payloadContentHash === EXPECTED_WORK_PACKAGE_HASH &&
      sha256Bytes(canonicalJson(unhashedHandoff)) ===
        EXPECTED_WORK_PACKAGE_HASH,
  );
  const handoffSeen = new Set<string>();
  const classById = new Map<string, string>();
  for (const rawRow of workPackage.rows) {
    invariant(
      isRecord(rawRow) &&
        typeof rawRow.formulaId === "string" &&
        isRecord(rawRow.rights) &&
        typeof rawRow.rights.class === "string" &&
        rawRow.rights.class in CLASS_TO_RIGHTS_STATUS &&
        !handoffSeen.has(rawRow.formulaId),
    );
    handoffSeen.add(rawRow.formulaId);
    classById.set(rawRow.formulaId, rawRow.rights.class);
    invariant(
      statusById.get(rawRow.formulaId) ===
        CLASS_TO_RIGHTS_STATUS[rawRow.rights.class],
    );
  }
  invariant(handoffSeen.size === 677);

  // Independent revision-2 publish-selection recomputation. The expected
  // set is derived from the pinned census ledger and the native-recipe
  // evidence — never from the generator — and must equal the asset's set
  // exactly, with per-row basis/scan/review fields in the revision-2 shape.
  const censusBytes = readStableFile(
    join(repositoryRoot, CENSUS_LEDGER_RELATIVE_PATH),
    true,
  );
  const censusLedger = JSON.parse(censusBytes.toString("utf8")) as unknown;
  invariant(isRecord(censusLedger));
  const censusUnhashed = { ...censusLedger };
  delete censusUnhashed.ledgerContentHash;
  invariant(
    typeof censusLedger.ledgerContentHash === "string" &&
      censusLedger.ledgerContentHash === EXPECTED_CENSUS_LEDGER_HASH &&
      sha256Bytes(canonicalJson(censusUnhashed)) ===
        EXPECTED_CENSUS_LEDGER_HASH,
  );
  invariant(
    isDenseArray(censusLedger.rows) && censusLedger.rows.length === 677,
  );
  const censusOutcomeById = new Map<
    string,
    { passed: boolean; reasonCode: string | null }
  >();
  for (const censusRow of censusLedger.rows) {
    invariant(
      isRecord(censusRow) &&
        typeof censusRow.formulaId === "string" &&
        !censusOutcomeById.has(censusRow.formulaId) &&
        (censusRow.status === "passed" || censusRow.status === "failed"),
    );
    censusOutcomeById.set(censusRow.formulaId, {
      passed: censusRow.status === "passed",
      reasonCode:
        typeof censusRow.reasonCode === "string" ? censusRow.reasonCode : null,
    });
  }
  const recipeIds = new Set(
    NATIVE_FORMULA_RECIPES_V1.map((recipe) => recipe.formulaId as string),
  );
  const b94HoldClassById = new Map<string, string>();
  for (const hold of NATIVE_RECIPE_HOLDS_V1) {
    const formulaId = hold.recipe.formulaId as string;
    invariant(!b94HoldClassById.has(formulaId));
    b94HoldClassById.set(formulaId, hold.holdClass);
  }
  invariant(b94HoldClassById.size === EXPECTED_B94_HELD_COUNT);
  const CENSUS_HELD_REASONS: Readonly<Record<string, string>> = Object.freeze({
    "missing-input": "held-missing-input",
    "release-oracle-mismatch": "held-census-release-oracle-mismatch",
    "webgl-cpu-mismatch": "held-census-webgl-cpu-mismatch",
    "webgl-compile-link-draw-failed":
      "held-census-webgl-compile-link-draw-failed",
  });

  const expectedPublish = new Set<string>();
  for (const formulaId of handoffSeen) {
    const rightsClass = classById.get(formulaId);
    const censusOutcome = censusOutcomeById.get(formulaId);
    invariant(rightsClass !== undefined && censusOutcome !== undefined);
    if (rightsClass === "A" && censusOutcome.passed)
      expectedPublish.add(formulaId);
    if (
      rightsClass === "P" &&
      !b94HoldClassById.has(formulaId) &&
      recipeIds.has(formulaId)
    )
      expectedPublish.add(formulaId);
  }
  invariant(expectedPublish.size === EXPECTED_REV2_PUBLISH_COUNT);

  // Revision 3: independently re-derive the clean-room admitted set from the
  // pinned final census ledger + release manifest (never from the asset).
  const cleanroomPublish = new Set<string>();
  const releaseManifestRowById = new Map<
    string,
    { semanticHash: string | null; pilotCarryover: boolean }
  >();
  if (decisionRevision === 3) {
    const finalCensusBytes = readStableFile(
      join(repositoryRoot, FINAL_CENSUS_RELATIVE_PATH),
      true,
    );
    invariant(
      sha256Bytes(finalCensusBytes) === EXPECTED_FINAL_CENSUS_HASH,
    );
    const finalCensus = JSON.parse(
      finalCensusBytes.toString("utf8"),
    ) as unknown;
    invariant(isRecord(finalCensus) && isDenseArray(finalCensus.rows));
    const finalCensusPassed = new Set<string>();
    for (const row of finalCensus.rows) {
      invariant(isRecord(row) && typeof row.formulaId === "string");
      if (row.status === "passed") finalCensusPassed.add(row.formulaId);
    }
    const releaseManifestBytes = readStableFile(
      join(repositoryRoot, RELEASE_MANIFEST_RELATIVE_PATH),
      true,
    );
    invariant(
      sha256Bytes(releaseManifestBytes) === EXPECTED_RELEASE_MANIFEST_HASH,
    );
    const releaseManifest = JSON.parse(
      releaseManifestBytes.toString("utf8"),
    ) as unknown;
    invariant(
      isRecord(releaseManifest) &&
        releaseManifest.schema === "fractalpark-bulk-release-manifest/1" &&
        releaseManifest.decisionRevision === 3 &&
        releaseManifest.finalCensusLedgerSha256 ===
          EXPECTED_FINAL_CENSUS_HASH &&
        isDenseArray(releaseManifest.rows),
    );
    for (const row of releaseManifest.rows) {
      invariant(
        isRecord(row) &&
          typeof row.formulaId === "string" &&
          typeof row.displayName === "string" &&
          finalCensusPassed.has(row.formulaId) &&
          classById.get(row.formulaId) === "C" &&
          !releaseManifestRowById.has(row.formulaId),
      );
      releaseManifestRowById.set(row.formulaId, {
        semanticHash:
          typeof row.semanticHash === "string" ? row.semanticHash : null,
        pilotCarryover: row.pilotCarryover === true,
      });
      cleanroomPublish.add(row.formulaId);
    }
    invariant(cleanroomPublish.size === EXPECTED_CLEANROOM_PUBLISH_COUNT);
    for (const formulaId of cleanroomPublish) expectedPublish.add(formulaId);
    invariant(
      (expectedPublish.size as number) === EXPECTED_REV3_PUBLISH_COUNT,
    );
  }

  const actualPublish = new Set<string>();
  for (const row of asset.rows) {
    invariant(isRecord(row) && typeof row.formulaId === "string");
    const rightsClass = classById.get(row.formulaId);
    const censusOutcome = censusOutcomeById.get(row.formulaId);
    invariant(rightsClass !== undefined && censusOutcome !== undefined);
    if (row.publicationDecision === "publish") {
      actualPublish.add(row.formulaId);
      invariant(
        row.reviewedAt === REVIEWED_AT &&
          row.implementationBasisRecordedAt === BASIS_RECORDED_AT &&
          row.leakageScanStatus === "passed",
      );
      if (rightsClass === "A")
        invariant(
          row.implementationBasis === "direct-adaptation" &&
            row.decisionReason === "publish-census-full-chain-green",
        );
      else if (rightsClass === "P")
        invariant(
          row.implementationBasis === "project-owned" &&
            row.decisionReason === "publish-project-owned-native-recipe",
        );
      else if (rightsClass === "C")
        invariant(
          decisionRevision === 3 &&
            cleanroomPublish.has(row.formulaId) &&
            row.implementationBasis === "separated-independent-rewrite" &&
            row.decisionReason ===
              "publish-cleanroom-independent-rewrite-full-chain-green",
        );
      else invariant(false);
      continue;
    }
    if (rightsClass === "A") {
      invariant(
        row.publicationDecision === "hold" &&
          row.implementationBasis === null &&
          row.implementationBasisRecordedAt === null &&
          row.leakageScanStatus === "pending" &&
          row.reviewedAt === REVIEWED_AT &&
          censusOutcome.reasonCode !== null &&
          row.decisionReason ===
            CENSUS_HELD_REASONS[censusOutcome.reasonCode],
      );
    } else if (rightsClass === "P") {
      const holdClass = b94HoldClassById.get(row.formulaId);
      invariant(
        row.publicationDecision === "hold" &&
          row.implementationBasis === null &&
          row.implementationBasisRecordedAt === null &&
          row.leakageScanStatus === "pending" &&
          row.reviewedAt === REVIEWED_AT &&
          holdClass !== undefined &&
          row.decisionReason === `held-b94-${holdClass}`,
      );
    } else if (rightsClass === "C") {
      invariant(
        row.publicationDecision === "hold" &&
          row.implementationBasis === null &&
          row.implementationBasisRecordedAt === null &&
          row.leakageScanStatus === "pending" &&
          row.reviewedAt === REVIEWED_AT &&
          row.decisionReason === "held-awaiting-independent-rewrite",
      );
    }
    // gpl-3.0-only (class B) rows are pinned exactly in the row loop above.
  }
  invariant(
    actualPublish.size === expectedPublish.size &&
      [...actualPublish].every((formulaId) => expectedPublish.has(formulaId)),
  );

  // Revision 3 runtime shards: verify the runtime manifest pins the release
  // manifest hash, every shard file matches its pinned sha256, the shard row
  // union equals the clean-room publish set exactly, and per-row
  // semanticHash agrees with the release manifest.
  if (decisionRevision === 3) {
    const runtimeManifestBytes = readStableFile(
      join(repositoryRoot, RUNTIME_REV3_RELATIVE_DIR, "manifest.json"),
      false,
    );
    const runtimeManifest = JSON.parse(
      runtimeManifestBytes.toString("utf8"),
    ) as unknown;
    invariant(
      isRecord(runtimeManifest) &&
        runtimeManifest.schema ===
          "fractalpark-formula-library-runtime-manifest/v1" &&
        runtimeManifest.decisionRevision === 3 &&
        runtimeManifest.releaseManifestSha256 ===
          EXPECTED_RELEASE_MANIFEST_HASH &&
        runtimeManifest.rowCount === EXPECTED_CLEANROOM_PUBLISH_COUNT &&
        typeof runtimeManifest.shardCount === "number" &&
        isDenseArray(runtimeManifest.shards) &&
        runtimeManifest.shards.length === runtimeManifest.shardCount,
    );
    const shardRowIds = new Set<string>();
    let shardRowTotal = 0;
    for (let index = 0; index < runtimeManifest.shards.length; index++) {
      const shardEntry = runtimeManifest.shards[index];
      invariant(
        isRecord(shardEntry) &&
          typeof shardEntry.file === "string" &&
          typeof shardEntry.sha256 === "string" &&
          SHA256.test(shardEntry.sha256) &&
          typeof shardEntry.rows === "number",
      );
      const shardBytes = readStableFile(
        join(repositoryRoot, RUNTIME_REV3_RELATIVE_DIR, shardEntry.file),
        false,
      );
      invariant(sha256Bytes(shardBytes) === shardEntry.sha256);
      const shard = JSON.parse(shardBytes.toString("utf8")) as unknown;
      invariant(
        isRecord(shard) &&
          shard.schema === "fractalpark-formula-library-runtime-shard/v1" &&
          shard.decisionRevision === 3 &&
          shard.shardIndex === index &&
          shard.shardCount === runtimeManifest.shardCount &&
          isDenseArray(shard.rows) &&
          shard.rows.length === shardEntry.rows,
      );
      for (const row of shard.rows) {
        invariant(
          isRecord(row) &&
            typeof row.formulaId === "string" &&
            cleanroomPublish.has(row.formulaId) &&
            !shardRowIds.has(row.formulaId) &&
            row.implementationBasis === "separated-independent-rewrite" &&
            typeof row.semanticHash === "string" &&
            row.semanticHash ===
              releaseManifestRowById.get(row.formulaId)?.semanticHash &&
            typeof row.definition === "string" &&
            row.definition.length > 0,
        );
        shardRowIds.add(row.formulaId);
        shardRowTotal++;
      }
    }
    invariant(
      shardRowTotal === EXPECTED_CLEANROOM_PUBLISH_COUNT &&
        shardRowIds.size === EXPECTED_CLEANROOM_PUBLISH_COUNT &&
        [...cleanroomPublish].every((formulaId) =>
          shardRowIds.has(formulaId),
        ),
    );
  }

  return {
    published,
    held,
    excluded,
    gplHeld,
    contentHash: asset.contentHash,
    assetSha256: sha256Bytes(assetBytes),
  };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const result = verifyPublicationDecisions(process.cwd());
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        formulaCount: 677,
        published: result.published,
        held: result.held,
        excluded: result.excluded,
        gplHeld: result.gplHeld,
        contentHash: result.contentHash,
        assetSha256: result.assetSha256,
      })}\n`,
    );
  } catch {
    process.stderr.write("verification-invalid\n");
    process.exitCode = 1;
  }
}
