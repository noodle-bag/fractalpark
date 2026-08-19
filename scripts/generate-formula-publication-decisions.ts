import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { NATIVE_FORMULA_RECIPES_V1 } from "../src/engine/formulas/v1/native-recipes";
import { NATIVE_RECIPE_HOLDS_V1 } from "../src/engine/formulas/v1/native-recipes-b94-held";
import { computeRunnableLedgerContentHash } from "./formula-library-bulk-migration";

/**
 * Generates the frozen public publication-decision ledger from the frozen
 * private exact-677 migration work-package handoff. The output contains only
 * neutral formula IDs, rights status, decision fields, and aggregate counts;
 * it never carries private paths, source text, or reversible intermediates.
 * The script pins the frozen handoff's canonical content hash as a public
 * tamper-evident binding, consistent with the previously reviewed gate
 * scripts in this repository; a one-way digest exposes no private content.
 * This script records decisions; it does not authorize any implementation,
 * publication, or hosted write.
 *
 * Decision revision 2 (maintainer-approved release set, 2026-08-18): rows
 * flip to `publish` only on recorded full-chain-green evidence —
 * F588/A-class rows require a `passed` row in the pinned census ledger
 * (EXPECTED_CENSUS_LEDGER_HASH, 106 rows); project-owned B94 rows require a
 * native recipe that is not diagnosis-held in
 * src/engine/formulas/v1/native-recipes-b94-held.ts (68 rows). Everything
 * else keeps its baseline `hold` decision and reason; all 73 gpl-3.0-only
 * rows remain fixed holds. Revision 2 re-reviewed the whole ledger, so
 * `reviewedAt` advances to 2026-08-18 on every row — the B/C decision
 * content itself is byte-identical to the baseline apart from that field.
 *
 * Decision revision 3 (commit 14 clean-room bulk, maintainer-approved release
 * set): C-class rows flip to `publish` exactly when the pinned clean-room
 * release manifest (EXPECTED_RELEASE_MANIFEST_HASH) admits them — admission
 * requires the final census outcome `passed` under the pinned final census
 * ledger (EXPECTED_FINAL_CENSUS_HASH) AND a full-chain-green frozen bulk
 * receipt (basis freeze before implementation session, leakage scan and
 * adjudication chain, kill test, census legs). A-class and P-class selection
 * is byte-identical to revision 2 (regression invariant: the 106 census-green
 * A rows and 68 recipe-green P rows are asserted unchanged). B-class stays
 * fixed hold. The manifest binds each admitted row to its implementation
 * output hash, basis spec hash, and receipt hash; rows whose receipt
 * disagrees with the final census are demoted to held (fail-closed).
 */

const EXPECTED_WORK_PACKAGE_HASH =
  "29d4501d05f712f154d11809414876f9625c5efa202885579080d61fa88633bd";
const EXPECTED_IDENTITY_SHA256 =
  "b98bbc2b954871b227acfd7c882443cbeb44870931ddb4714c9aed3ffcf33729";
/**
 * Census rerun on the guarded engine (commit 783a8fc), 677 rows, exit 0.
 * The publish set for A-class rows is exactly the `passed` rows of this
 * ledger; pinning the hash binds the decision asset to that evidence run.
 */
const EXPECTED_CENSUS_LEDGER_HASH =
  "fa7f6b35cd7e9d5afa77754755d3439ea949c7be2964024a4163a3874e9a5a37";
const EXPECTED_PUBLISH_COUNT = 513;
const EXPECTED_B94_HELD_COUNT = 21;
/**
 * Commit 14 clean-room evidence pins — RE-PINNED 2026-08-19 at the final
 * census over all 378 rows (360 bulk + 9 carryover + 8 waiver + 1
 * source-gap) under the hardened webgl-rev2 toolchain (Codex R3-R6 closed,
 * R6 PASS). 339 clean-room rows admitted (331 bulk accepted + 8 carryover),
 * 5 kill-held demoted fail-closed.
 */
const EXPECTED_FINAL_CENSUS_HASH: string =
  "6de7caa2c1921db8f4e9a851fce6cd281dd77dd2c1fc1d44ba20f63132ef2e95";
const EXPECTED_RELEASE_MANIFEST_HASH: string =
  "0dc2a95de29e939987db5cedc84685c6b5a027d2ae24db780c95a3f3d5ea849f";
const EXPECTED_CLEANROOM_PUBLISH_COUNT = 339;
const EXPECTED_REV2_PUBLISH_COUNT = 174;
const WORK_PACKAGE_START =
  "<!-- BEGIN STANDARD_MIGRATION_WORK_PACKAGES_JSON -->";
const SCHEMA = "fractalpark-formula-library-publication-decisions/v1";
const DECISION_REVISION = 3;
const REVIEWED_AT = "2026-08-18";
/**
 * Recording timestamp of the revision-2 evidence bases: the census ledger
 * above and the 12c B94 three-leg cross-check were both recorded on
 * 2026-08-18 (UTC). Pinned for deterministic regeneration.
 */
const BASIS_RECORDED_AT = "2026-08-18T00:05:00.000Z";
const ASSET_RELATIVE_PATH = join(
  "resources",
  "formula-library",
  "v1",
  "publication-decisions.json",
);
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

const CLASS_TO_RIGHTS_STATUS = Object.freeze({
  P: "project-owned",
  A: "source-declared-public-domain-assumption",
  B: "gpl-3.0-only",
  C: "no-explicit-permission",
} as const);

const BASELINE_REASONS = Object.freeze({
  P: "held-awaiting-project-owned-implementation-batch",
  A: "held-awaiting-pd-assumption-implementation-batch",
  B: "held-license-gpl-3.0-only",
  C: "held-awaiting-independent-rewrite",
} as const);

type RightsClass = keyof typeof CLASS_TO_RIGHTS_STATUS;
type JsonRecord = Record<string, unknown>;

const PUBLIC_ERROR_CODES = new Set([
  "decisions-asset-write-failed",
  "decisions-drift",
  "decisions-handoff-invalid",
  "decisions-identity-binding-invalid",
  "decisions-output-invalid",
]);

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
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
    if (typeof value === "string")
      invariant(!hasLoneSurrogate(value), "decisions-output-invalid");
    if (typeof value === "number")
      invariant(Number.isFinite(value), "decisions-output-invalid");
    return JSON.stringify(value);
  }
  if (isDenseArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  invariant(isRecord(value), "decisions-output-invalid");
  return `{${Object.keys(value)
    .sort()
    .map((key) => {
      invariant(!hasLoneSurrogate(key), "decisions-output-invalid");
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
    throw new Error("decisions-handoff-invalid");
  }
  try {
    const opened = fstatSync(descriptor);
    invariant(
      opened.isFile() &&
        opened.nlink === 1 &&
        (!requirePrivateMode || (opened.mode & 0o777) === 0o600),
      "decisions-handoff-invalid",
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
      "decisions-handoff-invalid",
    );
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

export function extractWorkPackage(): JsonRecord {
  const path = process.env.FRACTALPARK_FORMULA_HANDOFF;
  invariant(path, "decisions-handoff-invalid");
  let markdown: string;
  try {
    markdown = readStableFile(path, true).toString("utf8");
  } catch {
    throw new Error("decisions-handoff-invalid");
  }
  const marker = markdown.indexOf(WORK_PACKAGE_START);
  const start = markdown.indexOf("{", marker);
  const end = markdown.indexOf("```", start);
  invariant(
    marker >= 0 && start > marker && end > start,
    "decisions-handoff-invalid",
  );
  try {
    const parsed = JSON.parse(markdown.slice(start, end)) as unknown;
    invariant(isRecord(parsed), "decisions-handoff-invalid");
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message === "decisions-handoff-invalid")
      throw error;
    throw new Error("decisions-handoff-invalid");
  }
}

function assertSelfHash(
  value: JsonRecord,
  field: string,
  expected: string,
): void {
  invariant(value[field] === expected, "decisions-handoff-invalid");
  const unhashed = { ...value };
  delete unhashed[field];
  invariant(
    sha256Bytes(canonicalJson(unhashed)) === expected,
    "decisions-handoff-invalid",
  );
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function projectRightsClasses(
  repositoryRoot: string,
  workPackage: JsonRecord,
): ReadonlyMap<string, RightsClass> {
  invariant(
    workPackage.schema === "fractalpark-standard-migration-work-packages/v1" &&
      workPackage.status === "candidate-ledger-not-implementation-approval" &&
      isDenseArray(workPackage.rows) &&
      workPackage.rows.length === 677 &&
      isRecord(workPackage.sourceBindings) &&
      isRecord(workPackage.publicProjection) &&
      isDenseArray(workPackage.publicProjection.rows) &&
      workPackage.publicProjection.rows.length === 677,
    "decisions-handoff-invalid",
  );
  const identitiesPath = join(
    repositoryRoot,
    "resources",
    "formula-library",
    "v1",
    "standard-formula-ids.json",
  );
  const identitiesBytes = readStableFile(identitiesPath, false);
  invariant(
    sha256Bytes(identitiesBytes) === EXPECTED_IDENTITY_SHA256,
    "decisions-identity-binding-invalid",
  );
  const identities = JSON.parse(identitiesBytes.toString("utf8")) as unknown;
  invariant(
    isRecord(identities) &&
      identities.formulaCount === 677 &&
      isDenseArray(identities.formulas) &&
      identities.formulas.length === 677,
    "decisions-identity-binding-invalid",
  );
  const standardBinding = workPackage.sourceBindings.standardFormulaIds;
  invariant(
    isRecord(standardBinding) &&
      standardBinding.sha256 === EXPECTED_IDENTITY_SHA256,
    "decisions-identity-binding-invalid",
  );

  const classes = new Map<string, RightsClass>();
  for (let index = 0; index < 677; index++) {
    const row = workPackage.rows[index];
    const identityRow = identities.formulas[index];
    const projectionRow = workPackage.publicProjection.rows[index];
    invariant(
      isRecord(row) &&
        isRecord(identityRow) &&
        isRecord(projectionRow) &&
        isRecord(row.rights) &&
        typeof row.formulaId === "string" &&
        identityRow.formulaId === row.formulaId &&
        projectionRow.formulaId === row.formulaId &&
        projectionRow.rightsClass === row.rights.class &&
        (row.rights.class === "P" ||
          row.rights.class === "A" ||
          row.rights.class === "B" ||
          row.rights.class === "C") &&
        !classes.has(row.formulaId),
      "decisions-handoff-invalid",
    );
    classes.set(row.formulaId, row.rights.class as RightsClass);
  }
  return classes;
}

const CENSUS_HELD_REASONS: Readonly<Record<string, string>> = Object.freeze({
  "missing-input": "held-missing-input",
  "release-oracle-mismatch": "held-census-release-oracle-mismatch",
  "webgl-cpu-mismatch": "held-census-webgl-cpu-mismatch",
  "webgl-compile-link-draw-failed": "held-census-webgl-compile-link-draw-failed",
});

type CensusOutcome =
  | { readonly status: "passed" }
  | { readonly status: "failed"; readonly reasonCode: string };

/**
 * Reads the pinned census ledger (private, mode 600) and returns the
 * per-row outcome. The ledger content hash is pinned so the revision-2
 * publish set is bound to exactly one evidence run.
 */
function extractCensusOutcomes(
  repositoryRoot: string,
): ReadonlyMap<string, CensusOutcome> {
  const path = join(repositoryRoot, CENSUS_LEDGER_RELATIVE_PATH);
  const bytes = readStableFile(path, true);
  let ledger: unknown;
  try {
    ledger = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("decisions-handoff-invalid");
  }
  invariant(isRecord(ledger), "decisions-handoff-invalid");
  invariant(
    computeRunnableLedgerContentHash(ledger) === EXPECTED_CENSUS_LEDGER_HASH,
    "decisions-handoff-invalid",
  );
  invariant(
    isDenseArray(ledger.rows) && ledger.rows.length === 677,
    "decisions-handoff-invalid",
  );
  const outcomes = new Map<string, CensusOutcome>();
  for (const row of ledger.rows) {
    invariant(
      isRecord(row) &&
        typeof row.formulaId === "string" &&
        !outcomes.has(row.formulaId) &&
        (row.status === "passed" || row.status === "failed"),
      "decisions-handoff-invalid",
    );
    if (row.status === "passed") {
      outcomes.set(row.formulaId, { status: "passed" });
      continue;
    }
    invariant(
      typeof row.reasonCode === "string" &&
        (row.reasonCode in CENSUS_HELD_REASONS ||
          row.reasonCode === "v1-projection-unsupported"),
      "decisions-handoff-invalid",
    );
    outcomes.set(row.formulaId, {
      status: "failed",
      reasonCode: row.reasonCode,
    });
  }
  return outcomes;
}

interface ReleaseManifestEntry {
  readonly formulaId: string;
  readonly displayName: string;
  readonly implementationBasis: string;
  readonly semanticHash: string;
}

/**
 * Reads the pinned clean-room release manifest (private, mode 600) and
 * cross-validates it against the pinned final census ledger: every admitted
 * row must carry a `passed` outcome in exactly that census run. Returns the
 * admitted set. Fail-closed on any drift.
 */
function extractReleaseManifest(
  repositoryRoot: string,
): ReadonlyMap<string, ReleaseManifestEntry> {
  if (
    EXPECTED_FINAL_CENSUS_HASH === "PIN-AT-FINAL-CENSUS" ||
    EXPECTED_RELEASE_MANIFEST_HASH === "PIN-AT-FINAL-CENSUS"
  ) {
    throw new Error("decisions-handoff-invalid");
  }
  const censusBytes = readStableFile(
    join(repositoryRoot, FINAL_CENSUS_RELATIVE_PATH),
    true,
  );
  invariant(
    sha256Bytes(censusBytes) === EXPECTED_FINAL_CENSUS_HASH,
    "decisions-handoff-invalid",
  );
  let census: unknown;
  try {
    census = JSON.parse(censusBytes.toString("utf8"));
  } catch {
    throw new Error("decisions-handoff-invalid");
  }
  invariant(
    isRecord(census) &&
      census.schema === "fractalpark-bulk-final-census-ledger/1" &&
      isDenseArray(census.rows) &&
      census.rows.length === 378,
    "decisions-handoff-invalid",
  );
  const censusPassed = new Set<string>();
  for (const row of census.rows) {
    invariant(
      isRecord(row) && typeof row.formulaId === "string",
      "decisions-handoff-invalid",
    );
    if (row.status === "passed") censusPassed.add(row.formulaId);
  }

  const manifestBytes = readStableFile(
    join(repositoryRoot, RELEASE_MANIFEST_RELATIVE_PATH),
    true,
  );
  invariant(
    sha256Bytes(manifestBytes) === EXPECTED_RELEASE_MANIFEST_HASH,
    "decisions-handoff-invalid",
  );
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error("decisions-handoff-invalid");
  }
  invariant(
    isRecord(manifest) &&
      manifest.schema === "fractalpark-bulk-release-manifest/1" &&
      manifest.decisionRevision === 3 &&
      isDenseArray(manifest.rows) &&
      manifest.finalCensusLedgerSha256 === EXPECTED_FINAL_CENSUS_HASH,
    "decisions-handoff-invalid",
  );
  const admitted = new Map<string, ReleaseManifestEntry>();
  for (const entry of manifest.rows) {
    invariant(
      isRecord(entry) &&
        typeof entry.formulaId === "string" &&
        typeof entry.displayName === "string" &&
        entry.implementationBasis === "separated-independent-rewrite" &&
        typeof entry.semanticHash === "string" &&
        censusPassed.has(entry.formulaId) &&
        !admitted.has(entry.formulaId),
      "decisions-handoff-invalid",
    );
    admitted.set(entry.formulaId, entry as unknown as ReleaseManifestEntry);
  }
  invariant(
    admitted.size === EXPECTED_CLEANROOM_PUBLISH_COUNT,
    "decisions-handoff-invalid",
  );
  return admitted;
}

function baselineRow(formulaId: string, rightsClass: RightsClass): JsonRecord {
  return {
    formulaId,
    rightsStatus: CLASS_TO_RIGHTS_STATUS[rightsClass],
    publicationDecision: "hold",
    decisionReason: BASELINE_REASONS[rightsClass],
    implementationBasis: null,
    implementationBasisRecordedAt: null,
    leakageScanStatus: rightsClass === "B" ? "not-applicable" : "pending",
    reviewedAt: REVIEWED_AT,
  };
}

function publishRow(
  formulaId: string,
  rightsClass: RightsClass,
  decisionReason: string,
  implementationBasis:
    | "project-owned"
    | "direct-adaptation"
    | "separated-independent-rewrite",
): JsonRecord {
  return {
    formulaId,
    rightsStatus: CLASS_TO_RIGHTS_STATUS[rightsClass],
    publicationDecision: "publish",
    decisionReason,
    implementationBasis,
    implementationBasisRecordedAt: BASIS_RECORDED_AT,
    leakageScanStatus: "passed",
    reviewedAt: REVIEWED_AT,
  };
}

function heldRow(
  formulaId: string,
  rightsClass: RightsClass,
  decisionReason: string,
): JsonRecord {
  return {
    formulaId,
    rightsStatus: CLASS_TO_RIGHTS_STATUS[rightsClass],
    publicationDecision: "hold",
    decisionReason,
    implementationBasis: null,
    implementationBasisRecordedAt: null,
    leakageScanStatus: "pending",
    reviewedAt: REVIEWED_AT,
  };
}

export function buildPublicationDecisionAsset(
  repositoryRoot: string,
  workPackage: JsonRecord,
): JsonRecord {
  const classes = projectRightsClasses(repositoryRoot, workPackage);
  const census = extractCensusOutcomes(repositoryRoot);
  const releaseManifest = extractReleaseManifest(repositoryRoot);

  // B94 acceptance evidence: a project-owned row publishes exactly when it
  // has a public native recipe and is not diagnosis-held (12c three-leg
  // cross-check, recorded in the execution ledger on 2026-08-18).
  const recipeIds = new Set(
    NATIVE_FORMULA_RECIPES_V1.map((recipe) => recipe.formulaId as string),
  );
  const b94Holds = new Map<string, string>();
  for (const hold of NATIVE_RECIPE_HOLDS_V1) {
    const formulaId = hold.recipe.formulaId as string;
    invariant(
      !b94Holds.has(formulaId) && classes.get(formulaId) === "P",
      "decisions-handoff-invalid",
    );
    b94Holds.set(formulaId, hold.holdClass);
  }
  invariant(
    b94Holds.size === EXPECTED_B94_HELD_COUNT,
    "decisions-handoff-invalid",
  );

  const rows: JsonRecord[] = [];
  let publishCount = 0;
  let censusGreenA = 0;
  let cleanroomPublishCount = 0;
  for (const [formulaId, rightsClass] of [...classes.entries()].sort(
    ([left], [right]) => compareAscii(left, right),
  )) {
    if (rightsClass === "A") {
      const outcome = census.get(formulaId);
      invariant(outcome, "decisions-handoff-invalid");
      if (outcome.status === "passed") {
        censusGreenA++;
        publishCount++;
        rows.push(
          publishRow(
            formulaId,
            rightsClass,
            "publish-census-full-chain-green",
            "direct-adaptation",
          ),
        );
        continue;
      }
      const reason = CENSUS_HELD_REASONS[outcome.reasonCode];
      invariant(reason !== undefined, "decisions-handoff-invalid");
      rows.push(heldRow(formulaId, rightsClass, reason));
      continue;
    }
    if (rightsClass === "P") {
      const holdClass = b94Holds.get(formulaId);
      if (holdClass === undefined) {
        invariant(recipeIds.has(formulaId), "decisions-handoff-invalid");
        publishCount++;
        rows.push(
          publishRow(
            formulaId,
            rightsClass,
            "publish-project-owned-native-recipe",
            "project-owned",
          ),
        );
        continue;
      }
      rows.push(heldRow(formulaId, rightsClass, `held-b94-${holdClass}`));
      continue;
    }
    if (rightsClass === "C") {
      const admitted = releaseManifest.get(formulaId);
      if (admitted) {
        publishCount++;
        cleanroomPublishCount++;
        rows.push(
          publishRow(
            formulaId,
            rightsClass,
            "publish-cleanroom-independent-rewrite-full-chain-green",
            "separated-independent-rewrite",
          ),
        );
        continue;
      }
      rows.push(
        baselineRow(formulaId, rightsClass),
      );
      continue;
    }
    // B (gpl-3.0-only) stays at the baseline hold shape; the engine
    // validator pins the exact GPL row form.
    rows.push(baselineRow(formulaId, rightsClass));
  }
  invariant(
    censusGreenA === 106 &&
      cleanroomPublishCount === EXPECTED_CLEANROOM_PUBLISH_COUNT &&
      publishCount === EXPECTED_PUBLISH_COUNT,
    "decisions-output-invalid",
  );
  // Regression invariant: revision 2's exact publish set (106 census-green
  // A rows + 68 recipe-green P rows) is unchanged; revision 3 only adds
  // clean-room C rows.
  invariant(
    publishCount - cleanroomPublishCount === EXPECTED_REV2_PUBLISH_COUNT,
    "decisions-output-invalid",
  );
  // No census-passed row may sit outside class A.
  for (const [formulaId, outcome] of census)
    if (outcome.status === "passed")
      invariant(classes.get(formulaId) === "A", "decisions-output-invalid");

  const rightsStatusCounts: JsonRecord = {
    "project-owned": 0,
    "source-declared-public-domain-assumption": 0,
    "gpl-3.0-only": 0,
    "no-explicit-permission": 0,
  };
  for (const row of rows) {
    const status = row.rightsStatus;
    invariant(
      typeof status === "string" && status in rightsStatusCounts,
      "decisions-output-invalid",
    );
    rightsStatusCounts[status] = (rightsStatusCounts[status] as number) + 1;
  }
  invariant(
    rightsStatusCounts["project-owned"] === 89 &&
      rightsStatusCounts["source-declared-public-domain-assumption"] === 137 &&
      rightsStatusCounts["gpl-3.0-only"] === 73 &&
      rightsStatusCounts["no-explicit-permission"] === 378,
    "decisions-output-invalid",
  );
  const unsigned: JsonRecord = {
    schema: SCHEMA,
    version: 1,
    decisionRevision: DECISION_REVISION,
    formulaCount: 677,
    identityBinding: { standardFormulaIdsSha256: EXPECTED_IDENTITY_SHA256 },
    rightsStatusCounts,
    decisionCounts: {
      publish: publishCount,
      hold: 677 - publishCount,
      exclude: 0,
    },
    rows,
  };
  return { ...unsigned, contentHash: sha256Bytes(canonicalJson(unsigned)) };
}

export function writePublicAsset(path: string, serialized: string): void {
  const directory = dirname(path);
  let directoryMetadata: ReturnType<typeof lstatSync>;
  try {
    directoryMetadata = lstatSync(directory);
  } catch {
    throw new Error("decisions-asset-write-failed");
  }
  invariant(
    directoryMetadata.isDirectory() &&
      !directoryMetadata.isSymbolicLink() &&
      realpathSync(directory) === resolve(directory),
    "decisions-asset-write-failed",
  );
  const existing = lstatSync(path, { throwIfNoEntry: false });
  invariant(
    existing == null || (existing.isFile() && !existing.isSymbolicLink()),
    "decisions-asset-write-failed",
  );
  // Pin the parent directory by file descriptor so a post-check directory
  // replacement is detected instead of silently redirecting the write.
  let directoryDescriptor: number;
  try {
    directoryDescriptor = openSync(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
  } catch {
    throw new Error("decisions-asset-write-failed");
  }
  const assertDirectoryStable = (openedDirectory: {
    dev: number;
    ino: number;
  }): void => {
    const currentDirectory = fstatSync(directoryDescriptor);
    const directoryNow = lstatSync(directory);
    invariant(
      currentDirectory.dev === openedDirectory.dev &&
        currentDirectory.ino === openedDirectory.ino &&
        directoryNow.isDirectory() &&
        !directoryNow.isSymbolicLink() &&
        directoryNow.dev === openedDirectory.dev &&
        directoryNow.ino === openedDirectory.ino,
      "decisions-asset-write-failed",
    );
  };
  try {
    const openedDirectory = fstatSync(directoryDescriptor);
    // Writes are pinned to the opened directory inode through procfs and are
    // fail-closed without it: a path-based write could be redirected by a
    // mid-write directory replacement, so regeneration requires Linux.
    const pinnedBase = `/proc/self/fd/${directoryDescriptor}`;
    try {
      const throughProc = statSync(pinnedBase);
      invariant(
        throughProc.isDirectory() &&
          throughProc.dev === openedDirectory.dev &&
          throughProc.ino === openedDirectory.ino,
        "decisions-asset-write-failed",
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "decisions-asset-write-failed"
      )
        throw error;
      throw new Error("decisions-asset-write-failed");
    }
    const temporary = join(
      pinnedBase,
      `.publication-decisions.${process.pid}.tmp`,
    );
    const target = join(pinnedBase, basename(path));
    let temporaryCreated = false;
    try {
      let descriptor: number;
      try {
        descriptor = openSync(
          temporary,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o644,
        );
      } catch {
        throw new Error("decisions-asset-write-failed");
      }
      temporaryCreated = true;
      try {
        writeSync(descriptor, serialized);
        fsyncSync(descriptor);
        fchmodSync(descriptor, 0o644);
      } finally {
        closeSync(descriptor);
      }
      // Abort before rename if the directory was replaced while writing.
      assertDirectoryStable(openedDirectory);
      renameSync(temporary, target);
      temporaryCreated = false;
      assertDirectoryStable(openedDirectory);
    } finally {
      if (temporaryCreated) {
        try {
          unlinkSync(temporary);
        } catch {
          // Best-effort cleanup through the pinned directory inode.
        }
      }
    }
  } finally {
    closeSync(directoryDescriptor);
  }
  const written = readStableFile(path, false);
  invariant(
    written.toString("utf8") === serialized,
    "decisions-asset-write-failed",
  );
}

export function generatePublicationDecisions(
  repositoryRoot: string,
  write: boolean,
): {
  contentHash: string;
  assetSha256: string;
  drift: boolean;
  published: number;
  held: number;
} {
  const workPackage = extractWorkPackage();
  assertSelfHash(
    workPackage,
    "payloadContentHash",
    EXPECTED_WORK_PACKAGE_HASH,
  );
  const asset = buildPublicationDecisionAsset(repositoryRoot, workPackage);
  const serialized = `${JSON.stringify(asset, null, 2)}\n`;
  const assetPath = join(repositoryRoot, ASSET_RELATIVE_PATH);
  const current = lstatSync(assetPath, { throwIfNoEntry: false });
  const currentBytes =
    current == null
      ? null
      : readStableFile(assetPath, false).toString("utf8");
  const drift = currentBytes !== serialized;
  if (write) {
    writePublicAsset(assetPath, serialized);
  } else {
    invariant(!drift, "decisions-drift");
  }
  const decisionCounts = asset.decisionCounts as JsonRecord;
  return {
    contentHash: String(asset.contentHash),
    assetSha256: sha256Bytes(serialized),
    drift,
    published: Number(decisionCounts.publish),
    held: Number(decisionCounts.hold),
  };
}

export function sanitizePublicationDecisionError(error: unknown): string {
  return error instanceof Error && PUBLIC_ERROR_CODES.has(error.message)
    ? error.message
    : "decisions-controller-internal-error";
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const write = process.argv.includes("--write");
    const result = generatePublicationDecisions(process.cwd(), write);
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        mode: write ? "write" : "check",
        formulaCount: 677,
        decisionRevision: DECISION_REVISION,
        published: result.published,
        held: result.held,
        excluded: 0,
        gplHeld: 73,
        contentHash: result.contentHash,
        assetSha256: result.assetSha256,
        drift: result.drift,
        publicAssetsWritten: 0,
      })}\n`,
    );
  } catch (error) {
    process.stderr.write(`${sanitizePublicationDecisionError(error)}\n`);
    process.exitCode = 1;
  }
}
