import { describe, expect, it } from "vitest";

import decisionAsset from "../../resources/formula-library/v1/publication-decisions.json";
import {
  createPublicationDecisionLedgerV1,
  GPL_FIXED_HOLD_REASON_V1,
  PUBLICATION_DECISION_LEDGER_V1,
  verifyPublicationDecisionContentHashV1,
} from "@/engine/formulas/v1/publication-decisions";
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from "@/engine/formulas/v1/revisions";
import { STANDARD_MANIFEST_INDEX_V1 } from "@/engine/formulas/v1/standard-manifest";

interface MutableRow {
  formulaId: string;
  rightsStatus: string;
  publicationDecision: string;
  decisionReason: string;
  implementationBasis: string | null;
  implementationBasisRecordedAt: string | null;
  leakageScanStatus: string;
  reviewedAt: string;
}

interface Asset {
  schema: string;
  version: number;
  decisionRevision: number;
  formulaCount: number;
  identityBinding: { standardFormulaIdsSha256: string };
  rightsStatusCounts: Record<string, number>;
  decisionCounts: { publish: number; hold: number; exclude: number };
  rows: MutableRow[];
  contentHash: string;
}

function clone(): Asset {
  return structuredClone(decisionAsset) as unknown as Asset;
}

function expectInvalid(asset: unknown) {
  const result = createPublicationDecisionLedgerV1(asset);
  expect(result.ok).toBe(false);
  if (!result.ok)
    expect(result.code).toBe("invalid-publication-decision-ledger");
}

/**
 * Re-hashes a mutated fixture so each tamper test exercises its targeted
 * invariant instead of the load-time self-hash check.
 */
function refreshContentHash(asset: Asset) {
  const unsigned: Record<string, unknown> = { ...asset };
  delete unsigned.contentHash;
  asset.contentHash = sha256HexSyncV1(canonicalJsonV1(unsigned, 8_192));
}

describe("sha256HexSyncV1", () => {
  it("matches published SHA-256 test vectors", () => {
    expect(sha256HexSyncV1("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256HexSyncV1("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(
      sha256HexSyncV1(
        "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
      ),
    ).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });
});

describe("formula publication decision ledger", () => {
  it("loads the committed exact-677 baseline", () => {
    const result = createPublicationDecisionLedgerV1();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { ledger } = result;
    expect(ledger.schema).toBe(
      "fractalpark-formula-library-publication-decisions/v1",
    );
    expect(ledger.version).toBe(1);
    expect(ledger.decisionRevision).toBe(1);
    expect(ledger.rows).toHaveLength(677);
    expect(ledger.rightsStatusCounts).toEqual({
      "project-owned": 89,
      "source-declared-public-domain-assumption": 137,
      "gpl-3.0-only": 73,
      "no-explicit-permission": 378,
    });
    expect(ledger.decisionCounts).toEqual({
      publish: 0,
      hold: 677,
      exclude: 0,
    });
    expect(ledger.publishedFormulaIds()).toEqual([]);
  });

  it("verifies the committed content hash and detects tampering", () => {
    expect(verifyPublicationDecisionContentHashV1()).toBe(true);
    const tampered = clone();
    tampered.rows[0]!.reviewedAt = "2026-08-18";
    expect(verifyPublicationDecisionContentHashV1(tampered)).toBe(false);
    expect(verifyPublicationDecisionContentHashV1({ contentHash: 42 })).toBe(
      false,
    );
  });

  it("rejects count-preserving tampering that retains the frozen hash", () => {
    const asset = clone();
    const first = asset.rows[0]!;
    const second = asset.rows[1]!;
    const reviewedAt = first.reviewedAt;
    first.reviewedAt = second.reviewedAt;
    second.reviewedAt = reviewedAt;
    first.decisionReason = second.decisionReason;
    expectInvalid(asset);
  });

  it("covers every Standard identity in manifest order", () => {
    const ledger = PUBLICATION_DECISION_LEDGER_V1;
    expect(ledger.rows.map((row) => row.formulaId)).toEqual([
      ...STANDARD_MANIFEST_INDEX_V1.formulaIds,
    ]);
    for (const formulaId of STANDARD_MANIFEST_INDEX_V1.formulaIds) {
      expect(ledger.decisionFor(formulaId)?.formulaId).toBe(formulaId);
    }
    expect(
      ledger.decisionFor("33333333-3333-5333-8333-333333333333"),
    ).toBeUndefined();
    expect(ledger.decisionFor("not-a-formula-id")).toBeUndefined();
  });

  it("holds all 73 GPL identities with the fixed reason", () => {
    const gplRows = PUBLICATION_DECISION_LEDGER_V1.rows.filter(
      (row) => row.rightsStatus === "gpl-3.0-only",
    );
    expect(gplRows).toHaveLength(73);
    for (const row of gplRows) {
      expect(row.publicationDecision).toBe("hold");
      expect(row.decisionReason).toBe(GPL_FIXED_HOLD_REASON_V1);
      expect(row.implementationBasis).toBeNull();
      expect(row.implementationBasisRecordedAt).toBeNull();
      expect(row.leakageScanStatus).toBe("not-applicable");
      expect(row.reviewedAt).toBe("2026-08-17");
    }
  });

  it("keeps every non-GPL baseline row held and unpublished", () => {
    for (const row of PUBLICATION_DECISION_LEDGER_V1.rows) {
      if (row.rightsStatus === "gpl-3.0-only") continue;
      expect(row.publicationDecision).toBe("hold");
      expect(row.implementationBasis).toBeNull();
      expect(row.implementationBasisRecordedAt).toBeNull();
      expect(row.leakageScanStatus).toBe("pending");
      expect(row.decisionReason.length).toBeGreaterThan(0);
    }
  });

  it("accepts a future publish row with basis, basis time, and passed scan", () => {
    const asset = clone();
    const index = asset.rows.findIndex(
      (row) => row.rightsStatus === "project-owned",
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const row = asset.rows[index]!;
    row.publicationDecision = "publish";
    row.decisionReason = "published-project-owned-batch-1";
    row.implementationBasis = "project-owned";
    row.implementationBasisRecordedAt = "2026-08-17T00:00:00.000Z";
    row.leakageScanStatus = "passed";
    asset.decisionCounts.publish = 1;
    asset.decisionCounts.hold = 676;
    refreshContentHash(asset);
    const result = createPublicationDecisionLedgerV1(asset);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ledger.publishedFormulaIds()).toEqual([row.formulaId]);
    expect(result.ledger.decisionCounts).toEqual({
      publish: 1,
      hold: 676,
      exclude: 0,
    });
  });

  it("rejects a missing row", () => {
    const asset = clone();
    asset.rows.splice(0, 1);
    refreshContentHash(asset);
    expectInvalid(asset);
  });

  it("rejects a duplicate formula ID", () => {
    const asset = clone();
    asset.rows[1]!.formulaId = asset.rows[0]!.formulaId;
    refreshContentHash(asset);
    expectInvalid(asset);
  });

  it("rejects a row order swap", () => {
    const asset = clone();
    const first = asset.rows[0]!;
    asset.rows[0] = asset.rows[1]!;
    asset.rows[1] = first;
    refreshContentHash(asset);
    expectInvalid(asset);
  });

  it("rejects an unknown Standard formula ID", () => {
    const asset = clone();
    asset.rows[0]!.formulaId = "33333333-3333-5333-8333-333333333333";
    refreshContentHash(asset);
    expectInvalid(asset);
  });

  it("rejects publishing a GPL identity even with basis and passed scan", () => {
    const asset = clone();
    const row = asset.rows.find(
      (candidate) => candidate.rightsStatus === "gpl-3.0-only",
    )!;
    row.publicationDecision = "publish";
    row.decisionReason = "published-gpl-batch";
    row.implementationBasis = "separated-independent-rewrite";
    row.implementationBasisRecordedAt = "2026-08-17T00:00:00.000Z";
    row.leakageScanStatus = "passed";
    asset.decisionCounts.publish = 1;
    asset.decisionCounts.hold = 676;
    refreshContentHash(asset);
    expectInvalid(asset);
  });

  it("rejects a GPL row whose fixed-held fields drift", () => {
    const asset = clone();
    const row = asset.rows.find(
      (candidate) => candidate.rightsStatus === "gpl-3.0-only",
    )!;
    row.leakageScanStatus = "pending";
    refreshContentHash(asset);
    expectInvalid(asset);
  });

  it("rejects a publish row without a recorded basis", () => {
    const asset = clone();
    const row = asset.rows.find(
      (candidate) => candidate.rightsStatus === "project-owned",
    )!;
    row.publicationDecision = "publish";
    asset.decisionCounts.publish = 1;
    asset.decisionCounts.hold = 676;
    refreshContentHash(asset);
    expectInvalid(asset);
  });

  it("rejects a publish row without a passed leakage scan", () => {
    const asset = clone();
    const row = asset.rows.find(
      (candidate) => candidate.rightsStatus === "project-owned",
    )!;
    row.publicationDecision = "publish";
    row.implementationBasis = "project-owned";
    row.implementationBasisRecordedAt = "2026-08-17T00:00:00.000Z";
    row.leakageScanStatus = "pending";
    asset.decisionCounts.publish = 1;
    asset.decisionCounts.hold = 676;
    refreshContentHash(asset);
    expectInvalid(asset);
  });

  it("rejects an empty decision reason", () => {
    const asset = clone();
    asset.rows[0]!.decisionReason = "";
    refreshContentHash(asset);
    expectInvalid(asset);
  });

  it("rejects a malformed reviewedAt", () => {
    const asset = clone();
    asset.rows[0]!.reviewedAt = "17 August 2026";
    refreshContentHash(asset);
    expectInvalid(asset);
  });

  it("rejects a basis timestamp without a basis", () => {
    const asset = clone();
    asset.rows[0]!.implementationBasisRecordedAt = "2026-08-17T00:00:00.000Z";
    refreshContentHash(asset);
    expectInvalid(asset);
  });

  it("rejects a not-applicable scan status on a non-GPL row", () => {
    const asset = clone();
    const row = asset.rows.find(
      (candidate) => candidate.rightsStatus === "no-explicit-permission",
    )!;
    row.leakageScanStatus = "not-applicable";
    refreshContentHash(asset);
    expectInvalid(asset);
  });

  it("rejects declared decision counts that do not match the rows", () => {
    const asset = clone();
    asset.decisionCounts.publish = 1;
    asset.decisionCounts.hold = 676;
    refreshContentHash(asset);
    expectInvalid(asset);
  });

  it("rejects tampered rights status counts", () => {
    const asset = clone();
    asset.rightsStatusCounts["project-owned"] = 90;
    asset.rightsStatusCounts["no-explicit-permission"] = 377;
    refreshContentHash(asset);
    expectInvalid(asset);
  });

  it("rejects a rebound identity manifest hash", () => {
    const asset = clone();
    asset.identityBinding.standardFormulaIdsSha256 = "0".repeat(64);
    refreshContentHash(asset);
    expectInvalid(asset);
  });

  it("rejects an unexpected top-level key", () => {
    const asset = clone() as Asset & { extra?: unknown };
    asset.extra = true;
    refreshContentHash(asset);
    expectInvalid(asset);
  });

  it("rejects an unexpected row key", () => {
    const asset = clone();
    (asset.rows[0] as unknown as Record<string, unknown>).sourcePath = "x";
    refreshContentHash(asset);
    expectInvalid(asset);
  });

  it("rejects a malformed content hash", () => {
    const asset = clone();
    asset.contentHash = "not-a-hash";
    expectInvalid(asset);
  });
});
