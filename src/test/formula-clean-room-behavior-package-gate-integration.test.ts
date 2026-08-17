import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateCleanRoomBehaviorPackageGateV1 } from "@/engine/formulas/v1/clean-room-behavior-package-gate";
import { verifyCleanRoomBehaviorPackageGateV1 } from "@/engine/formulas/v1/clean-room-behavior-package-gate-verifier";
import { evaluateCleanRoomAttestationAuthorityGateV1 } from "@/engine/formulas/v1/clean-room-attestation-authority-gate";
import { verifyCleanRoomAttestationAuthorityGateV1 } from "@/engine/formulas/v1/clean-room-attestation-authority-gate-verifier";

const privateIntegration =
  process.env.FRACTALPARK_FORMULA_PRIVATE_INTEGRATION === "1";

const suite = privateIntegration ? describe : describe.skip;

suite("clean-room behavior-package gate private exact-set integration", () => {
  it("binds the real frozen evidence set and remains honestly zero-state", () => {
    const manifestPath = resolve(
      process.cwd(),
      ".formula-library-private/formula-library-v1/clean-room-evidence-v1/manifest.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      rows: readonly unknown[];
    };
    const input = { evidenceRows: manifest.rows, submissionRows: [] };
    const result = evaluateCleanRoomBehaviorPackageGateV1(input);

    expect(result.exactSetAuthorityStatus).toBe("bound");
    expect(result.summary).toMatchObject({
      total: 452,
      submissions: 0,
      missingSubmissions: 452,
      syntheticCandidateContractsSatisfied: 0,
      behaviorPackageCandidatesApproved: 0,
      behaviorPackagesAdmitted: 0,
      behaviorPackagesBlocked: 452,
      implementationAuthorized: 0,
    });
    expect(
      result.rows.every(
        (row) => !row.blockReasons.includes("exact-set-authority-unbound"),
      ),
    ).toBe(true);
    expect(result.candidateAdmissions).toBe(0);
    expect(result.publicCandidateAssemblyAllowed).toBe(false);
    expect(result.publicPromotionAllowed).toBe(false);
    expect(result.publicAssetsWritten).toBe(0);
    expect(verifyCleanRoomBehaviorPackageGateV1(input, result)).toEqual({
      total: 452,
      syntheticCandidateContractsSatisfied: 0,
    });
  });

  it("keeps the exact authority route closed with no configured trust root or submissions", () => {
    const manifestPath = resolve(
      process.cwd(),
      ".formula-library-private/formula-library-v1/clean-room-evidence-v1/manifest.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      rows: readonly unknown[];
    };
    const behavior = evaluateCleanRoomBehaviorPackageGateV1({
      evidenceRows: manifest.rows,
      submissionRows: [],
    });
    const input = {
      route: "exact",
      evidenceRows: behavior.rows.map((row) => ({
        formulaId: row.formulaId,
        rowProjectionHash: row.evidenceRowProjectionHash,
      })),
      authorityRegistry: null,
      attestationRows: [],
    };
    const result = evaluateCleanRoomAttestationAuthorityGateV1(
      input,
      null,
    ) as unknown as {
      trustAnchorStatus: string;
      registryStatus: string;
      candidateAdmissions: number;
      publicCandidateAssemblyAllowed: boolean;
      publicPromotionAllowed: boolean;
      publicAssetsWritten: number;
      summary: Record<string, unknown>;
      rows: readonly {
        behaviorPackageContentAttestationStatus: string;
        principalCredentialBindingStatus: string;
        blockReasons: readonly string[];
      }[];
    };

    expect(result.trustAnchorStatus).toBe("unconfigured");
    expect(result.registryStatus).toBe("unverified");
    expect(result.summary).toMatchObject({
      total: 452,
      submittedAttestationRows: 0,
      cryptographicallyBoundToEnrolledPrincipals: 0,
      contentAttested: 0,
      syntheticAuthorityContractSatisfied: 0,
      candidateApprovals: 0,
      candidateAdmissions: 0,
      behaviorPackageAdmissions: 0,
      behaviorPackagesBlocked: 452,
      implementationAuthorizations: 0,
      publicCandidateAssemblies: 0,
      publicPromotions: 0,
      publicAssetsWritten: 0,
    });
    expect(
      result.rows.every(
        (row) =>
          row.behaviorPackageContentAttestationStatus ===
            "bytes-not-read-unverified" &&
          row.principalCredentialBindingStatus === "unverified" &&
          row.blockReasons.includes(
            "reviewer-identity-not-independently-attested",
          ) &&
          row.blockReasons.includes("content-bytes-not-read"),
      ),
    ).toBe(true);
    expect(result.candidateAdmissions).toBe(0);
    expect(result.publicCandidateAssemblyAllowed).toBe(false);
    expect(result.publicPromotionAllowed).toBe(false);
    expect(result.publicAssetsWritten).toBe(0);
    expect(
      verifyCleanRoomAttestationAuthorityGateV1(input, null, result),
    ).toEqual({
      total: 452,
      syntheticAuthorityContractSatisfied: 0,
    });
  });

  it("rejects relabelling the frozen exact set as synthetic", () => {
    const manifestPath = resolve(
      process.cwd(),
      ".formula-library-private/formula-library-v1/clean-room-evidence-v1/manifest.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      rows: readonly unknown[];
    };
    const behavior = evaluateCleanRoomBehaviorPackageGateV1({
      evidenceRows: manifest.rows,
      submissionRows: [],
    });
    const downgradedInput = {
      route: "synthetic",
      evidenceRows: behavior.rows.map((row) => ({
        formulaId: row.formulaId,
        rowProjectionHash: row.evidenceRowProjectionHash,
      })),
      authorityRegistry: null,
      attestationRows: [],
    };

    expect(() =>
      evaluateCleanRoomAttestationAuthorityGateV1(downgradedInput, null),
    ).toThrow("clean-room-attestation-authority-invalid");
    expect(() =>
      verifyCleanRoomAttestationAuthorityGateV1(downgradedInput, null, {}),
    ).toThrow(
      "clean-room-attestation-authority-independent-verification-invalid",
    );
  });
});
