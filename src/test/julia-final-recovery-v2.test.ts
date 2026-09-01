import auditAsset from "../../resources/formula-library/v1/julia-pixel-final-recovery-audit.v1.json";
import authorityAsset from "../../resources/formula-library/v1/julia-pixel-final-authority-manifest.v1.json";
import censusAsset from "../../resources/formula-library/v1/julia-pixel-final-capability-census.v2.json";
import baselineAsset from "../../resources/formula-library/v1/julia-final-capability-census.v1.json";
import handoffAsset from "../../resources/formula-library/v1/julia-pixel-activation-handoff.v1.json";
import candidatesAsset from "../../resources/formula-library/v1/julia-pixel-recovery-candidates.v1.json";
import contractAsset from "../../resources/formula-library/v1/julia-pixel-recovery-contract.v1.json";
import roleAsset from "../../resources/formula-library/v1/julia-pixel-role-census.v1.json";
import preGpuAsset from "../../resources/formula-library/v1/julia-pre-gpu-recovery-census.v2.json";
import rendererAsset from "../../resources/formula-library/v1/julia-renderer-evidence.v2.json";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  JULIA_FINAL_RECOVERY_SOURCE_BINDING_PATHS_V1,
  parseJuliaFinalRecoveryAuditV1,
  verifyJuliaFinalRecoveryActivationHandoffV1,
} from "../engine/formulas/v1/julia-final-recovery-v2";
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from "../engine/formulas/v1/revisions";

type JsonRecord = Record<string, unknown>;
type Closure = {
  census: JsonRecord;
  authority: JsonRecord;
  handoff: JsonRecord;
  audit: JsonRecord;
  renderer: JsonRecord;
  attemptManifest: JsonRecord;
  sealedLedger: JsonRecord;
};

const SOURCE_CONTENTS = Object.freeze(
  Object.fromEntries(
    JULIA_FINAL_RECOVERY_SOURCE_BINDING_PATHS_V1.map((path) => [
      path,
      readFileSync(join(process.cwd(), path), "utf8"),
    ]),
  ),
);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function reseal(value: JsonRecord): void {
  const content = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "contentHash"),
  );
  value.contentHash = sha256HexSyncV1(canonicalJsonV1(content, 1_048_576));
}

function hashContent(content: JsonRecord): JsonRecord {
  const value = { ...content };
  reseal(value);
  return value;
}

function rebindOutputs(closure: Closure): void {
  closure.authority.finalCensusContentHash = closure.census.contentHash;
  reseal(closure.authority);
  closure.handoff.finalCensusContentHash = closure.census.contentHash;
  closure.handoff.authorityManifestContentHash = closure.authority.contentHash;
  reseal(closure.handoff);
  closure.audit.finalCensusContentHash = closure.census.contentHash;
  closure.audit.authorityManifestContentHash = closure.authority.contentHash;
  closure.audit.activationHandoffContentHash = closure.handoff.contentHash;
  reseal(closure.audit);
}

function baseClosure(): Closure {
  const attemptManifest = hashContent({
    schema: "test-julia-holdout-attempt-manifest/v1",
    rowCount: 0,
  });
  const sealedLedger = hashContent({
    schema: "test-julia-holdout-attempt-ledger/v1",
    stage: "sealed",
    waveId: rendererAsset.waveId,
    currentCorpusDigest: rendererAsset.sealedHoldout.sealedCorpusDigest,
    attempts: [],
  });
  const renderer = clone(rendererAsset) as unknown as JsonRecord;
  const sealedHoldout = renderer.sealedHoldout as JsonRecord;
  sealedHoldout.attemptManifestContentHash = attemptManifest.contentHash;
  sealedHoldout.sealedLedgerContentHash = sealedLedger.contentHash;
  reseal(renderer);

  const authority = clone(authorityAsset) as unknown as JsonRecord;
  const replacements = new Map([
    [rendererAsset.contentHash, String(renderer.contentHash)],
    [
      rendererAsset.sealedHoldout.attemptManifestContentHash,
      String(attemptManifest.contentHash),
    ],
    [
      rendererAsset.sealedHoldout.sealedLedgerContentHash,
      String(sealedLedger.contentHash),
    ],
  ]);
  authority.inputAuthorityContentHashes = (
    authority.inputAuthorityContentHashes as string[]
  )
    .map((hash) => replacements.get(hash) ?? hash)
    .sort();

  const closure: Closure = {
    census: clone(censusAsset) as unknown as JsonRecord,
    authority,
    handoff: clone(handoffAsset) as unknown as JsonRecord,
    audit: clone(auditAsset) as unknown as JsonRecord,
    renderer,
    attemptManifest,
    sealedLedger,
  };
  closure.audit.rendererEvidenceContentHash = renderer.contentHash;
  closure.audit.holdoutAttemptManifestContentHash = attemptManifest.contentHash;
  closure.audit.sealedAttemptLedgerContentHash = sealedLedger.contentHash;
  rebindOutputs(closure);
  return closure;
}

function verify(
  closure: Closure,
  sourceContents: Readonly<Record<string, string>> = SOURCE_CONTENTS,
) {
  return verifyJuliaFinalRecoveryActivationHandoffV1(
    closure.handoff,
    closure.census,
    closure.authority,
    closure.audit,
    contractAsset,
    baselineAsset,
    roleAsset,
    candidatesAsset,
    preGpuAsset,
    closure.renderer,
    closure.attemptManifest,
    closure.sealedLedger,
    sourceContents,
  );
}

describe("Julia final recovery v2", () => {
  it("parses the exact sealed audit and preserves every final status bucket", () => {
    const parsed = parseJuliaFinalRecoveryAuditV1(auditAsset);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.statusCounts).toEqual({
      supported: 179,
      held: 167,
      blocked: 72,
      unknown: 116,
      notApplicable: 0,
    });
    expect(parsed.value.regressionIds).toHaveLength(27);
    expect(parsed.value.gainIds).toHaveLength(36);
    expect(parsed.value.sealedAttemptCounts).toHaveLength(534);
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.sealedAttemptCounts)).toBe(true);
  });

  it("rejects the current review-pending handoff as activation authority", () => {
    expect(verify(baseClosure())).toEqual({
      ok: false,
      code: "julia-final-recovery-review-pending",
    });
  });

  it("rejects evidence-receipt substitution after every envelope is resealed", () => {
    const closure = baseClosure();
    const rows = closure.census.rows as JsonRecord[];
    const receipts = rows.find(
      (row) => (row.receipts as JsonRecord).tier2 !== null,
    )?.receipts as JsonRecord;
    receipts.tier2 = `sha256:${"f".repeat(64)}`;
    reseal(closure.census);
    rebindOutputs(closure);
    expect(verify(closure)).toEqual({
      ok: false,
      code: "julia-final-recovery-consumer-invalid",
    });
  });

  it("rejects audit-source, authority-set, and zero-attempt tampering", () => {
    const sourceTamper = baseClosure();
    const sourceBindings = sourceTamper.audit.sourceBindings as JsonRecord;
    sourceBindings[Object.keys(sourceBindings)[0]!] = "0".repeat(64);
    reseal(sourceTamper.audit);
    expect(verify(sourceTamper).ok).toBe(false);

    const forgedSourceMap = baseClosure();
    const forgedContents = { ...SOURCE_CONTENTS, "forged/source.ts": "forged" };
    (forgedSourceMap.audit.sourceBindings as JsonRecord)["forged/source.ts"] =
      sha256HexSyncV1("forged");
    reseal(forgedSourceMap.audit);
    expect(verify(forgedSourceMap, forgedContents).ok).toBe(false);

    const omission = baseClosure();
    (omission.authority.inputAuthorityContentHashes as string[]).pop();
    rebindOutputs(omission);
    expect(verify(omission).ok).toBe(false);

    const duplicate = baseClosure();
    const hashes = duplicate.authority.inputAuthorityContentHashes as string[];
    hashes.push(hashes[0]!);
    hashes.sort();
    rebindOutputs(duplicate);
    expect(verify(duplicate).ok).toBe(false);

    const attemptTamper = baseClosure();
    const firstAttempt = (
      attemptTamper.audit.sealedAttemptCounts as JsonRecord[]
    )[0]!;
    firstAttempt.currentWaveSealedAttemptCount = 1;
    firstAttempt.cumulativeSealedAttemptCount = 1;
    reseal(attemptTamper.audit);
    expect(verify(attemptTamper).ok).toBe(false);

    const attemptIdentityTamper = baseClosure();
    const attemptRows = attemptIdentityTamper.audit
      .sealedAttemptCounts as JsonRecord[];
    attemptRows[0]!.formulaId = "00000000-0000-5000-8000-000000000000";
    reseal(attemptIdentityTamper.audit);
    expect(verify(attemptIdentityTamper).ok).toBe(false);
  });

  it("does not accept an arbitrary acknowledgment digest as issuer evidence", () => {
    const closure = baseClosure();
    const acknowledgment = "d".repeat(64);
    const hashes = closure.authority.inputAuthorityContentHashes as string[];
    hashes.push(acknowledgment);
    hashes.sort();
    closure.handoff.handoffState = "activation-eligible";
    closure.handoff.maintainerAcknowledgmentReceiptDigest = acknowledgment;
    rebindOutputs(closure);
    expect(verify(closure)).toEqual({
      ok: false,
      code: "julia-final-recovery-consumer-invalid",
    });
  });
});
