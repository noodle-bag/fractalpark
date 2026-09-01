import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import contractAsset from "../../resources/formula-library/v1/julia-pixel-recovery-contract.v1.json";
import finalV1Asset from "../../resources/formula-library/v1/julia-final-capability-census.v1.json";
import {
  hashFrmLikeV1,
  parseFrmLikeV1,
} from "../engine/frm/v1";
import {
  analyzeJuliaPixelChangedRegionsV1,
  verifyJuliaPixelChangedRegionCoverageV1,
  type JuliaPixelChangedRegionSourceInputV1,
} from "../engine/formulas/v1/julia-pixel-changed-region";
import {
  JULIA_PIXEL_ACTIVATION_HANDOFF_SCHEMA_V1,
  JULIA_PIXEL_FINAL_AUTHORITY_MANIFEST_SCHEMA_V1,
  JULIA_PIXEL_FINAL_CAPABILITY_CENSUS_SCHEMA_V2,
  JULIA_PIXEL_RECOVERY_PROJECTION_SCHEMA_V1,
  parseJuliaPixelActivationHandoffV1,
  parseJuliaPixelFinalAuthorityManifestV1,
  parseJuliaPixelFinalCapabilityCensusV2,
  parseJuliaPixelRecoveryContractV1,
  parseJuliaPixelRecoveryProjectionRowV1,
} from "../engine/formulas/v1/julia-pixel-recovery-contract";
import { canonicalJsonV1, sha256HexSyncV1 } from "../engine/formulas/v1/revisions";
import { JULIA_PIXEL_RECOVERY_FIXTURES_V1 } from "./fixtures/julia-pixel-recovery-v1";

const ROOT = process.cwd();
const RECEIPT_REFERENCE = `sha256:${"a".repeat(64)}`;
const RECEIPT_HASH = "a".repeat(64);
const SOURCE_AUTHORITY_HASH = "b".repeat(64);
const BASELINE_SUPPORTED_IDS = finalV1Asset.rows
  .filter((row) => row.status === "supported")
  .map((row) => row.formulaId);

type MutableReceiptSet = {
  roleDiscovery: string;
  sourceAuthority: string | null;
  directPixelSeed: string | null;
  tier0: string | null;
  tier1: string | null;
  tier2: string | null;
  identityReview: string | null;
  e1Supplement: string | null;
  e1SealedHoldout: string | null;
  notApplicableReview: string | null;
};
type MutableProjection = {
  schema: string;
  formulaId: string;
  roles: string[];
  modeClass: string;
  supportLane: string;
  remediationLane: string;
  rewriteClass: string;
  finalStatus: string;
  identityChangeProposalRef: string | null;
  evidence: {
    tier0: string;
    tier1: string;
    tier2: string;
    identityReview: string;
    e1Supplement: string;
    e1SealedHoldout: string;
    notApplicableReview: string;
  };
  receipts: MutableReceiptSet;
  authority: {
    authorityState: string;
    supersededBy: string | null;
    withdrawnBy: string | null;
  };
  threshold?: number;
};
type MutableContractFixture = {
  lineage: {
    rowCount: number;
    orderedFormulaIds: string[];
  };
  baseEvidenceContract: { tier2: { relativeTolerance: number } };
  holdoutContract: {
    attemptCount: number;
    historicalCorpusDigests: string[];
  };
  sourceBindings: Record<string, string>;
  unexpected?: boolean;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sealedAuthority() {
  return {
    authorityState: "sealed" as const,
    supersededBy: null,
    withdrawnBy: null,
  };
}

function evidenceReferenceSet(
  overrides: Partial<MutableReceiptSet> = {},
) {
  return { ...fullReceiptSet(), ...overrides };
}

function fullReceiptSet(): MutableReceiptSet {
  return {
    roleDiscovery: RECEIPT_REFERENCE,
    sourceAuthority: RECEIPT_REFERENCE,
    directPixelSeed: RECEIPT_REFERENCE,
    tier0: RECEIPT_REFERENCE,
    tier1: RECEIPT_REFERENCE,
    tier2: RECEIPT_REFERENCE,
    identityReview: null as string | null,
    e1Supplement: null as string | null,
    e1SealedHoldout: null as string | null,
    notApplicableReview: null as string | null,
  };
}

function supportedRow(formulaId = contractAsset.lineage.orderedFormulaIds[0]!) {
  return {
    schema: JULIA_PIXEL_RECOVERY_PROJECTION_SCHEMA_V1,
    formulaId,
    roles: ["role:pixel-seed", "role:julia-constant"],
    modeClass: "classic-julia",
    supportLane: "existing-system-c",
    remediationLane: "none",
    rewriteClass: "none",
    finalStatus: "supported",
    identityChangeProposalRef: null,
    evidence: {
      tier0: "pass",
      tier1: "pass",
      tier2: "pass",
      identityReview: "not-required",
      e1Supplement: "not-required",
      e1SealedHoldout: "not-required",
      notApplicableReview: "not-required",
    },
    receipts: fullReceiptSet(),
    authority: sealedAuthority(),
  };
}

function unknownRow(formulaId: string) {
  return {
    schema: JULIA_PIXEL_RECOVERY_PROJECTION_SCHEMA_V1,
    formulaId,
    roles: ["role:unresolved"],
    modeClass: "undetermined",
    supportLane: "none",
    remediationLane: "role-discovery",
    rewriteClass: "none",
    finalStatus: "unknown",
    identityChangeProposalRef: null,
    evidence: {
      tier0: "pending",
      tier1: "pending",
      tier2: "pending",
      identityReview: "not-required",
      e1Supplement: "not-required",
      e1SealedHoldout: "not-required",
      notApplicableReview: "not-required",
    },
    receipts: evidenceReferenceSet({
      sourceAuthority: null,
      directPixelSeed: null,
      tier0: null,
      tier1: null,
      tier2: null,
    }),
    authority: sealedAuthority(),
  };
}

function hashContent<T extends Record<string, unknown>>(content: T) {
  return { ...content, contentHash: sha256HexSyncV1(canonicalJsonV1(content, 262_144)) };
}

function finalCensusFor(supportedFormulaIds: ReadonlySet<string>) {
  const rows = contractAsset.lineage.orderedFormulaIds.map((formulaId) =>
    supportedFormulaIds.has(formulaId)
      ? supportedRow(formulaId)
      : unknownRow(formulaId),
  );
  return hashContent({
    schema: JULIA_PIXEL_FINAL_CAPABILITY_CENSUS_SCHEMA_V2,
    revision: 2,
    authority: sealedAuthority(),
    contractContentHash: contractAsset.contentHash,
    rowCount: 534,
    rows,
  });
}

function authorityManifestFor(
  finalCensusContentHash: string,
  acknowledgment: string | null,
) {
  const hashes = new Set([contractAsset.contentHash, RECEIPT_HASH]);
  if (acknowledgment !== null) hashes.add(acknowledgment);
  return hashContent({
    schema: JULIA_PIXEL_FINAL_AUTHORITY_MANIFEST_SCHEMA_V1,
    revision: 1,
    authority: sealedAuthority(),
    finalCensusContentHash,
    inputAuthorityContentHashes: [...hashes].sort(),
  });
}

function handoffFor(
  finalCensus: ReturnType<typeof finalCensusFor>,
  authorityManifest: ReturnType<typeof authorityManifestFor>,
  acknowledgment: string | null,
) {
  const supportedIds = finalCensus.rows
    .filter(
      (row) =>
        row.modeClass === "classic-julia" && row.finalStatus === "supported",
    )
    .map((row) => row.formulaId);
  const supported = new Set(supportedIds);
  const regressionIds = BASELINE_SUPPORTED_IDS.filter((id) => !supported.has(id));
  const handoffState =
    regressionIds.length === 0 || acknowledgment !== null
      ? "activation-eligible"
      : "review-pending";
  return hashContent({
    schema: JULIA_PIXEL_ACTIVATION_HANDOFF_SCHEMA_V1,
    revision: 1,
    authority: sealedAuthority(),
    handoffState,
    finalCensusContentHash: finalCensus.contentHash,
    finalCensusAuthorityState: "sealed",
    authorityManifestContentHash: authorityManifest.contentHash,
    supportedClassicRowSetDigest: sha256HexSyncV1(canonicalJsonV1(supportedIds)),
    supportedClassicRowCount: supportedIds.length,
    regressionSetDigest: sha256HexSyncV1(canonicalJsonV1(regressionIds)),
    regressionCount: regressionIds.length,
    maintainerAcknowledgmentReceiptDigest: acknowledgment,
  });
}

async function boundSource(
  source: string,
  formulaId = contractAsset.lineage.orderedFormulaIds[0]!,
): Promise<JuliaPixelChangedRegionSourceInputV1> {
  const parsed = parseFrmLikeV1(source);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.reason);
  const revisions = await hashFrmLikeV1(source, parsed.ir);
  return {
    formulaId,
    source,
    sourceRevision: revisions.sourceRevision,
    semanticHash: revisions.semanticHash,
    sourceAuthorityContentHash: SOURCE_AUTHORITY_HASH,
    ir: parsed.ir,
  };
}

describe("Julia / Pixel recovery contract v1", () => {
  it("parses an exact-534 sealed contract with executable history and attempt state", () => {
    const parsed = parseJuliaPixelRecoveryContractV1(contractAsset);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.lineage.rowCount).toBe(534);
    expect(new Set(parsed.value.lineage.orderedFormulaIds).size).toBe(534);
    expect(parsed.value.holdoutContract.historicalCorpusDigests).toHaveLength(1);
    expect(parsed.value.holdoutContract.caseKeyIntersectionCount).toBe(0);
    expect(parsed.value.holdoutContract.attemptCount).toBe(0);
    expect(parsed.value.holdoutContract.maximumAttemptsPerRowPerWave).toBe(1);
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.lineage.orderedFormulaIds)).toBe(true);
    expect(BASELINE_SUPPORTED_IDS).toHaveLength(170);
  });

  it("rejects contract lineage, tolerance, private-state, binding, and key tampering", () => {
    const mutations: Array<(value: MutableContractFixture) => void> = [
      (value) => {
        value.lineage.rowCount = 533;
      },
      (value) => {
        value.lineage.orderedFormulaIds.reverse();
      },
      (value) => {
        value.baseEvidenceContract.tier2.relativeTolerance = 0.01;
      },
      (value) => {
        value.holdoutContract.attemptCount = 1;
      },
      (value) => {
        value.holdoutContract.historicalCorpusDigests = [];
      },
      (value) => {
        value.sourceBindings["package.json"] = "0".repeat(64);
      },
      (value) => {
        value.unexpected = true;
      },
    ];
    for (const mutate of mutations) {
      const tampered = clone(contractAsset) as unknown as MutableContractFixture;
      mutate(tampered);
      expect(parseJuliaPixelRecoveryContractV1(tampered).ok).toBe(false);
    }
  });

  it("requires sealed final authority and content-addressed receipts", () => {
    expect(parseJuliaPixelRecoveryProjectionRowV1(supportedRow()).ok).toBe(true);

    const missingDirect = clone(supportedRow()) as unknown as MutableProjection;
    missingDirect.receipts.directPixelSeed = null;
    expect(parseJuliaPixelRecoveryProjectionRowV1(missingDirect).ok).toBe(false);

    const missingTierReceipt = clone(supportedRow()) as unknown as MutableProjection;
    missingTierReceipt.receipts.tier1 = null;
    expect(parseJuliaPixelRecoveryProjectionRowV1(missingTierReceipt).ok).toBe(false);

    for (const authorityState of ["draft", "withdrawn", "superseded"] as const) {
      const row = clone(
        unknownRow(contractAsset.lineage.orderedFormulaIds[1]!),
      ) as unknown as MutableProjection;
      row.authority.authorityState = authorityState;
      row.authority.withdrawnBy =
        authorityState === "withdrawn" ? RECEIPT_REFERENCE : null;
      row.authority.supersededBy =
        authorityState === "superseded" ? RECEIPT_REFERENCE : null;
      expect(parseJuliaPixelRecoveryProjectionRowV1(row).ok).toBe(false);
    }
  });

  it("enforces generalized, E1, identity-change, and not-applicable matrix rules", () => {
    const generalized = clone(supportedRow()) as unknown as MutableProjection;
    generalized.roles = ["role:julia-constant"];
    generalized.modeClass = "generalized-two-plane";
    generalized.finalStatus = "held";
    generalized.receipts.directPixelSeed = null;
    expect(parseJuliaPixelRecoveryProjectionRowV1(generalized).ok).toBe(true);
    generalized.finalStatus = "supported";
    expect(parseJuliaPixelRecoveryProjectionRowV1(generalized).ok).toBe(false);

    const e1Pending = clone(supportedRow()) as unknown as MutableProjection;
    e1Pending.rewriteClass = "E1-mathematical-identity";
    e1Pending.finalStatus = "held";
    e1Pending.evidence.identityReview = "pending";
    e1Pending.evidence.e1Supplement = "pending";
    e1Pending.evidence.e1SealedHoldout = "pending";
    expect(parseJuliaPixelRecoveryProjectionRowV1(e1Pending).ok).toBe(true);
    e1Pending.finalStatus = "supported";
    expect(parseJuliaPixelRecoveryProjectionRowV1(e1Pending).ok).toBe(false);

    const e1Pass = clone(supportedRow()) as unknown as MutableProjection;
    e1Pass.rewriteClass = "E1-mathematical-identity";
    e1Pass.evidence.identityReview = "pass";
    e1Pass.evidence.e1Supplement = "pass";
    e1Pass.evidence.e1SealedHoldout = "pass";
    e1Pass.receipts.identityReview = RECEIPT_REFERENCE;
    e1Pass.receipts.e1Supplement = RECEIPT_REFERENCE;
    e1Pass.receipts.e1SealedHoldout = RECEIPT_REFERENCE;
    expect(parseJuliaPixelRecoveryProjectionRowV1(e1Pass).ok).toBe(true);

    const identity = clone(
      unknownRow(contractAsset.lineage.orderedFormulaIds[2]!),
    ) as unknown as MutableProjection;
    identity.finalStatus = "held";
    identity.rewriteClass = "identity-change";
    identity.identityChangeProposalRef = RECEIPT_REFERENCE;
    expect(parseJuliaPixelRecoveryProjectionRowV1(identity).ok).toBe(true);
    identity.finalStatus = "supported";
    expect(parseJuliaPixelRecoveryProjectionRowV1(identity).ok).toBe(false);

    const notApplicable = clone(
      unknownRow(contractAsset.lineage.orderedFormulaIds[3]!),
    ) as unknown as MutableProjection;
    notApplicable.roles = ["role:bailout-control"];
    notApplicable.modeClass = "not-applicable";
    notApplicable.finalStatus = "not-applicable";
    notApplicable.evidence.tier0 = "not-required";
    notApplicable.evidence.tier1 = "not-required";
    notApplicable.evidence.tier2 = "not-required";
    notApplicable.evidence.notApplicableReview = "pass";
    notApplicable.receipts.notApplicableReview = RECEIPT_REFERENCE;
    expect(parseJuliaPixelRecoveryProjectionRowV1(notApplicable).ok).toBe(true);
  });

  it("rejects per-ID policy fields, candidate status, unsorted roles, and hostile input", () => {
    const threshold = clone(supportedRow()) as unknown as MutableProjection;
    threshold.threshold = 0.02;
    expect(parseJuliaPixelRecoveryProjectionRowV1(threshold).ok).toBe(false);

    const candidate = clone(supportedRow()) as unknown as MutableProjection;
    candidate.finalStatus = "candidate";
    expect(parseJuliaPixelRecoveryProjectionRowV1(candidate).ok).toBe(false);

    const unsorted = clone(supportedRow()) as unknown as MutableProjection;
    unsorted.roles = ["role:julia-constant", "role:pixel-seed"];
    expect(parseJuliaPixelRecoveryProjectionRowV1(unsorted).ok).toBe(false);

    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("hostile");
        },
      },
    );
    expect(parseJuliaPixelRecoveryContractV1(hostile).ok).toBe(false);
  });

  it("parses sealed final envelopes but exposes no A-stage consumption authority", () => {
    const supportedSet = new Set(BASELINE_SUPPORTED_IDS);
    const finalCensus = finalCensusFor(supportedSet);
    const authorityManifest = authorityManifestFor(finalCensus.contentHash, null);
    const handoff = handoffFor(finalCensus, authorityManifest, null);
    expect(parseJuliaPixelFinalCapabilityCensusV2(finalCensus, contractAsset).ok).toBe(
      true,
    );
    expect(parseJuliaPixelFinalAuthorityManifestV1(authorityManifest).ok).toBe(true);
    expect(parseJuliaPixelActivationHandoffV1(handoff).ok).toBe(true);

    const reordered = clone(finalCensus);
    [reordered.rows[0], reordered.rows[1]] = [
      reordered.rows[1]!,
      reordered.rows[0]!,
    ];
    const reorderedContent: Record<string, unknown> = { ...reordered };
    delete reorderedContent.contentHash;
    reordered.contentHash = sha256HexSyncV1(
      canonicalJsonV1(reorderedContent, 262_144),
    );
    expect(parseJuliaPixelFinalCapabilityCensusV2(reordered, contractAsset).ok).toBe(
      false,
    );

    const forged = clone(handoff);
    forged.supportedClassicRowSetDigest = "f".repeat(64);
    const forgedContent: Record<string, unknown> = { ...forged };
    delete forgedContent.contentHash;
    forged.contentHash = sha256HexSyncV1(canonicalJsonV1(forgedContent));
    expect(parseJuliaPixelActivationHandoffV1(forged).ok).toBe(true);
    const moduleSource = readFileSync(
      join(ROOT, "src/engine/formulas/v1/julia-pixel-recovery-contract.ts"),
      "utf8",
    );
    expect(moduleSource).not.toContain("HandoffConsumable");
    expect(moduleSource).not.toContain("verifyJuliaPixelActivationHandoffBindings");
    expect(contractAsset.handoffContract.consumerBinding).toContain(
      "not-available-until-7E-H",
    );
  });

  it("keeps regression handoff structure review-pending until acknowledgment", () => {
    const finalCensus = finalCensusFor(new Set());
    const pendingManifest = authorityManifestFor(finalCensus.contentHash, null);
    const pending = handoffFor(finalCensus, pendingManifest, null);
    expect(pending.handoffState).toBe("review-pending");
    expect(parseJuliaPixelActivationHandoffV1(pending).ok).toBe(true);

    const illegal = clone(pending);
    illegal.handoffState = "activation-eligible";
    const illegalContent: Record<string, unknown> = { ...illegal };
    delete illegalContent.contentHash;
    illegal.contentHash = sha256HexSyncV1(canonicalJsonV1(illegalContent));
    expect(parseJuliaPixelActivationHandoffV1(illegal).ok).toBe(false);

    const acknowledgment = "c".repeat(64);
    const acknowledgedManifest = authorityManifestFor(
      finalCensus.contentHash,
      acknowledgment,
    );
    const acknowledged = handoffFor(
      finalCensus,
      acknowledgedManifest,
      acknowledgment,
    );
    expect(acknowledged.handoffState).toBe("activation-eligible");
    expect(parseJuliaPixelActivationHandoffV1(acknowledged).ok).toBe(true);
  });
});

describe("Julia / Pixel holdout attempt transitions v1", () => {
  it("executes immutable freeze-wave and seal-attempts transitions", () => {
    const privateRoot = mkdtempSync(join(tmpdir(), "julia-pixel-transition-"));
    chmodSync(privateRoot, 0o700);
    const writePrivate = (path: string, value: unknown) => {
      writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
      chmodSync(path, 0o600);
    };
    try {
      const corpus = { contentHash: "d".repeat(64) };
      writePrivate(join(privateRoot, "blind-holdout.v2.json"), corpus);
      const initial = hashContent({
        schema: "fractalpark-julia-pixel-holdout-attempt-ledger/v1",
        revision: 1,
        stage: "pre-candidate",
        currentCorpusDigest: corpus.contentHash,
        waveId: null,
        candidateManifestContentHash: null,
        attempts: [],
        predecessorContentHash: null,
      });
      writePrivate(join(privateRoot, "attempt-ledger.v2.json"), initial);

      const formulaId = contractAsset.lineage.orderedFormulaIds[0]!;
      const candidateBase = {
        schema: "fractalpark-julia-pixel-candidate-manifest/v1",
        revision: 1,
        authority: sealedAuthority(),
        contractContentHash: contractAsset.contentHash,
        rowCount: 1,
        rows: [
          {
            formulaId,
            rewriteClass: "E1-mathematical-identity",
            candidateContentHash: "e".repeat(64),
            sourceRevision: "f".repeat(64),
            semanticHash: "1".repeat(64),
          },
        ],
      };
      const waveId = sha256HexSyncV1(canonicalJsonV1(candidateBase));
      const candidateManifest = {
        ...candidateBase,
        waveId,
        contentHash: waveId,
      };
      const candidatePath = join(privateRoot, "candidate-manifest.json");
      writeFileSync(candidatePath, `${JSON.stringify(candidateManifest, null, 2)}\n`);

      const transitionArgs = [
        "tsx",
        "scripts/transition-julia-pixel-holdout-attempt-ledger.ts",
      ];
      const frozen = JSON.parse(
        execFileSync(
          "npx",
          [
            ...transitionArgs,
            "freeze-wave",
            "--private-root",
            privateRoot,
            "--candidate-manifest",
            candidatePath,
          ],
          { cwd: ROOT, encoding: "utf8", timeout: 120_000 },
        ),
      ) as { stage: string; attemptCount: number };
      expect(frozen).toMatchObject({ stage: "wave-frozen", attemptCount: 0 });

      const receiptDirectory = join(privateRoot, "attempt-receipts");
      mkdirSync(receiptDirectory, { mode: 0o700 });
      const receipt = hashContent({
        schema: "fractalpark-julia-pixel-holdout-attempt-receipt/v1",
        revision: 1,
        authority: sealedAuthority(),
        formulaId,
        waveId,
        candidateManifestContentHash: waveId,
        holdoutCorpusDigest: corpus.contentHash,
        result: "pass",
      });
      const receiptFile = "attempt-001.json";
      writePrivate(join(receiptDirectory, receiptFile), receipt);
      const attemptRow = {
        formulaId,
        attemptNumber: 1,
        result: "pass",
        receiptFile,
        receiptContentHash: receipt.contentHash,
      };
      const attemptManifest = hashContent({
        schema: "fractalpark-julia-pixel-holdout-attempt-manifest/v1",
        revision: 1,
        authority: sealedAuthority(),
        waveId,
        candidateManifestContentHash: waveId,
        rowCount: 1,
        rows: [attemptRow],
      });
      const attemptPath = join(privateRoot, "attempt-manifest.json");
      writePrivate(attemptPath, attemptManifest);
      const waveLedgerPath = join(
        privateRoot,
        `attempt-ledger.wave-${waveId}.json`,
      );
      rmSync(waveLedgerPath);
      expect(() =>
        execFileSync(
          "npx",
          [
            ...transitionArgs,
            "seal-attempts",
            "--private-root",
            privateRoot,
            "--candidate-manifest",
            candidatePath,
            "--attempt-manifest",
            attemptPath,
          ],
          { cwd: ROOT, encoding: "utf8", timeout: 120_000 },
        ),
      ).toThrow();
      execFileSync(
        "npx",
        [
          ...transitionArgs,
          "freeze-wave",
          "--private-root",
          privateRoot,
          "--candidate-manifest",
          candidatePath,
        ],
        { cwd: ROOT, encoding: "utf8", timeout: 120_000 },
      );
      const sealed = JSON.parse(
        execFileSync(
          "npx",
          [
            ...transitionArgs,
            "seal-attempts",
            "--private-root",
            privateRoot,
            "--candidate-manifest",
            candidatePath,
            "--attempt-manifest",
            attemptPath,
          ],
          { cwd: ROOT, encoding: "utf8", timeout: 120_000 },
        ),
      ) as { stage: string; attemptCount: number };
      expect(sealed).toMatchObject({ stage: "sealed", attemptCount: 1 });

      const duplicateManifest = hashContent({
        schema: "fractalpark-julia-pixel-holdout-attempt-manifest/v1",
        revision: 1,
        authority: sealedAuthority(),
        waveId,
        candidateManifestContentHash: waveId,
        rowCount: 2,
        rows: [attemptRow, attemptRow],
      });
      const duplicatePath = join(privateRoot, "attempt-manifest-duplicate.json");
      writePrivate(duplicatePath, duplicateManifest);
      expect(() =>
        execFileSync(
          "npx",
          [
            ...transitionArgs,
            "seal-attempts",
            "--private-root",
            privateRoot,
            "--candidate-manifest",
            candidatePath,
            "--attempt-manifest",
            duplicatePath,
          ],
          { cwd: ROOT, encoding: "utf8", timeout: 120_000 },
        ),
      ).toThrow();
    } finally {
      rmSync(privateRoot, { recursive: true, force: true });
    }
  }, 180_000);
});

describe("Julia / Pixel changed-region analyzer v1", () => {
  it("binds formula/source/semantic/authority revisions and rejects replay", async () => {
    const beforeSource = JULIA_PIXEL_RECOVERY_FIXTURES_V1[0]!.source;
    const afterSource = beforeSource.replace(
      "z = z * z + orbitConstant",
      "z = z * z - orbitConstant",
    );
    const before = await boundSource(beforeSource);
    const after = await boundSource(afterSource);
    const analysis = await analyzeJuliaPixelChangedRegionsV1(before, after);
    expect(analysis.ok).toBe(true);

    const tampered = { ...after, sourceRevision: "0".repeat(64) };
    expect((await analyzeJuliaPixelChangedRegionsV1(before, tampered)).ok).toBe(
      false,
    );

    const replayed = {
      ...after,
      formulaId: contractAsset.lineage.orderedFormulaIds[1]!,
    };
    expect((await analyzeJuliaPixelChangedRegionsV1(before, replayed)).ok).toBe(
      false,
    );
  });

  it("treats static conditions as standard32, not host float64", async () => {
    const beforeSource = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Float32Condition {
  init:
    if 16777217 == 16777216
      z = pixel
    else
      z = pixel + 1
    endif
  loop:
    z = z * z + pixel
  bailout:
    |z| <= 4
}`;
    const afterSource = beforeSource.replace("pixel + 1", "pixel + 2");
    const analysis = await analyzeJuliaPixelChangedRegionsV1(
      await boundSource(beforeSource),
      await boundSource(afterSource),
    );
    expect(analysis.ok).toBe(true);
    if (!analysis.ok) return;
    expect(analysis.value.regions).toHaveLength(1);
    expect(analysis.value.regions[0]!.nodePath).toContain("/else/");
    expect(analysis.value.regions[0]!.requiredCoverageModes).toEqual([]);
    expect(
      verifyJuliaPixelChangedRegionCoverageV1(analysis.value, []),
    ).toMatchObject({ ok: true, uncoveredReachableOrUnknownRegionCount: 0 });
  });

  it("requires coverage for every reachable or unknown region in both planes", async () => {
    const source = JULIA_PIXEL_RECOVERY_FIXTURES_V1.find(
      (fixture) => fixture.id === "analysis-unknown-is-reachable",
    )!.source;
    const changed = source.replace("z = z - orbitConstant", "z = z + orbitConstant");
    const analysis = await analyzeJuliaPixelChangedRegionsV1(
      await boundSource(source),
      await boundSource(changed),
    );
    expect(analysis.ok).toBe(true);
    if (!analysis.ok) return;
    expect(analysis.value.reachableOrUnknownRegionCount).toBeGreaterThan(0);
    expect(verifyJuliaPixelChangedRegionCoverageV1(analysis.value, []).ok).toBe(
      false,
    );
    const complete = analysis.value.regions.map((region) => ({
      regionId: region.regionId,
      coveredModes: region.requiredCoverageModes,
    }));
    expect(verifyJuliaPixelChangedRegionCoverageV1(analysis.value, complete)).toEqual({
      ok: true,
      coveredRegionCount: analysis.value.regions.length,
      uncoveredReachableOrUnknownRegionCount: 0,
    });
  });
});

describe("Julia / Pixel recovery fixtures and isolation", () => {
  it("keeps every self-authored positive fixture parseable and negative parse fail-closed", () => {
    expect(JULIA_PIXEL_RECOVERY_FIXTURES_V1.length).toBeGreaterThanOrEqual(10);
    expect(
      new Set(JULIA_PIXEL_RECOVERY_FIXTURES_V1.map((fixture) => fixture.id)).size,
    ).toBe(JULIA_PIXEL_RECOVERY_FIXTURES_V1.length);
    for (const fixture of JULIA_PIXEL_RECOVERY_FIXTURES_V1) {
      const parsed = parseFrmLikeV1(fixture.source);
      if (fixture.parseFailureReason) {
        expect(parsed.ok).toBe(false);
        if (!parsed.ok) expect(parsed.reason).toBe(fixture.parseFailureReason);
      } else expect(parsed.ok).toBe(true);
    }
  });

  it("preserves every bound 29g/live source byte and remains outside public barrels", () => {
    for (const [path, expectedDigest] of Object.entries(contractAsset.sourceBindings)) {
      const actual = createHash("sha256")
        .update(readFileSync(join(ROOT, path)))
        .digest("hex");
      expect(actual).toBe(expectedDigest);
    }
    const barrel = readFileSync(
      join(ROOT, "src/engine/formulas/v1/index.ts"),
      "utf8",
    );
    expect(barrel).not.toContain("julia-pixel-recovery");
    expect(barrel).not.toContain("julia-pixel-changed-region");
  });
});
