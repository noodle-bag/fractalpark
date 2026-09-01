import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import baseline from "../../resources/formula-library/v1/julia-final-capability-census.v1.json";
import predecessor from "../../resources/formula-library/v1/julia-pixel-final-capability-census.v2.json";
import predecessorAudit from "../../resources/formula-library/v1/julia-pixel-final-recovery-audit.v1.json";
import contract from "../../resources/formula-library/v1/julia-pixel-recovery-contract.v1.json";
import corrective from "../../resources/formula-library/v1/julia-classic-regression-corrective.v1.json";
import renderer from "../../resources/formula-library/v1/julia-classic-regression-renderer-evidence.v1.json";
import censusAsset from "../../resources/formula-library/v1/julia-pixel-final-capability-census.v3.json";
import authorityAsset from "../../resources/formula-library/v1/julia-pixel-final-authority-manifest.v2.json";
import handoffAsset from "../../resources/formula-library/v1/julia-pixel-activation-handoff.v2.json";
import auditAsset from "../../resources/formula-library/v1/julia-pixel-final-recovery-audit.v2.json";
import { JULIA_FINAL_RECOVERY_V3_SOURCE_BINDING_PATHS, juliaFinalRecoveryV3ContentHash, parseJuliaFinalRecoveryAuditV2, parseJuliaPixelActivationHandoffV2, parseJuliaPixelFinalAuthorityManifestV2, parseJuliaPixelFinalCapabilityCensusV3, verifyJuliaFinalRecoveryActivationHandoffV2 } from "../engine/formulas/v1/julia-final-recovery-v3";

type Json = Record<string, unknown>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const reseal = (value: Json): Json => ({ ...value, contentHash: juliaFinalRecoveryV3ContentHash(value) });
const sources = (): Json => Object.fromEntries(JULIA_FINAL_RECOVERY_V3_SOURCE_BINDING_PATHS.map((path) => [path, readFileSync(join(process.cwd(), path), "utf8")]));
const closure = () => ({ handoff: clone(handoffAsset) as Json, census: clone(censusAsset) as Json, authority: clone(authorityAsset) as Json, audit: clone(auditAsset) as Json, source: sources() });
const consume = (fixture: ReturnType<typeof closure>) => verifyJuliaFinalRecoveryActivationHandoffV2(fixture.handoff, fixture.census, fixture.authority, fixture.audit, baseline, predecessor, contract, predecessorAudit, corrective, renderer, fixture.source);
const invalid = (fixture: ReturnType<typeof closure>) => expect(consume(fixture)).toEqual({ ok: false, code: "julia-final-recovery-v3-consumer-invalid" });
const rowsOf = (value: Json): Json[] => value.rows as Json[];
const recordOf = (value: unknown): Json => value as Json;

describe("julia final recovery v3 full closure", () => {
  it("parses a valid immutable 534-row closure", () => { const parsed = parseJuliaPixelFinalCapabilityCensusV3(censusAsset); expect(parsed.ok).toBe(true); if (parsed.ok) { expect(Object.isFrozen(parsed.value)).toBe(true); expect(Object.isFrozen(parsed.value.rows)).toBe(true); expect(Object.isFrozen(parsed.value.rows[0])).toBe(true); } expect(consume(closure())).toEqual({ ok: false, code: "julia-final-recovery-v3-review-pending" }); });
  it("keeps malformed-shape rejection parser-only", () => { const bad = clone(censusAsset) as Json; delete bad.rows; expect(parseJuliaPixelFinalCapabilityCensusV3(bad).ok).toBe(false); });
  it("rejects parser-level row-order drift after resealing", () => { const bad = clone(censusAsset) as Json; const rows = bad.rows as Json[]; [rows[0], rows[1]] = [rows[1]!, rows[0]!]; const resealed = reseal(bad); expect(parseJuliaPixelFinalCapabilityCensusV3(resealed).ok).toBe(false); });
  it("rejects a resealed non-target row mutation", () => {
    const fixture = closure();
    const rows = rowsOf(fixture.census);
    const index = rows.findIndex((row) => row.finalStatus === "unknown");
    rows[index]!.finalStatus = "blocked";
    fixture.census = reseal(fixture.census);
    invalid(fixture);
  });
  it("rejects a resealed target tier2 receipt substitution", () => {
    const fixture = closure();
    const row = rowsOf(fixture.census).find(
      (item) =>
        item.finalStatus === "supported" &&
        recordOf(item.receipts).tier2 === `sha256:${renderer.rows[0].receipt}`,
    );
    expect(row).toBeDefined();
    recordOf(row!.receipts).tier2 = `sha256:${"a".repeat(64)}`;
    fixture.census = reseal(fixture.census);
    invalid(fixture);
  });
  it("rejects a resealed target role substitution", () => {
    const fixture = closure();
    const row = rowsOf(fixture.census).find(
      (item) =>
        item.supportLane === "source-split-direct" &&
        item.remediationLane === "none",
    );
    expect(row).toBeDefined();
    row!.roles = (row!.roles as string[]).filter(
      (role) => role !== "role:pixel-constant",
    );
    fixture.census = reseal(fixture.census);
    invalid(fixture);
  });
  it("rejects omission, duplicate, and reordered targets after resealing", () => {
    const ids = corrective.rows.map((row) => row.formulaId);
    for (const operation of ["omit", "duplicate", "reorder"] as const) {
      const fixture = closure();
      const rows = rowsOf(fixture.census);
      const positions = ids.map((id) =>
        rows.findIndex((row) => row.formulaId === id),
      );
      const first = positions[0]!;
      const second = positions[1]!;
      if (operation === "omit") rows[first] = clone(predecessor.rows[first]!);
      if (operation === "duplicate") rows[second] = clone(rows[first]!);
      if (operation === "reorder")
        [rows[first], rows[second]] = [rows[second]!, rows[first]!];
      fixture.census = reseal(fixture.census);
      invalid(fixture);
    }
  });
  it("rejects forged audit counts and set digests after resealing", () => {
    const countFixture = closure();
    recordOf(countFixture.audit.statusCounts).supported = 187;
    countFixture.audit = reseal(countFixture.audit);
    invalid(countFixture);
    const digestFixture = closure();
    digestFixture.handoff.regressionSetDigest = "b".repeat(64);
    digestFixture.handoff = reseal(digestFixture.handoff);
    invalid(digestFixture);
  });
  it("rejects arbitrary acknowledgement and activation", () => {
    const fixture = closure();
    fixture.handoff.maintainerAcknowledgmentReceiptDigest = "c".repeat(64);
    fixture.handoff.handoffState = "activation-eligible";
    fixture.handoff = reseal(fixture.handoff);
    expect(parseJuliaPixelActivationHandoffV2(fixture.handoff).ok).toBe(false);
    invalid(fixture);
  });
  it("rejects source-map add, drop, and valid-sha substitution", () => {
    for (const operation of ["add", "drop", "substitute"] as const) {
      const fixture = closure();
      const path = JULIA_FINAL_RECOVERY_V3_SOURCE_BINDING_PATHS[0];
      if (operation === "add") fixture.source.extra = "x";
      if (operation === "drop") delete fixture.source[path];
      if (operation === "substitute") fixture.source[path] = "altered";
      invalid(fixture);
    }
  });
  it("rejects legitimately resealed authority substitutions", () => {
    const fixture = closure();
    const hashes = fixture.authority.inputAuthorityContentHashes as string[];
    hashes[0] = "d".repeat(64);
    hashes.sort();
    fixture.authority = reseal(fixture.authority);
    fixture.handoff.authorityManifestContentHash = fixture.authority.contentHash;
    fixture.handoff = reseal(fixture.handoff);
    fixture.audit.authorityManifestContentHash = fixture.authority.contentHash;
    fixture.audit.activationHandoffContentHash = fixture.handoff.contentHash;
    fixture.audit = reseal(fixture.audit);
    expect(parseJuliaPixelFinalAuthorityManifestV2(fixture.authority).ok).toBe(
      true,
    );
    invalid(fixture);
  });
  it("retains strict authority and audit parsers", () => { expect(parseJuliaPixelFinalAuthorityManifestV2(authorityAsset).ok).toBe(true); expect(parseJuliaFinalRecoveryAuditV2(auditAsset).ok).toBe(true); });
});
