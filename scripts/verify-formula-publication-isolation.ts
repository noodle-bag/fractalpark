import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { buildFormulaRecordV1 } from "../src/lib/formula-records";

const ROOT = process.cwd();
const CONTRACT_PATH = join(
  ROOT,
  "resources/formula-library/v1/publication-isolation.v1.json",
);
const DECISIONS_PATH = join(
  ROOT,
  "resources/formula-library/v1/publication-decisions.json",
);
const INDEX_PATH = join(
  ROOT,
  "public/formula-library/v1/runtime/published/index.json",
);
const RUNTIME_MANIFEST_PATH = join(
  ROOT,
  "public/formula-library/v1/runtime/published/manifest.json",
);
const PREVIEW_MANIFEST_PATH = join(
  ROOT,
  "public/formula-library/v1/previews/manifest.json",
);
const RECORD_PROVENANCE_PATH = join(
  ROOT,
  "resources/formula-library/v1/formula-record-provenance.v1.json",
);
const DEFINITIONS_ROOT = join(
  ROOT,
  "public/formula-library/v1/runtime/published/definitions",
);
const HANDOFF_MARKER = "<!-- BEGIN STANDARD_MIGRATION_WORK_PACKAGES_JSON -->";
const SHA256 = /^[a-f0-9]{64}$/;
const UUID_V5 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PRIVATE_HANDOFF_RELATIVE_PATH = "authority/revision-3-handoff.md";
const PRIVATE_ATTESTATION_PATH = join(
  ROOT,
  "resources/formula-library/v1/publication-isolation-private-attestation.v1.json",
);

const FROZEN_PUBLICATION_AUTHORITY_V1 = {
  decisionContentHash:
    "cac35a05d2d0c219b4f5ac00f3dea5b5fbb2b9c6b2fc15ea3383ef0f62d6031d",
  publishedIndexCanonicalSha256:
    "362f327b260f38ceb1d9afd7dc619d4ef010f8365ee84a8673ba1df6285fc3f5",
  identitySetSha256:
    "77f396783c66d4efd32d27f0dc85d646b9d3ef263490b007e7ab44d602dece7d",
  publishedSetSha256:
    "751f7cdec829a548dfac84b08c3e6441acd528347343522c0748385729cf3d39",
  heldSetSha256:
    "aafe40f5b36da3e0ef577bca7b18017089097a6606422ad5492ca5121074864d",
  gplHeldSetSha256:
    "f40564220d587e15de24fad8c98db22b26eb93aa76e6e2181e78fec058b01db8",
  cleanRoomSetSha256:
    "4563a59e95c00a6b86fddfb0c06fc04ba5133d49ff0391250f38c87c9ebaf558",
  cleanRoomPublishedSetSha256:
    "2bb00ca182e7ae05c609c9da1341c6ecb34092a1118587fae556b2a4c048b5fb",
  cleanRoomHeldSetSha256:
    "72776e6c7d5e34e9d29c3cf23fe5f577d4b958ac63f8b8e0de8abbdbdcd0f3b8",
} as const;

// Replaced only after a controlled private-evidence pass creates the attestation.
const FROZEN_PRIVATE_ATTESTATION_SHA256 =
  "c6cd4f55de57b79e61b9ea3608e79bc2263b1e504c469fc6cc583fc9e3aa55c7";

interface JsonRecord {
  [key: string]: unknown;
}

export interface IsolationContract extends JsonRecord {
  schema: string;
  version: number;
  decisionRevision: number;
  counts: JsonRecord;
  publicBindings: JsonRecord;
  privateBindings: JsonRecord;
  forbiddenPublicKeys: string[];
  forbiddenPublicPathMarkers: string[];
  buildRoots: string[];
  contentHash: string;
}

export interface PublicationIsolationDataV1 {
  readonly decisions: JsonRecord;
  readonly runtimeIndex: JsonRecord;
  readonly runtimeManifest: JsonRecord;
  readonly previewManifest: JsonRecord;
  readonly records: readonly JsonRecord[];
}

export interface PublicationIsolationSummaryV1 {
  readonly formulaIdentities: number;
  readonly published: number;
  readonly held: number;
  readonly excluded: number;
  readonly gplHeld: number;
  readonly cleanRoomPublished: number;
  readonly cleanRoomHeld: number;
  readonly runtimeRows: number;
  readonly previewRows: number;
}

export interface TextSurfaceV1 {
  readonly name: string;
  readonly text: string;
}

export interface LeakageMatchV1 {
  readonly surface: string;
  readonly kind: "path-marker" | "private-locator" | "private-source-fragment";
  readonly fingerprint: string;
}

interface PrivateEvidenceArtifactV1 {
  readonly kind: string;
  readonly identity: string;
  readonly sha256: string;
}

interface PrivateEvidenceSummaryV1 {
  readonly cleanRoomReceipts: number;
  readonly bulkReceipts: number;
  readonly bulkInputSpecDrift: number;
  readonly pilotReceipts: number;
  readonly privateSources: number;
  readonly privateLocators: number;
  readonly privateLocatorSetSha256: string;
  readonly evidenceArtifactSha256: string;
  readonly handoffSha256: string;
}

function fail(code: string): never {
  throw new Error(code);
}

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) fail(code);
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

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    invariant(Number.isFinite(value), "publication-isolation-canonical-invalid");
    return JSON.stringify(value);
  }
  if (isDenseArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  invariant(isRecord(value), "publication-isolation-canonical-invalid");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(path: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail("publication-isolation-json-invalid");
  }
  invariant(isRecord(parsed), "publication-isolation-json-invalid");
  return parsed;
}

function readContract(): IsolationContract {
  const contract = readJson(CONTRACT_PATH) as IsolationContract;
  invariant(
    contract.schema === "fractalpark-formula-publication-isolation/v1" &&
      contract.version === 1 &&
      contract.decisionRevision === 4 &&
      isRecord(contract.counts) &&
      isRecord(contract.publicBindings) &&
      isRecord(contract.privateBindings) &&
      isDenseArray(contract.forbiddenPublicKeys) &&
      contract.forbiddenPublicKeys.every((value) => typeof value === "string") &&
      isDenseArray(contract.forbiddenPublicPathMarkers) &&
      contract.forbiddenPublicPathMarkers.every(
        (value) => typeof value === "string",
      ) &&
      isDenseArray(contract.buildRoots) &&
      contract.buildRoots.every((value) => typeof value === "string") &&
      typeof contract.contentHash === "string" &&
      SHA256.test(contract.contentHash),
    "publication-isolation-contract-invalid",
  );
  const unsigned: JsonRecord = { ...contract };
  delete unsigned.contentHash;
  invariant(
    sha256(canonicalJson(unsigned)) === contract.contentHash,
    "publication-isolation-contract-hash-invalid",
  );
  return contract;
}

function stringSet(values: unknown, code: string): Set<string> {
  invariant(isDenseArray(values), code);
  const result = new Set<string>();
  for (const value of values) {
    invariant(typeof value === "string" && !result.has(value), code);
    result.add(value);
  }
  return result;
}

function rowSet(rows: readonly unknown[], code: string): Map<string, JsonRecord> {
  const result = new Map<string, JsonRecord>();
  for (const value of rows) {
    invariant(
      isRecord(value) &&
        typeof value.formulaId === "string" &&
        UUID_V5.test(value.formulaId) &&
        !result.has(value.formulaId),
      code,
    );
    result.set(value.formulaId, value);
  }
  return result;
}

function equalSets(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function identitySetSha256(values: ReadonlySet<string>): string {
  return sha256(canonicalJson([...values].sort()));
}

function assertNoForbiddenKeys(
  value: unknown,
  forbidden: ReadonlySet<string>,
  code: string,
): void {
  if (Array.isArray(value)) {
    for (const child of value) assertNoForbiddenKeys(child, forbidden, code);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    invariant(!forbidden.has(key), code);
    assertNoForbiddenKeys(child, forbidden, code);
  }
}

/**
 * Pure exact-set verifier used by both the CLI and mutation tests. It treats
 * the public decision ledger as accounting input, never as authority to add a
 * runtime row: the runtime, preview, Profile/source/actions projection must
 * equal the exact publish set and every B73/C row is checked independently.
 */
export function verifyPublicationIsolationDataV1(
  input: PublicationIsolationDataV1,
  contract: IsolationContract,
): PublicationIsolationSummaryV1 {
  const { decisions, runtimeIndex, runtimeManifest, previewManifest, records } =
    input;
  const counts = contract.counts;
  invariant(
    contract.publicBindings.publicationDecisionsContentHash ===
      FROZEN_PUBLICATION_AUTHORITY_V1.decisionContentHash &&
      contract.publicBindings.publishedIndexCanonicalSha256 ===
        FROZEN_PUBLICATION_AUTHORITY_V1.publishedIndexCanonicalSha256,
    "publication-isolation-frozen-authority-invalid",
  );
  invariant(
    decisions.schema ===
      "fractalpark-formula-library-publication-decisions/v1" &&
      decisions.decisionRevision === contract.decisionRevision &&
      decisions.formulaCount === counts.formulaIdentities &&
      decisions.contentHash ===
        contract.publicBindings.publicationDecisionsContentHash &&
      isRecord(decisions.decisionCounts) &&
      decisions.decisionCounts.publish === counts.published &&
      decisions.decisionCounts.hold === counts.held &&
      decisions.decisionCounts.exclude === counts.excluded &&
      isDenseArray(decisions.rows) &&
      decisions.rows.length === counts.formulaIdentities,
    "publication-isolation-decisions-invalid",
  );
  invariant(
    decisions.contentHash ===
      FROZEN_PUBLICATION_AUTHORITY_V1.decisionContentHash,
    "publication-isolation-frozen-decision-authority-invalid",
  );
  const decisionsById = rowSet(
    decisions.rows,
    "publication-isolation-decisions-invalid",
  );
  const unsignedDecisions = { ...decisions };
  delete unsignedDecisions.contentHash;
  invariant(
    sha256(canonicalJson(unsignedDecisions)) === decisions.contentHash,
    "publication-isolation-decisions-hash-invalid",
  );
  const publishIds = new Set<string>();
  const heldIds = new Set<string>();
  const gplIds = new Set<string>();
  const cleanRoomPublishIds = new Set<string>();
  const cleanRoomHeldIds = new Set<string>();
  let held = 0;
  let excluded = 0;
  for (const row of decisionsById.values()) {
    if (row.publicationDecision === "publish") publishIds.add(row.formulaId as string);
    else if (row.publicationDecision === "hold") {
      held++;
      heldIds.add(row.formulaId as string);
    }
    else if (row.publicationDecision === "exclude") excluded++;
    else fail("publication-isolation-decisions-invalid");

    if (row.rightsStatus === "gpl-3.0-only") {
      invariant(
        row.publicationDecision === "hold" &&
          row.decisionReason === "held-license-gpl-3.0-only" &&
          row.implementationBasis === null &&
          row.implementationBasisRecordedAt === null &&
          row.leakageScanStatus === "not-applicable",
        "publication-isolation-gpl-exposed",
      );
      gplIds.add(row.formulaId as string);
    }
    if (row.rightsStatus === "no-explicit-permission") {
      if (row.publicationDecision === "publish") {
        invariant(
          row.implementationBasis === "separated-independent-rewrite" &&
            typeof row.implementationBasisRecordedAt === "string" &&
            row.implementationBasisRecordedAt.length > 0 &&
            row.leakageScanStatus === "passed" &&
            row.decisionReason ===
              "publish-cleanroom-independent-rewrite-full-chain-green",
          "publication-isolation-clean-room-evidence-invalid",
        );
        cleanRoomPublishIds.add(row.formulaId as string);
      } else {
        invariant(
          row.publicationDecision === "hold" &&
            row.implementationBasis === null &&
            row.implementationBasisRecordedAt === null &&
            row.leakageScanStatus === "pending" &&
            row.decisionReason === "held-awaiting-independent-rewrite",
          "publication-isolation-clean-room-held-invalid",
        );
        cleanRoomHeldIds.add(row.formulaId as string);
      }
    }
  }
  invariant(
    decisionsById.size === counts.formulaIdentities &&
      publishIds.size === counts.published &&
      held === counts.held &&
      excluded === counts.excluded &&
      gplIds.size === counts.gplHeld &&
      cleanRoomPublishIds.size === counts.cleanRoomPublished &&
      cleanRoomHeldIds.size === counts.cleanRoomHeld,
    "publication-isolation-accounting-invalid",
  );
  const cleanRoomIds = new Set([
    ...cleanRoomPublishIds,
    ...cleanRoomHeldIds,
  ]);
  invariant(
    identitySetSha256(new Set(decisionsById.keys())) ===
      FROZEN_PUBLICATION_AUTHORITY_V1.identitySetSha256 &&
      identitySetSha256(publishIds) ===
        FROZEN_PUBLICATION_AUTHORITY_V1.publishedSetSha256 &&
      identitySetSha256(heldIds) ===
        FROZEN_PUBLICATION_AUTHORITY_V1.heldSetSha256 &&
      identitySetSha256(gplIds) ===
        FROZEN_PUBLICATION_AUTHORITY_V1.gplHeldSetSha256 &&
      identitySetSha256(cleanRoomIds) ===
        FROZEN_PUBLICATION_AUTHORITY_V1.cleanRoomSetSha256 &&
      identitySetSha256(cleanRoomPublishIds) ===
        FROZEN_PUBLICATION_AUTHORITY_V1.cleanRoomPublishedSetSha256 &&
      identitySetSha256(cleanRoomHeldIds) ===
        FROZEN_PUBLICATION_AUTHORITY_V1.cleanRoomHeldSetSha256,
    "publication-isolation-frozen-identity-set-invalid",
  );

  invariant(
    runtimeIndex.schema ===
      "fractalpark-published-formula-runtime-index/v1" &&
      runtimeIndex.decisionRevision === contract.decisionRevision &&
      runtimeIndex.publicationDecisionsContentHash === decisions.contentHash &&
      runtimeIndex.rowCount === counts.published &&
      isDenseArray(runtimeIndex.rows) &&
      runtimeIndex.rows.length === counts.published,
    "publication-isolation-runtime-index-invalid",
  );
  const runtimeById = rowSet(
    runtimeIndex.rows,
    "publication-isolation-runtime-index-invalid",
  );
  invariant(
    sha256(canonicalJson(runtimeIndex)) ===
      contract.publicBindings.publishedIndexCanonicalSha256 &&
      contract.publicBindings.publishedIndexCanonicalSha256 ===
        FROZEN_PUBLICATION_AUTHORITY_V1.publishedIndexCanonicalSha256,
    "publication-isolation-runtime-index-hash-invalid",
  );
  invariant(
    equalSets(new Set(runtimeById.keys()), publishIds),
    "publication-isolation-runtime-set-invalid",
  );
  for (const [formulaId, runtimeRow] of runtimeById) {
    const decision = decisionsById.get(formulaId);
    invariant(
      decision?.implementationBasis === runtimeRow.implementationBasis &&
        typeof runtimeRow.sourceRevision === "string" &&
        SHA256.test(runtimeRow.sourceRevision) &&
        typeof runtimeRow.semanticHash === "string" &&
        SHA256.test(runtimeRow.semanticHash) &&
        runtimeRow.definitionPath ===
          `definitions/${runtimeRow.sourceRevision}.frm` &&
        isRecord(runtimeRow.profile),
      "publication-isolation-runtime-row-invalid",
    );
  }

  invariant(
    runtimeManifest.schema ===
      "fractalpark-published-formula-runtime-manifest/v1" &&
      runtimeManifest.decisionRevision === contract.decisionRevision &&
      runtimeManifest.publicationDecisionsContentHash === decisions.contentHash &&
      runtimeManifest.rowCount === counts.published &&
      runtimeManifest.definitionCount === counts.published &&
      runtimeManifest.indexCanonicalSha256 ===
        contract.publicBindings.publishedIndexCanonicalSha256,
    "publication-isolation-runtime-manifest-invalid",
  );

  invariant(
    previewManifest.schema === "fractalpark-formula-record-previews/v1" &&
      previewManifest.decisionRevision === contract.decisionRevision &&
      previewManifest.publicationDecisionsContentHash === decisions.contentHash &&
      previewManifest.rowCount === counts.published &&
      isDenseArray(previewManifest.rows) &&
      previewManifest.rows.length === counts.published,
    "publication-isolation-preview-manifest-invalid",
  );
  const unsignedPreviewManifest = { ...previewManifest };
  delete unsignedPreviewManifest.manifestContentHash;
  invariant(
    typeof previewManifest.manifestContentHash === "string" &&
      sha256(JSON.stringify(unsignedPreviewManifest)) ===
        previewManifest.manifestContentHash,
    "publication-isolation-preview-manifest-hash-invalid",
  );
  const previewById = rowSet(
    previewManifest.rows,
    "publication-isolation-preview-manifest-invalid",
  );
  invariant(
    equalSets(new Set(previewById.keys()), publishIds),
    "publication-isolation-preview-set-invalid",
  );
  for (const [formulaId, previewRow] of previewById) {
    const runtimeRow = runtimeById.get(formulaId);
    invariant(
      runtimeRow &&
        previewRow.sourceRevision === runtimeRow.sourceRevision &&
        previewRow.file === `${formulaId}.png` &&
        typeof previewRow.pngSha256 === "string" &&
        SHA256.test(previewRow.pngSha256),
      "publication-isolation-preview-row-invalid",
    );
  }

  invariant(
    isDenseArray(records) && records.length === counts.formulaIdentities,
    "publication-isolation-records-invalid",
  );
  const recordsById = rowSet(records, "publication-isolation-records-invalid");
  invariant(
    equalSets(new Set(recordsById.keys()), new Set(decisionsById.keys())),
    "publication-isolation-record-set-invalid",
  );
  const forbiddenKeys = new Set(contract.forbiddenPublicKeys);
  for (const [formulaId, record] of recordsById) {
    assertNoForbiddenKeys(
      record,
      forbiddenKeys,
      "publication-isolation-record-private-field",
    );
    const decision = decisionsById.get(formulaId);
    invariant(
      decision &&
        record.publicationDecision === decision.publicationDecision &&
        record.rightsStatus === decision.rightsStatus,
      "publication-isolation-record-decision-drift",
    );
    if (decision.publicationDecision === "publish") {
      invariant(
        record.availability === "published" &&
          isRecord(record.source) &&
          isRecord(record.historicalSource) &&
          isRecord(record.defaultProfile) &&
          isRecord(record.preview) &&
          isRecord(record.actions),
        "publication-isolation-published-record-incomplete",
      );
    } else {
      invariant(
        record.availability === decision.publicationDecision &&
          !("source" in record) &&
          !("historicalSource" in record) &&
          !("defaultProfile" in record) &&
          !("preview" in record) &&
          !("actions" in record),
        "publication-isolation-held-record-exposed",
      );
    }
    if (gplIds.has(formulaId)) {
      invariant(
        !runtimeById.has(formulaId) &&
          !previewById.has(formulaId) &&
          !("source" in record) &&
          !("defaultProfile" in record) &&
          !("preview" in record) &&
          !("actions" in record),
        "publication-isolation-gpl-exposed",
      );
    }
  }

  return Object.freeze({
    formulaIdentities: decisionsById.size,
    published: publishIds.size,
    held,
    excluded,
    gplHeld: gplIds.size,
    cleanRoomPublished: cleanRoomPublishIds.size,
    cleanRoomHeld: cleanRoomHeldIds.size,
    runtimeRows: runtimeById.size,
    previewRows: previewById.size,
  });
}

function textFragments(value: string): Set<string> {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.split(";", 1)[0] ?? "")
    .map((line) => line.trim().replace(/\s+/g, " ").toLowerCase())
    .filter(Boolean);
  const fragments = new Set<string>();
  for (const line of lines) if (line.length >= 48) fragments.add(line);
  for (let index = 0; index + 2 < lines.length; index++) {
    const window = lines.slice(index, index + 3).join("\n");
    if (window.length >= 80) fragments.add(window);
  }
  const whole = lines.join("\n");
  if (whole.length >= 80) fragments.add(whole);
  return fragments;
}

function normalizedCandidateFragments(value: string): Set<string> {
  return textFragments(value.replace(/\\n/g, "\n"));
}

/** Public mutation-test helper. Fingerprints are returned instead of private text. */
export function scanLeakageSurfacesV1(
  surfaces: readonly TextSurfaceV1[],
  pathMarkers: readonly string[],
  privateLocators: readonly string[],
  privateSources: readonly string[],
): readonly LeakageMatchV1[] {
  const sourceFragments = new Set<string>();
  for (const source of privateSources)
    for (const fragment of textFragments(source)) sourceFragments.add(fragment);
  const matches: LeakageMatchV1[] = [];
  for (const surface of surfaces) {
    for (const marker of pathMarkers) {
      if (marker && surface.text.includes(marker)) {
        matches.push({
          surface: surface.name,
          kind: "path-marker",
          fingerprint: sha256(marker),
        });
      }
    }
    for (const locator of privateLocators) {
      if (locator.length >= 20 && surface.text.includes(locator)) {
        matches.push({
          surface: surface.name,
          kind: "private-locator",
          fingerprint: sha256(locator),
        });
      }
    }
    const candidates = normalizedCandidateFragments(surface.text);
    for (const candidate of candidates) {
      if (sourceFragments.has(candidate)) {
        matches.push({
          surface: surface.name,
          kind: "private-source-fragment",
          fingerprint: sha256(candidate),
        });
      }
    }
  }
  return Object.freeze(matches.map((match) => Object.freeze(match)));
}

function recursiveFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const result: string[] = [];
  const visit = (path: string) => {
    const metadata = lstatSync(path);
    invariant(!metadata.isSymbolicLink(), "publication-isolation-symlink-invalid");
    if (metadata.isFile()) {
      result.push(path);
      return;
    }
    invariant(metadata.isDirectory(), "publication-isolation-path-invalid");
    for (const entry of readdirSync(path).sort()) visit(join(path, entry));
  };
  visit(root);
  return result;
}

function textSurface(path: string): TextSurfaceV1 | null {
  const metadata = statSync(path);
  if (!metadata.isFile() || metadata.size > 32 * 1024 * 1024) return null;
  const bytes = readFileSync(path);
  if (bytes.subarray(0, 8_192).includes(0)) return null;
  return { name: relative(ROOT, path), text: bytes.toString("utf8") };
}

function publicJsonPaths(): string[] {
  const roots = [
    join(ROOT, "public/formula-library/v1"),
    join(ROOT, "resources/formula-library/v1/runtime"),
  ];
  const paths = roots.flatMap(recursiveFiles).filter((path) => path.endsWith(".json"));
  paths.push(DECISIONS_PATH, PRIVATE_ATTESTATION_PATH, RECORD_PROVENANCE_PATH);
  return [...new Set(paths)].sort();
}

function verifyPublicAssets(contract: IsolationContract): number {
  const forbidden = new Set(contract.forbiddenPublicKeys);
  let checked = 0;
  for (const path of publicJsonPaths()) {
    const value = readJson(path);
    assertNoForbiddenKeys(
      value,
      forbidden,
      "publication-isolation-public-asset-private-field",
    );
    checked++;
  }
  return checked;
}

function gitTrackedFiles(): string[] {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "buffer",
  });
  invariant(result.status === 0, "publication-isolation-git-files-failed");
  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort();
}

function verifyRepositoryBoundary(): readonly string[] {
  const tracked = gitTrackedFiles();
  invariant(
    tracked.every(
      (path) =>
        path !== ".formula-library-private" &&
        !path.startsWith(".formula-library-private/"),
    ),
    "publication-isolation-private-path-tracked",
  );
  const ignore = readFileSync(join(ROOT, ".gitignore"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim());
  invariant(
    ignore.includes("/.formula-library-private/"),
    "publication-isolation-private-ignore-missing",
  );
  return tracked;
}

function verifyDefinitionInventory(runtimeIndex: JsonRecord): number {
  invariant(isDenseArray(runtimeIndex.rows), "publication-isolation-runtime-index-invalid");
  const expected = new Set<string>();
  for (const value of runtimeIndex.rows) {
    invariant(
      isRecord(value) &&
        typeof value.sourceRevision === "string" &&
        SHA256.test(value.sourceRevision),
      "publication-isolation-runtime-row-invalid",
    );
    const file = `${value.sourceRevision}.frm`;
    invariant(!expected.has(file), "publication-isolation-definition-duplicate");
    expected.add(file);
    const bytes = readFileSync(join(DEFINITIONS_ROOT, file));
    invariant(
      sha256(bytes) === value.sourceRevision,
      "publication-isolation-definition-hash-invalid",
    );
  }
  const actual = new Set(
    readdirSync(DEFINITIONS_ROOT).filter((file) => file.endsWith(".frm")),
  );
  invariant(
    equalSets(actual, expected),
    "publication-isolation-definition-set-invalid",
  );
  return actual.size;
}

function verifyBuildOutput(
  contract: IsolationContract,
  privateLocators: readonly string[] = [],
  privateSources: readonly string[] = [],
): { files: number; sourceMaps: number } {
  invariant(
    existsSync(join(ROOT, ".next/BUILD_ID")),
    "publication-isolation-build-output-missing",
  );
  const roots = contract.buildRoots.map((path) => join(ROOT, path));
  invariant(
    existsSync(roots[0]!) && existsSync(roots[1]!),
    "publication-isolation-build-output-missing",
  );
  const files = roots.flatMap(recursiveFiles);
  const surfaces = files.map(textSurface).filter((value) => value !== null);
  const matches = scanLeakageSurfacesV1(
    surfaces,
    contract.forbiddenPublicPathMarkers,
    privateLocators,
    privateSources,
  );
  invariant(
    matches.length === 0,
    "publication-isolation-build-output-leakage",
  );
  let sourceMaps = 0;
  for (const file of files.filter((path) => extname(path) === ".map")) {
    sourceMaps++;
    const map = readJson(file);
    invariant(
      isDenseArray(map.sources) &&
        map.sources.every(
          (source) =>
            typeof source === "string" &&
            contract.forbiddenPublicPathMarkers.every(
              (marker) => !source.includes(marker),
            ),
        ),
      "publication-isolation-sourcemap-path-leakage",
    );
    if (map.sourcesContent !== undefined) {
      invariant(
        isDenseArray(map.sourcesContent) &&
          map.sourcesContent.every(
            (content) => content === null || typeof content === "string",
          ),
        "publication-isolation-sourcemap-invalid",
      );
      const contentSurfaces = map.sourcesContent
        .map((content, index) =>
          typeof content === "string"
            ? { name: `${relative(ROOT, file)}#${index}`, text: content }
            : null,
        )
        .filter((value) => value !== null);
      invariant(
        scanLeakageSurfacesV1(
          contentSurfaces,
          contract.forbiddenPublicPathMarkers,
          privateLocators,
          privateSources,
        ).length === 0,
        "publication-isolation-sourcemap-content-leakage",
      );
    }
  }
  return { files: files.length, sourceMaps };
}

function assertPrivateFile(path: string): Buffer {
  const metadata = lstatSync(path);
  invariant(
    metadata.isFile() &&
      !metadata.isSymbolicLink() &&
      metadata.nlink === 1 &&
      ((metadata.mode & 0o777) === 0o600 ||
        (metadata.mode & 0o777) === 0o400 ||
        (metadata.mode & 0o777) === 0o644),
    "publication-isolation-private-file-invalid",
  );
  return readFileSync(path);
}

function recordPrivateArtifact(
  artifacts: PrivateEvidenceArtifactV1[],
  kind: string,
  identity: string,
  path: string,
): Buffer {
  const bytes = assertPrivateFile(path);
  artifacts.push({ kind, identity, sha256: sha256(bytes) });
  return bytes;
}

function privateEvidenceArtifactSha256(
  artifacts: readonly PrivateEvidenceArtifactV1[],
): string {
  const rows = [...new Map(
    artifacts.map((row) => [`${row.kind}\u0000${row.identity}\u0000${row.sha256}`, row]),
  ).values()].sort((left, right) => {
    const leftKey = `${left.kind}\u0000${left.identity}\u0000${left.sha256}`;
    const rightKey = `${right.kind}\u0000${right.identity}\u0000${right.sha256}`;
    return leftKey.localeCompare(rightKey);
  });
  return sha256(canonicalJson(rows));
}

function privateJson(path: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(assertPrivateFile(path).toString("utf8"));
  } catch {
    fail("publication-isolation-private-json-invalid");
  }
  invariant(isRecord(parsed), "publication-isolation-private-json-invalid");
  return parsed;
}

function assertPrivateBinding(
  contract: IsolationContract,
  key: string,
  path: string,
): Buffer {
  const bytes = assertPrivateFile(path);
  invariant(
    typeof contract.privateBindings[key] === "string" &&
      sha256(bytes) === contract.privateBindings[key],
    "publication-isolation-private-binding-invalid",
  );
  return bytes;
}

function parseHandoff(path: string): JsonRecord {
  const markdown = assertPrivateFile(path).toString("utf8");
  const marker = markdown.indexOf(HANDOFF_MARKER);
  const start = markdown.indexOf("{", marker);
  const end = markdown.indexOf("```", start);
  invariant(
    marker >= 0 && start > marker && end > start,
    "publication-isolation-handoff-invalid",
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(markdown.slice(start, end));
  } catch {
    fail("publication-isolation-handoff-invalid");
  }
  invariant(isRecord(parsed), "publication-isolation-handoff-invalid");
  return parsed;
}

function securePrivateRoot(): string {
  const configured = process.env.FRACTALPARK_FORMULA_PRIVATE_ROOT;
  const root = resolve(
    configured ?? join(ROOT, ".formula-library-private/formula-library-v1"),
  );
  const real = realpathSync(root);
  const metadata = lstatSync(real);
  invariant(
    real === root &&
      metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      (metadata.mode & 0o777) === 0o700,
    "publication-isolation-private-root-invalid",
  );
  return real;
}

function receiptIndex(privateRoot: string): Map<string, string> {
  const paths = [
    ...recursiveFiles(join(privateRoot, "clean-room-bulk-v1")),
    ...recursiveFiles(join(privateRoot, "clean-room-pilot-v1/receipts")),
  ].filter(
    (path) =>
      path.endsWith(".json") &&
      (path.includes(`${sep}bulk-receipts-batch`) ||
        path.includes(`${sep}clean-room-pilot-v1${sep}receipts${sep}`)),
  );
  const result = new Map<string, string>();
  for (const path of paths) {
    const bytes = assertPrivateFile(path);
    const hash = sha256(bytes);
    invariant(!result.has(hash), "publication-isolation-receipt-hash-duplicate");
    result.set(hash, path);
  }
  return result;
}

function repairReceiptIndex(privateRoot: string): Map<string, string> {
  const root = join(privateRoot, "clean-room-repair-c23");
  if (!existsSync(root)) return new Map();
  const result = new Map<string, string>();
  for (const path of recursiveFiles(root).filter((candidate) =>
    candidate.endsWith(`${sep}receipt.json`),
  )) {
    const hash = sha256(assertPrivateFile(path));
    invariant(
      !result.has(hash),
      "publication-isolation-repair-receipt-hash-duplicate",
    );
    result.set(hash, path);
  }
  return result;
}

function verifyRepairReceipt(
  receipt: JsonRecord,
  manifestRow: JsonRecord,
  definitionSha256: string,
  repairReceiptPath: string,
  inputManifestSha256: string,
  artifacts: PrivateEvidenceArtifactV1[],
): void {
  const base = dirname(repairReceiptPath);
  recordPrivateArtifact(
    artifacts,
    "repair-receipt",
    String(manifestRow.formulaId),
    repairReceiptPath,
  );
  const unsigned = { ...receipt };
  delete unsigned.contentHash;
  invariant(
    receipt.schema === "fractalpark-clean-room-repair-receipt/v1" &&
      receipt.formulaId === manifestRow.formulaId &&
      receipt.purpose === "commit-23-publication-isolation-evidence-repair" &&
      typeof receipt.contentHash === "string" &&
      sha256(canonicalJson(unsigned)) === receipt.contentHash &&
      typeof receipt.startedAt === "string" &&
      typeof receipt.completedAt === "string" &&
      receipt.startedAt < receipt.completedAt &&
      isRecord(receipt.isolation) &&
      receipt.isolation.osUser === "cleanroom" &&
      receipt.isolation.workspaceMode === "0700" &&
      receipt.isolation.repositoryVisible === false &&
      receipt.isolation.privateSourceVisible === false &&
      receipt.isolation.credentialMaterialPersisted === false &&
      isRecord(receipt.isolation.allowedInputs) &&
      receipt.isolation.allowedInputCount === 5 &&
      receipt.isolation.allowedInputCount ===
        Object.keys(receipt.isolation.allowedInputs).length &&
      Object.values(receipt.isolation.allowedInputs).every(
        (hash) => typeof hash === "string" && SHA256.test(hash),
      ) &&
      isDenseArray(receipt.isolation.transcripts) &&
      receipt.isolation.transcripts.length === 2 &&
      isRecord(receipt.implementation) &&
      receipt.implementation.outputSha256 === definitionSha256 &&
      receipt.implementation.semanticHash === manifestRow.semanticHash &&
      receipt.implementation.rounds === 2 &&
      typeof receipt.implementation.controllerCorrection === "string" &&
      isRecord(receipt.acceptance) &&
      receipt.acceptance.canonicalRoundTrip === true &&
      receipt.acceptance.cpuOracle === "passed" &&
      receipt.acceptance.cpuOracleRuns === 3 &&
      receipt.acceptance.deterministic === true &&
      receipt.acceptance.webgl === "passed" &&
      isRecord(receipt.leakageScan) &&
      receipt.leakageScan.verdict === "pass" &&
      isDenseArray(receipt.leakageScan.sharedSourceIdentifiers) &&
      receipt.leakageScan.sharedSourceIdentifiers.length === 0,
    "publication-isolation-repair-receipt-invalid",
  );
  const manifestPath = join(base, "input-manifest.json");
  const inputManifestBytes = recordPrivateArtifact(
    artifacts,
    "repair-input-manifest",
    String(manifestRow.formulaId),
    manifestPath,
  );
  const inputManifest = privateJson(manifestPath);
  invariant(
    sha256(inputManifestBytes) === inputManifestSha256,
    "publication-isolation-repair-input-manifest-invalid",
  );
  invariant(
    inputManifest.schema === "fractalpark-clean-room-input-manifest/v1" &&
      inputManifest.formulaId === manifestRow.formulaId &&
      inputManifest.osUser === "cleanroom" &&
      inputManifest.repositoryVisible === false &&
      inputManifest.privateSourceVisible === false &&
      isDenseArray(inputManifest.inputs) &&
      inputManifest.inputs.length === receipt.isolation.allowedInputCount,
    "publication-isolation-repair-input-manifest-invalid",
  );
  const manifestHashes = new Set(
    inputManifest.inputs.map((entry) => {
      invariant(
        isRecord(entry) &&
          typeof entry.sha256 === "string" &&
          SHA256.test(entry.sha256),
        "publication-isolation-repair-input-manifest-invalid",
      );
      return entry.sha256;
    }),
  );
  invariant(
    manifestHashes.size === inputManifest.inputs.length &&
      Object.values(receipt.isolation.allowedInputs).every((hash) =>
        manifestHashes.has(String(hash)),
      ),
    "publication-isolation-repair-input-manifest-invalid",
  );
  const archivedInputPaths = recursiveFiles(join(base, "inputs")).sort();
  const archivedInputHashes = new Set(
    archivedInputPaths.map((path, index) =>
      sha256(
        recordPrivateArtifact(
          artifacts,
          "repair-input",
          `${String(manifestRow.formulaId)}:${index}`,
          path,
        ),
      ),
    ),
  );
  const archivedOutputPath = join(
    base,
    "output",
    `${String(manifestRow.formulaId)}.frm`,
  );
  const archivedOutput = recordPrivateArtifact(
    artifacts,
    "repair-output",
    String(manifestRow.formulaId),
    archivedOutputPath,
  );
  invariant(
    archivedInputPaths.length === inputManifest.inputs.length &&
      archivedInputHashes.size === manifestHashes.size &&
      [...manifestHashes].every((hash) => archivedInputHashes.has(hash)) &&
      sha256(archivedOutput) === definitionSha256,
    "publication-isolation-repair-archive-invalid",
  );
  for (const transcript of receipt.isolation.transcripts) {
    invariant(
      isRecord(transcript) &&
        typeof transcript.ref === "string" &&
        transcript.ref.startsWith("transcripts/") &&
        !transcript.ref.includes("..") &&
        typeof transcript.sha256 === "string" &&
        SHA256.test(transcript.sha256) &&
        sha256(
          recordPrivateArtifact(
            artifacts,
            "repair-transcript",
            `${String(manifestRow.formulaId)}:${transcript.ref}`,
            join(base, transcript.ref),
          ),
        ) === transcript.sha256,
      "publication-isolation-repair-transcript-invalid",
    );
  }
}

function verifyBulkReceipt(
  receipt: JsonRecord,
  manifestRow: JsonRecord,
  definitionSha256: string,
  privateRoot: string,
  repairReceipts: ReadonlyMap<string, string>,
  archivedInputsByHash: ReadonlyMap<string, string>,
  archivedOutputsByHash: ReadonlyMap<string, string>,
  artifacts: PrivateEvidenceArtifactV1[],
): boolean {
  const formulaId = String(manifestRow.formulaId);
  invariant(
    receipt.schema === "fractalpark-clean-room-bulk-receipt/1" &&
      receipt.formulaId === manifestRow.formulaId &&
      receipt.verdict === "accepted" &&
      isRecord(receipt.basis) &&
      receipt.basis.freezeBeforeSession === true &&
      receipt.basis.specSha256 ===
        (manifestRow.evidence as JsonRecord).specSha256 &&
      typeof receipt.basis.frozenAt === "string" &&
      isRecord(receipt.implementation) &&
      receipt.implementation.outputSha256 === definitionSha256 &&
      typeof receipt.implementation.sessionStart === "string" &&
      receipt.basis.frozenAt < receipt.implementation.sessionStart &&
      isRecord(receipt.isolation) &&
      typeof receipt.isolation.auditFindings === "string" &&
      (receipt.isolation.auditFindings.startsWith("zero unexplained") ||
        (typeof receipt.isolation.repairReceiptSha256 === "string" &&
          SHA256.test(receipt.isolation.repairReceiptSha256))) &&
      isRecord(receipt.scan) &&
      isDenseArray(receipt.scan.sharedSourceIdentifiers) &&
      (receipt.scan.verdict === "pass" || receipt.scan.verdict === "escalated"),
    "publication-isolation-bulk-receipt-invalid",
  );
  invariant(
    Number.isInteger(receipt.batch) &&
      Number(receipt.batch) >= 0 &&
      Number(receipt.batch) <= 8,
    "publication-isolation-bulk-receipt-invalid",
  );
  const batch = Number(receipt.batch);
  const bulkRoot = join(privateRoot, "clean-room-bulk-v1");
  const specPath = archivedInputsByHash.get(String(receipt.basis.specSha256));
  invariant(specPath, "publication-isolation-bulk-spec-invalid");
  const specBytes = recordPrivateArtifact(
    artifacts,
    "bulk-spec",
    formulaId,
    specPath,
  );
  invariant(
    sha256(specBytes) === receipt.basis.specSha256,
    "publication-isolation-bulk-spec-invalid",
  );
  const outputPath = archivedOutputsByHash.get(definitionSha256);
  invariant(outputPath, "publication-isolation-bulk-output-invalid");
  invariant(
    sha256(
      recordPrivateArtifact(
        artifacts,
        "bulk-output",
        formulaId,
        outputPath,
      ),
    ) === definitionSha256,
    "publication-isolation-bulk-output-invalid",
  );
  const specManifestPath = join(bulkRoot, `spec-manifest-batch${batch}.json`);
  const specManifest = privateJson(specManifestPath);
  recordPrivateArtifact(
    artifacts,
    "bulk-spec-manifest",
    String(batch),
    specManifestPath,
  );
  invariant(
    specManifest.schema === "fractalpark-clean-room-spec-manifest/1" &&
      specManifest.batch === batch &&
      isDenseArray(specManifest.rows),
    "publication-isolation-bulk-spec-manifest-invalid",
  );
  const specManifestById = rowSet(
    specManifest.rows,
    "publication-isolation-bulk-spec-manifest-invalid",
  );
  const specManifestRow = specManifestById.get(formulaId);
  invariant(
    typeof specManifestRow?.specFile === "string" &&
      !specManifestRow.specFile.includes("..") &&
      specManifestRow.specFile.endsWith(`${formulaId}.json`) &&
      typeof specManifestRow.specSha256 === "string" &&
      SHA256.test(specManifestRow.specSha256),
    "publication-isolation-bulk-spec-manifest-invalid",
  );

  const hasRepair = typeof receipt.isolation.repairReceiptSha256 === "string";
  let inputSpecMatchesReceipt = true;
  if (!hasRepair) {
    const inputManifestPath = archivedInputsByHash.get(
      String(receipt.isolation.implementerInputManifestSha256),
    );
    invariant(
      inputManifestPath,
      "publication-isolation-bulk-input-manifest-invalid",
    );
    const inputManifestBytes = recordPrivateArtifact(
      artifacts,
      "bulk-input-manifest",
      String(batch),
      inputManifestPath,
    );
    const inputManifest = privateJson(inputManifestPath);
    invariant(
      sha256(inputManifestBytes) ===
        receipt.isolation.implementerInputManifestSha256 &&
        inputManifest.schema === "fractalpark-clean-room-implementer-input/1" &&
        inputManifest.batch === batch &&
        inputManifest.rowCount === specManifest.rows.length,
      "publication-isolation-bulk-input-manifest-shape-invalid",
    );
    const fileMaps: JsonRecord[] = [];
    if (isRecord(inputManifest.files)) fileMaps.push(inputManifest.files);
    if (isDenseArray(inputManifest.rounds)) {
      for (const round of inputManifest.rounds) {
        invariant(
          isRecord(round) &&
            typeof round.promptSha256 === "string" &&
            SHA256.test(round.promptSha256) &&
            isRecord(round.files),
          "publication-isolation-bulk-input-manifest-shape-invalid",
        );
        fileMaps.push(round.files);
      }
    }
    invariant(
      fileMaps.length > 0,
      "publication-isolation-bulk-input-manifest-shape-invalid",
    );
    const inputSpecHashes = new Set<string>();
    for (const files of fileMaps) {
      const specHash = files[`specs/${formulaId}.json`];
      if (typeof specHash === "string" && SHA256.test(specHash)) {
        inputSpecHashes.add(specHash);
      }
      for (const hash of Object.values(files)) {
        invariant(
          typeof hash === "string" &&
            SHA256.test(hash) &&
            archivedInputsByHash.has(hash),
          "publication-isolation-bulk-input-archive-invalid",
        );
        recordPrivateArtifact(
          artifacts,
          "bulk-allowed-input",
          hash,
          archivedInputsByHash.get(hash)!,
        );
      }
    }
    invariant(
      inputSpecHashes.size > 0 &&
        [...inputSpecHashes].every((hash) => archivedInputsByHash.has(hash)),
      "publication-isolation-bulk-input-manifest-spec-invalid",
    );
    inputSpecMatchesReceipt = inputSpecHashes.has(
      String(receipt.basis.specSha256),
    );
    if (isDenseArray(inputManifest.rows)) {
      const inputRows = rowSet(
        inputManifest.rows,
        "publication-isolation-bulk-input-manifest-invalid",
      );
      invariant(
        inputRows.has(formulaId),
        "publication-isolation-bulk-input-manifest-invalid",
      );
    }
  }

  const acceptancePath = join(
    bulkRoot,
    `receipts-batch${batch}`,
    `${formulaId}.json`,
  );
  const acceptance = privateJson(acceptancePath);
  recordPrivateArtifact(
    artifacts,
    "bulk-acceptance-receipt",
    formulaId,
    acceptancePath,
  );
  invariant(
    acceptance.formulaId === formulaId &&
      acceptance.verdict === "accepted" &&
      isRecord(acceptance.stages) &&
      isRecord(acceptance.stages.parse) &&
      acceptance.stages.parse.status === "passed" &&
      acceptance.stages.parse.canonicalRoundTrip === true &&
      acceptance.stages.parse.semanticHash === manifestRow.semanticHash &&
      isRecord(acceptance.stages.cpuOracle) &&
      acceptance.stages.cpuOracle.status === "passed" &&
      acceptance.stages.cpuOracle.deterministic === true &&
      isRecord(acceptance.stages.webgl) &&
      acceptance.stages.webgl.status === "passed",
    "publication-isolation-bulk-acceptance-invalid",
  );
  invariant(
    isDenseArray(receipt.isolation.transcriptRefs) &&
      receipt.isolation.transcriptRefs.length > 0,
    "publication-isolation-bulk-transcript-invalid",
  );
  for (const ref of receipt.isolation.transcriptRefs) {
    invariant(
      typeof ref === "string" &&
        !ref.includes("..") &&
        !ref.startsWith("/") &&
        ref.endsWith(".jsonl") &&
        (ref.startsWith(`transcripts-batch${batch}/`) ||
          ref.startsWith("clean-room-repair-c23/")),
      "publication-isolation-bulk-transcript-invalid",
    );
    const transcriptPath = ref.startsWith("clean-room-repair-c23/")
      ? join(privateRoot, ref)
      : join(bulkRoot, ref);
    recordPrivateArtifact(
      artifacts,
      "bulk-transcript",
      ref,
      transcriptPath,
    );
  }
  const isolation = receipt.isolation;
  if (typeof isolation.repairReceiptSha256 === "string") {
    invariant(
      typeof isolation.implementerInputManifestSha256 === "string" &&
        SHA256.test(isolation.implementerInputManifestSha256),
      "publication-isolation-repair-input-manifest-invalid",
    );
    const repairReceiptPath = repairReceipts.get(
      isolation.repairReceiptSha256,
    );
    invariant(
      repairReceiptPath,
      "publication-isolation-repair-receipt-missing",
    );
    verifyRepairReceipt(
      privateJson(repairReceiptPath),
      manifestRow,
      definitionSha256,
      repairReceiptPath,
      isolation.implementerInputManifestSha256,
      artifacts,
    );
  }
  invariant(
    isRecord(receipt.basis.basisLint) &&
      isDenseArray(receipt.basis.basisLint.leakedSourceIdentifiers) &&
      receipt.basis.basisLint.leakedSourceIdentifiers.length === 0 &&
      (receipt.basis.basisLint.verdict === "pass" ||
        receipt.basis.basisLint.verdict === "pass-merger-override"),
    "publication-isolation-basis-lint-invalid",
  );
  if (receipt.scan.verdict === "pass") {
    invariant(
      receipt.scan.sharedSourceIdentifiers.length === 0,
      "publication-isolation-scan-pass-invalid",
    );
  }
  if (receipt.scan.verdict === "escalated") {
    invariant(
      isRecord(receipt.adjudication) &&
        receipt.adjudication.verdict === "pass" &&
        typeof receipt.adjudication.rationaleRef === "string" &&
        receipt.adjudication.rationaleRef.length > 0,
      "publication-isolation-adjudication-invalid",
    );
  }
  return inputSpecMatchesReceipt;
}

function verifyPilotEvidence(
  contract: IsolationContract,
  privateRoot: string,
  pilotIds: ReadonlySet<string>,
  artifacts: PrivateEvidenceArtifactV1[],
): void {
  const pilotRoot = join(privateRoot, "clean-room-pilot-v1");
  const reportPath = join(pilotRoot, "pilot-report.json");
  const mutationPath = join(pilotRoot, "scanner/gates/mutation-and-f1.json");
  const outputPath = join(pilotRoot, "scanner/gates/f2-implementer-outputs.json");
  const specPath = join(pilotRoot, "spec-manifest.json");
  assertPrivateBinding(contract, "pilotReportSha256", reportPath);
  assertPrivateBinding(contract, "pilotMutationGateSha256", mutationPath);
  assertPrivateBinding(contract, "pilotOutputGateSha256", outputPath);
  assertPrivateBinding(contract, "pilotSpecManifestSha256", specPath);
  assertPrivateBinding(
    contract,
    "pilotInputManifestV1Sha256",
    join(pilotRoot, "implementer-input-manifest.json"),
  );
  assertPrivateBinding(
    contract,
    "pilotInputManifestV2Sha256",
    join(pilotRoot, "implementer-input-manifest-rev2.json"),
  );
  for (const [kind, path] of [
    ["pilot-report", reportPath],
    ["pilot-mutation-gate", mutationPath],
    ["pilot-output-gate", outputPath],
    ["pilot-spec-manifest", specPath],
    ["pilot-input-manifest-v1", join(pilotRoot, "implementer-input-manifest.json")],
    [
      "pilot-input-manifest-v2",
      join(pilotRoot, "implementer-input-manifest-rev2.json"),
    ],
  ] as const) {
    recordPrivateArtifact(artifacts, kind, "pilot", path);
  }
  const report = privateJson(reportPath);
  const mutation = privateJson(mutationPath);
  const outputs = privateJson(outputPath);
  const specs = privateJson(specPath);
  invariant(
    report.schema === "fractalpark-clean-room-pilot-report/1" &&
      report.cohortSize === 9 &&
      isRecord(report.basisBeforeCode) &&
      report.basisBeforeCode.specsFrozenBeforeImplementation === true &&
      isRecord(report.leakageScanner) &&
      isRecord(report.leakageScanner.adjudication) &&
      isDenseArray(report.leakageScanner.adjudication.rows) &&
      isRecord(mutation.mutation) &&
      isRecord(mutation.falsePositiveF1) &&
      isRecord(outputs) &&
      specs.schema === "fractalpark-clean-room-spec-manifest/1" &&
      isDenseArray(specs.rows) &&
      specs.rows.length === 9,
    "publication-isolation-pilot-evidence-invalid",
  );
  const specIds = rowSet(specs.rows, "publication-isolation-pilot-evidence-invalid");
  invariant(
    [...pilotIds].every((formulaId) => specIds.has(formulaId)),
    "publication-isolation-pilot-set-invalid",
  );
  for (const [formulaId, mutations] of Object.entries(mutation.mutation)) {
    invariant(
      isRecord(mutations) &&
        ["M1-rename", "M2-v1-restructure", "M3-reorder-init", "M4-paraphrase"].every(
          (key) => isRecord(mutations[key]) && mutations[key].verdict === "flag",
        ) &&
        isRecord(mutation.falsePositiveF1[formulaId]) &&
        (mutation.falsePositiveF1[formulaId] as JsonRecord).verdict === "pass",
      "publication-isolation-pilot-mutation-invalid",
    );
  }
  const adjudicated = stringSet(
    report.leakageScanner.adjudication.rows,
    "publication-isolation-pilot-adjudication-invalid",
  );
  for (const result of Object.values(outputs)) {
    invariant(
      isRecord(result) &&
        isDenseArray(result.sharedSourceIdentifiers) &&
        result.sharedSourceIdentifiers.length === 0 &&
        (result.verdict === "pass" || result.verdict === "flag"),
      "publication-isolation-pilot-output-invalid",
    );
  }
  const outputEntries = Object.entries(outputs);
  const specNameById = new Map(
    [...specIds].map(([formulaId, row]) => [formulaId, row.displayName]),
  );
  for (const formulaId of pilotIds) {
    const name = specNameById.get(formulaId);
    invariant(
      typeof name === "string" && isRecord(outputs[name]),
      "publication-isolation-pilot-output-invalid",
    );
    if ((outputs[name] as JsonRecord).verdict === "flag") {
      invariant(
        adjudicated.has(name),
        "publication-isolation-pilot-adjudication-invalid",
      );
    }
  }
  invariant(outputEntries.length === 9, "publication-isolation-pilot-output-invalid");
}

function verifyPrivateEvidence(
  contract: IsolationContract,
  runtimeIndex: JsonRecord,
  tracked: readonly string[],
  includeBuild: boolean,
): PrivateEvidenceSummaryV1 {
  const privateRoot = securePrivateRoot();
  const artifacts: PrivateEvidenceArtifactV1[] = [];
  const privateHandoffPath = join(privateRoot, PRIVATE_HANDOFF_RELATIVE_PATH);
  const handoffBytes = recordPrivateArtifact(
    artifacts,
    "private-authority-handoff",
    "v0.4.19-revision-3",
    privateHandoffPath,
  );
  invariant(
    sha256(handoffBytes) === contract.privateBindings.handoffSha256,
    "publication-isolation-handoff-binding-invalid",
  );
  const handoff = parseHandoff(privateHandoffPath);
  const bulkRoot = join(privateRoot, "clean-room-bulk-v1");
  const archivedInputPaths = [
    ...recursiveFiles(join(bulkRoot, "specs")),
    ...recursiveFiles(join(bulkRoot, "quarantine")),
    ...recursiveFiles(join(bulkRoot, "archived-shared-inputs")),
    ...readdirSync(bulkRoot)
      .filter((file) => /^specs-batch\d+$/.test(file))
      .flatMap((directory) => recursiveFiles(join(bulkRoot, directory))),
    ...readdirSync(bulkRoot)
      .filter((file) => /^implementer-input-manifest-batch\d+\.json$/.test(file))
      .map((file) => join(bulkRoot, file)),
  ];
  const archivedInputsByHash = new Map<string, string>();
  for (const path of archivedInputPaths.sort()) {
    const hash = sha256(assertPrivateFile(path));
    if (!archivedInputsByHash.has(hash)) archivedInputsByHash.set(hash, path);
  }
  const archivedOutputsByHash = new Map<string, string>();
  for (const path of recursiveFiles(bulkRoot)
    .filter((candidate) => candidate.endsWith(".frm"))
    .filter((candidate) => {
      const mode = lstatSync(candidate).mode & 0o777;
      return mode === 0o400 || mode === 0o600 || mode === 0o644;
    })
    .sort()) {
    const hash = sha256(assertPrivateFile(path));
    if (!archivedOutputsByHash.has(hash)) archivedOutputsByHash.set(hash, path);
  }
  invariant(
    handoff.schema === "fractalpark-standard-migration-work-packages/v1" &&
      isDenseArray(handoff.rows) &&
      handoff.rows.length === contract.counts.formulaIdentities,
    "publication-isolation-handoff-invalid",
  );

  const releaseManifestPath = join(
    privateRoot,
    "clean-room-bulk-v1/release-manifest-rev3.json",
  );
  const finalCensusPath = join(
    privateRoot,
    "clean-room-bulk-v1/final-census-ledger.json",
  );
  assertPrivateBinding(
    contract,
    "releaseManifestSha256",
    releaseManifestPath,
  );
  assertPrivateBinding(contract, "finalCensusSha256", finalCensusPath);
  recordPrivateArtifact(
    artifacts,
    "release-manifest",
    "revision-3",
    releaseManifestPath,
  );
  recordPrivateArtifact(
    artifacts,
    "final-census",
    "revision-3",
    finalCensusPath,
  );
  const releaseManifest = privateJson(releaseManifestPath);
  const finalCensus = privateJson(finalCensusPath);
  invariant(
    finalCensus.schema === "fractalpark-bulk-final-census-ledger/1" &&
      isDenseArray(finalCensus.rows) &&
      finalCensus.rows.length === 378,
    "publication-isolation-final-census-invalid",
  );
  invariant(
    releaseManifest.schema === "fractalpark-bulk-release-manifest/1" &&
      // The clean-room release is immutable revision-3 evidence even when the
      // public decision ledger advances additively.
      releaseManifest.decisionRevision === 3 &&
      releaseManifest.finalCensusLedgerSha256 ===
        contract.privateBindings.finalCensusSha256 &&
      isDenseArray(releaseManifest.rows) &&
      releaseManifest.rows.length === contract.counts.cleanRoomPublished,
    "publication-isolation-release-manifest-invalid",
  );
  const releaseById = rowSet(
    releaseManifest.rows,
    "publication-isolation-release-manifest-invalid",
  );
  const decisions = readJson(DECISIONS_PATH);
  invariant(
    isDenseArray(decisions.rows),
    "publication-isolation-decisions-invalid",
  );
  const aAllDecisionIds = new Set(
    decisions.rows
      .filter(
        (row) =>
          isRecord(row) &&
          row.rightsStatus === "source-declared-public-domain-assumption",
      )
      .map((row) => (row as JsonRecord).formulaId as string),
  );
  const aPublishDecisionIds = new Set(
    decisions.rows
      .filter(
        (row) =>
          isRecord(row) &&
          row.rightsStatus === "source-declared-public-domain-assumption" &&
          row.publicationDecision === "publish",
      )
      .map((row) => (row as JsonRecord).formulaId as string),
  );
  const pAllDecisionIds = new Set(
    decisions.rows
      .filter(
        (row) => isRecord(row) && row.rightsStatus === "project-owned",
      )
      .map((row) => (row as JsonRecord).formulaId as string),
  );
  const pHeldDecisionIds = new Set(
    decisions.rows
      .filter(
        (row) =>
          isRecord(row) &&
          row.rightsStatus === "project-owned" &&
          row.publicationDecision === "hold",
      )
      .map((row) => (row as JsonRecord).formulaId as string),
  );
  const pRecoveredPublishDecisionIds = new Set(
    decisions.rows
      .filter(
        (row) =>
          isRecord(row) &&
          row.rightsStatus === "project-owned" &&
          row.publicationDecision === "publish" &&
          row.decisionReason === "publish-project-owned-recovery-gate-green",
      )
      .map((row) => (row as JsonRecord).formulaId as string),
  );
  const gplDecisionIds = new Set(
    decisions.rows
      .filter(
        (row) =>
          isRecord(row) &&
          row.rightsStatus === "gpl-3.0-only" &&
          row.publicationDecision === "hold",
      )
      .map((row) => (row as JsonRecord).formulaId as string),
  );
  const cleanRoomAllDecisionIds = new Set(
    decisions.rows
      .filter(
        (row) =>
          isRecord(row) && row.rightsStatus === "no-explicit-permission",
      )
      .map((row) => (row as JsonRecord).formulaId as string),
  );
  const cleanRoomDecisionIds = new Set(
    decisions.rows
      .filter(
        (row) =>
          isRecord(row) &&
          row.rightsStatus === "no-explicit-permission" &&
          row.publicationDecision === "publish",
      )
      .map((row) => (row as JsonRecord).formulaId as string),
  );
  invariant(
    equalSets(cleanRoomDecisionIds, new Set(releaseById.keys())),
    "publication-isolation-release-decision-set-invalid",
  );

  invariant(isDenseArray(runtimeIndex.rows), "publication-isolation-runtime-index-invalid");
  const runtimeById = rowSet(
    runtimeIndex.rows,
    "publication-isolation-runtime-index-invalid",
  );
  const receipts = receiptIndex(privateRoot);
  const repairReceipts = repairReceiptIndex(privateRoot);
  const pilotIds = new Set<string>();
  let bulkReceipts = 0;
  let bulkInputSpecDrift = 0;
  let pilotReceipts = 0;
  for (const [formulaId, row] of releaseById) {
    const pilotCarryover = row.pilotCarryover === true;
    invariant(
      row.implementationBasis === "separated-independent-rewrite" &&
        isRecord(row.evidence) &&
        typeof row.evidence.receiptSha256 === "string" &&
        SHA256.test(row.evidence.receiptSha256) &&
        (pilotCarryover ||
          (typeof row.evidence.outputSha256 === "string" &&
            SHA256.test(row.evidence.outputSha256) &&
            typeof row.evidence.specSha256 === "string" &&
            SHA256.test(row.evidence.specSha256))),
      "publication-isolation-release-row-invalid",
    );
    const runtimeRow = runtimeById.get(formulaId);
    invariant(
      runtimeRow &&
        runtimeRow.implementationBasis === "separated-independent-rewrite" &&
        typeof runtimeRow.sourceRevision === "string",
      "publication-isolation-release-runtime-drift",
    );
    const definitionPath = join(
      DEFINITIONS_ROOT,
      `${runtimeRow.sourceRevision}.frm`,
    );
    const definitionSha256 = sha256(readFileSync(definitionPath));
    invariant(
      definitionSha256 === runtimeRow.sourceRevision &&
        (pilotCarryover || definitionSha256 === row.evidence.outputSha256) &&
        (!pilotCarryover || row.semanticHash === runtimeRow.semanticHash),
      "publication-isolation-release-output-drift",
    );
    const receiptPath = receipts.get(row.evidence.receiptSha256);
    invariant(receiptPath, "publication-isolation-receipt-missing");
    recordPrivateArtifact(
      artifacts,
      pilotCarryover ? "pilot-receipt" : "bulk-receipt",
      formulaId,
      receiptPath,
    );
    const receipt = privateJson(receiptPath);
    invariant(
      receipt.formulaId === formulaId,
      "publication-isolation-receipt-formula-drift",
    );
    if (pilotCarryover) {
      pilotIds.add(formulaId);
      pilotReceipts++;
    } else {
      const inputSpecMatchesReceipt = verifyBulkReceipt(
        receipt,
        row,
        definitionSha256,
        privateRoot,
        repairReceipts,
        archivedInputsByHash,
        archivedOutputsByHash,
        artifacts,
      );
      if (!inputSpecMatchesReceipt) bulkInputSpecDrift++;
      bulkReceipts++;
    }
  }
  invariant(
    bulkReceipts === 331 &&
      pilotReceipts === 8 &&
      bulkInputSpecDrift === 26,
    "publication-isolation-receipt-accounting-invalid",
  );
  verifyPilotEvidence(contract, privateRoot, pilotIds, artifacts);

  const aIds = new Set<string>();
  const pIds = new Set<string>();
  const bIds = new Set<string>();
  const cIds = new Set<string>();
  const waiverIds = new Set<string>();
  const privateLocators = new Set<string>();
  for (const value of handoff.rows) {
    invariant(
      isRecord(value) &&
        typeof value.formulaId === "string" &&
        isRecord(value.rights) &&
        isRecord(value.privateProvenanceEvidence) &&
        isRecord(value.fixturesOrOracle),
      "publication-isolation-handoff-row-invalid",
    );
    if (value.rights.class === "A") {
      aIds.add(value.formulaId);
      continue;
    }
    if (value.rights.class === "P") {
      pIds.add(value.formulaId);
      continue;
    }
    if (value.rights.class === "B") {
      bIds.add(value.formulaId);
      continue;
    }
    if (value.rights.class !== "C") continue;
    cIds.add(value.formulaId);
    if (
      value.fixturesOrOracle.oracleStatus ===
      "waiver-probe-not-executable-oracle"
    ) {
      waiverIds.add(value.formulaId);
    }
    const locator = value.privateProvenanceEvidence.sourceLocator;
    if (typeof locator === "string") privateLocators.add(locator);
    const privatePath = value.fixturesOrOracle.privateResolvedPath;
    if (typeof privatePath === "string") privateLocators.add(privatePath);
  }
  const aCensusPath = join(privateRoot, "bulk-migration-ledger.json");
  recordPrivateArtifact(
    artifacts,
    "class-a-census",
    "revision-3",
    aCensusPath,
  );
  const aCensus = privateJson(aCensusPath);
  const unsignedACensus = { ...aCensus };
  delete unsignedACensus.ledgerContentHash;
  invariant(
    sha256(canonicalJson(unsignedACensus)) ===
      contract.privateBindings.aCensusContentHash &&
      aCensus.ledgerContentHash === contract.privateBindings.aCensusContentHash &&
      isDenseArray(aCensus.rows),
    "publication-isolation-a-census-invalid",
  );
  const aCensusPublishIds = new Set(
    aCensus.rows
      .filter((row) => isRecord(row) && row.status === "passed")
      .map((row) => (row as JsonRecord).formulaId as string),
  );
  const b94HeldModule = readFileSync(
    join(ROOT, "src/engine/formulas/v1/native-recipes-b94-held.ts"),
  );
  invariant(
    sha256(b94HeldModule) === contract.privateBindings.b94HeldModuleSha256,
    "publication-isolation-p-held-module-invalid",
  );
  const pHeldAuthorityIds = new Set(
    b94HeldModule
      .toString("utf8")
      .match(/[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g) ?? [],
  );
  const transcendentalRecovery = readJson(
    join(
      ROOT,
      "resources/formula-library/v1/recovery-evidence/transcendental-v1/manifest.json",
    ),
  );
  const amplifiedRecovery = readJson(
    join(
      ROOT,
      "resources/formula-library/v1/recovery-evidence/amplified-v1/manifest.json",
    ),
  );
  invariant(
    isDenseArray(transcendentalRecovery.rows) &&
      transcendentalRecovery.rows.length === 12 &&
      isDenseArray(amplifiedRecovery.rows) &&
      amplifiedRecovery.rows.length === 9,
    "publication-isolation-recovery-evidence-invalid",
  );
  const transcendentalRecoveryIds = new Set(
    transcendentalRecovery.rows.map((row) => (row as JsonRecord).formulaId as string),
  );
  const amplifiedRecoveryIds = new Set(
    amplifiedRecovery.rows.map((row) => (row as JsonRecord).formulaId as string),
  );
  const recoveryAuthorityIds = new Set([
    ...transcendentalRecoveryIds,
    ...amplifiedRecoveryIds,
  ]);
  invariant(
    aIds.size === 137 &&
      equalSets(aIds, aAllDecisionIds) &&
      aCensusPublishIds.size === 106 &&
      equalSets(aCensusPublishIds, aPublishDecisionIds) &&
      pIds.size === 89 &&
      equalSets(pIds, pAllDecisionIds) &&
      pHeldAuthorityIds.size === 9 &&
      equalSets(pHeldAuthorityIds, amplifiedRecoveryIds) &&
      recoveryAuthorityIds.size === 21 &&
      pHeldDecisionIds.size === 0 &&
      equalSets(recoveryAuthorityIds, pRecoveredPublishDecisionIds) &&
      bIds.size === contract.counts.gplHeld &&
      equalSets(bIds, gplDecisionIds) &&
      cIds.size === 378 &&
      waiverIds.size === 8 &&
      equalSets(cIds, cleanRoomAllDecisionIds),
    "publication-isolation-authority-set-invalid",
  );

  const sourceGapIds = new Set(
    finalCensus.rows
      .filter((row) => isRecord(row) && row.status === "held-source-gap")
      .map((row) => (row as JsonRecord).formulaId as string),
  );
  const nonBulkSourceIds = new Set([...waiverIds, ...sourceGapIds]);
  invariant(
    sourceGapIds.size === 1 &&
      nonBulkSourceIds.size === contract.counts.sourceGapWaivers &&
      [...nonBulkSourceIds].every((formulaId) => cIds.has(formulaId)),
    "publication-isolation-nonbulk-source-set-invalid",
  );

  const sourceRoot = join(
    privateRoot,
    "clean-room-bulk-v1/private-sources",
  );
  const sourceFiles = readdirSync(sourceRoot)
    .filter((file) => file.endsWith(".txt"))
    .sort();
  invariant(
    sourceFiles.length === contract.counts.privateSourceRows,
    "publication-isolation-private-source-count-invalid",
  );
  const sourceSetLines: string[] = [];
  const privateSources: string[] = [];
  const sourceIds = new Set<string>();
  for (const file of sourceFiles) {
    const formulaId = file.slice(0, -4);
    invariant(
      UUID_V5.test(formulaId) &&
        cIds.has(formulaId) &&
        !nonBulkSourceIds.has(formulaId) &&
        !sourceIds.has(formulaId),
      "publication-isolation-private-source-set-invalid",
    );
    const bytes = recordPrivateArtifact(
      artifacts,
      "private-source",
      formulaId,
      join(sourceRoot, file),
    );
    sourceIds.add(formulaId);
    sourceSetLines.push(`${formulaId}:${sha256(bytes)}`);
    privateSources.push(bytes.toString("latin1"));
  }
  invariant(
    sourceIds.size + nonBulkSourceIds.size === cIds.size &&
      [...cIds].every((formulaId) =>
        nonBulkSourceIds.has(formulaId)
          ? !sourceIds.has(formulaId)
          : sourceIds.has(formulaId),
      ) &&
      sha256(`${sourceSetLines.join("\n")}\n`) ===
        contract.privateBindings.privateSourceSetSha256,
    "publication-isolation-private-source-set-invalid",
  );

  const candidatePaths = tracked
    .filter(
      (path) =>
        existsSync(join(ROOT, path)) &&
        (path.includes("fixture") ||
          path.includes("/fixtures/") ||
          path.includes("log") ||
          path.endsWith(".map") ||
          path.startsWith("public/") ||
          path.startsWith("resources/")),
    )
    .map((path) => join(ROOT, path));
  const surfaces = candidatePaths
    .map(textSurface)
    .filter((value) => value !== null)
    .filter(
      (surface) =>
        surface.name !==
        "resources/formula-library/v1/publication-isolation.v1.json",
    );
  invariant(
    scanLeakageSurfacesV1(
      surfaces,
      contract.forbiddenPublicPathMarkers,
      [...privateLocators],
      privateSources,
    ).length === 0,
    "publication-isolation-repository-leakage",
  );
  if (includeBuild) {
    verifyBuildOutput(contract, [...privateLocators], privateSources);
  }
  return {
    cleanRoomReceipts: releaseById.size,
    bulkReceipts,
    bulkInputSpecDrift,
    pilotReceipts,
    privateSources: sourceIds.size,
    privateLocators: privateLocators.size,
    privateLocatorSetSha256: identitySetSha256(privateLocators),
    evidenceArtifactSha256: privateEvidenceArtifactSha256(artifacts),
    handoffSha256: sha256(handoffBytes),
  };
}

function verifyPrivateAttestation(
  contract: IsolationContract,
  summary: PublicationIsolationSummaryV1,
  privateSummary: PrivateEvidenceSummaryV1 | null,
): { contentHash: string; fileSha256: string } {
  const bytes = readFileSync(PRIVATE_ATTESTATION_PATH);
  const fileSha256 = sha256(bytes);
  invariant(
    fileSha256 === FROZEN_PRIVATE_ATTESTATION_SHA256,
    "publication-isolation-private-attestation-file-invalid",
  );
  const attestation = readJson(PRIVATE_ATTESTATION_PATH);
  const unsigned = { ...attestation };
  delete unsigned.contentHash;
  invariant(
    attestation.schema ===
      "fractalpark-formula-publication-isolation-private-attestation/v1" &&
      attestation.version === 1 &&
      attestation.decisionRevision === contract.decisionRevision &&
      attestation.contractContentHash === contract.contentHash &&
      typeof attestation.contentHash === "string" &&
      SHA256.test(attestation.contentHash) &&
      sha256(canonicalJson(unsigned)) === attestation.contentHash &&
      isRecord(attestation.publicAuthority) &&
      canonicalJson(attestation.publicAuthority) ===
        canonicalJson(FROZEN_PUBLICATION_AUTHORITY_V1) &&
      isRecord(attestation.counts) &&
      attestation.counts.formulaIdentities === summary.formulaIdentities &&
      attestation.counts.published === summary.published &&
      attestation.counts.held === summary.held &&
      attestation.counts.excluded === summary.excluded &&
      attestation.counts.gplHeld === summary.gplHeld &&
      attestation.counts.cleanRoomPublished === summary.cleanRoomPublished &&
      attestation.counts.cleanRoomHeld === summary.cleanRoomHeld &&
      isRecord(attestation.privateEvidence) &&
      attestation.privateEvidence.status === "verified" &&
      attestation.privateEvidence.verificationMode ===
        "fixed-authority+archived-inputs+transcripts+outputs" &&
      attestation.privateEvidence.handoffSha256 ===
        contract.privateBindings.handoffSha256 &&
      attestation.privateEvidence.privateSourceSetSha256 ===
        contract.privateBindings.privateSourceSetSha256 &&
      attestation.privateEvidence.inputSpecDriftPolicy ===
        "archived-implementer-input-and-final-acceptance-byte-verification-required" &&
      isRecord(attestation.releasePolicy) &&
      attestation.releasePolicy.attestationRequired === true &&
      attestation.releasePolicy.privateEvidenceOnPublicRunner === false &&
      attestation.releasePolicy.buildOutputScanRequired === true,
    "publication-isolation-private-attestation-invalid",
  );
  if (privateSummary) {
    invariant(
      attestation.privateEvidence.cleanRoomReceipts ===
        privateSummary.cleanRoomReceipts &&
        attestation.privateEvidence.bulkReceipts ===
          privateSummary.bulkReceipts &&
        attestation.privateEvidence.bulkInputSpecDrift ===
          privateSummary.bulkInputSpecDrift &&
        attestation.privateEvidence.pilotReceipts ===
          privateSummary.pilotReceipts &&
        attestation.privateEvidence.privateSources ===
          privateSummary.privateSources &&
        attestation.privateEvidence.privateLocators ===
          privateSummary.privateLocators &&
        attestation.privateEvidence.privateLocatorSetSha256 ===
          privateSummary.privateLocatorSetSha256 &&
        attestation.privateEvidence.evidenceArtifactSha256 ===
          privateSummary.evidenceArtifactSha256 &&
        attestation.privateEvidence.handoffSha256 ===
          privateSummary.handoffSha256,
      "publication-isolation-private-attestation-evidence-drift",
    );
  }
  return { contentHash: String(attestation.contentHash), fileSha256 };
}

function actualData(): PublicationIsolationDataV1 {
  const decisions = readJson(DECISIONS_PATH);
  invariant(isDenseArray(decisions.rows), "publication-isolation-decisions-invalid");
  const records = decisions.rows.map((value) => {
    invariant(
      isRecord(value) && typeof value.formulaId === "string",
      "publication-isolation-decisions-invalid",
    );
    const record = buildFormulaRecordV1(
      value.formulaId as Parameters<typeof buildFormulaRecordV1>[0],
      "en",
    );
    invariant(record, "publication-isolation-record-missing");
    return record as unknown as JsonRecord;
  });
  return {
    decisions,
    runtimeIndex: readJson(INDEX_PATH),
    runtimeManifest: readJson(RUNTIME_MANIFEST_PATH),
    previewManifest: readJson(PREVIEW_MANIFEST_PATH),
    records,
  };
}

function main(): void {
  const contract = readContract();
  const data = actualData();
  const summary = verifyPublicationIsolationDataV1(data, contract);
  const publicJsonAssets = verifyPublicAssets(contract);
  const tracked = verifyRepositoryBoundary();
  const definitions = verifyDefinitionInventory(data.runtimeIndex);
  const includeBuild = process.argv.includes("--build-output");
  const includePrivate = process.argv.includes("--private-evidence");
  const build = includeBuild ? verifyBuildOutput(contract) : null;
  const privateEvidence = includePrivate
    ? verifyPrivateEvidence(contract, data.runtimeIndex, tracked, includeBuild)
    : null;
  const privateAttestation = verifyPrivateAttestation(
    contract,
    summary,
    privateEvidence,
  );
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      ...summary,
      definitions,
      publicJsonAssets,
      trackedFiles: tracked.length,
      build,
      privateEvidence,
      privateAttestation,
    })}\n`,
  );
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        code:
          error instanceof Error
            ? error.message
            : "publication-isolation-verification-invalid",
      })}\n`,
    );
    process.exitCode = 1;
  }
}
