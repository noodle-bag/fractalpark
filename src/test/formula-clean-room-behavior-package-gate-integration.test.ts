import { createHash, generateKeyPairSync, sign } from "node:crypto";
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

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
    .join(",")}}`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

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

  it("binds an ephemeral principal credential on the exact set without granting authority", () => {
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
    const evidenceRows = behavior.rows.map((row) => ({
      formulaId: row.formulaId,
      rowProjectionHash: row.evidenceRowProjectionHash,
    }));
    const exactSetBindingSha256 = hash(evidenceRows);
    const root = generateKeyPairSync("ed25519");
    const rootSpki = root.publicKey.export({ format: "der", type: "spki" });
    const rootId = createHash("sha256").update(rootSpki).digest("hex");
    const roles = [
      "contaminated-candidate-author",
      "projection-controller",
      "contaminated-reviewer",
      "clean-reviewer",
      "admission-verifier",
    ] as const;
    const roleKeys = roles.map(() => generateKeyPairSync("ed25519"));
    const principals = roles.map((role, index) => {
      const publicKeySpki = roleKeys[index]!.publicKey.export({
        format: "der",
        type: "spki",
      });
      return {
        principalId: `ephemeral-exact-principal-${index + 1}`,
        role,
        keyId: createHash("sha256").update(publicKeySpki).digest("hex"),
        publicKeySpkiBase64: publicKeySpki.toString("base64"),
      };
    });
    const registryGeneration = 1;
    const registryPayload = {
      domain: "fractalpark/clean-room-attestation-authority/registry/v1",
      registryGeneration,
      exactSetBindingSha256,
      rootEd25519SpkiSha256: rootId,
      principals,
    };
    const authorityRegistry = {
      registrySchemaVersion: 1,
      registryGeneration,
      exactSetBindingSha256,
      rootEd25519SpkiSha256: rootId,
      principals,
      rootSignatureBase64: sign(
        null,
        Buffer.from(canonical(registryPayload)),
        root.privateKey,
      ).toString("base64"),
    };
    const row = {
      formulaId: evidenceRows[0]!.formulaId,
      packageGeneration: 1,
      reviewedBehaviorObjectSha256: createHash("sha256")
        .update("ephemeral-exact-binding-regression-only")
        .digest("hex"),
    };
    const purposes = [
      "candidate-author",
      "content-digest-projection",
      "contaminated-review",
      "clean-review",
    ] as const;
    const surfaces = [
      "restricted-evidence-and-private-behavior-content",
      "private-behavior-content-and-frozen-clean-envelope",
      "restricted-evidence-and-frozen-clean-envelope",
      "frozen-clean-envelope-only",
    ] as const;
    const statements = purposes.map((purpose, index) => {
      const principal = principals[index]!;
      const payload = {
        domain: "fractalpark/clean-room-attestation-authority/statement/v1",
        ...row,
        exactSetBindingSha256,
        registryGeneration,
        principalId: principal.principalId,
        role: principal.role,
        keyId: principal.keyId,
        purpose,
        allowedInputSurface: surfaces[index],
      };
      return {
        ...row,
        exactSetBindingSha256,
        registryGeneration,
        principalId: principal.principalId,
        role: principal.role,
        keyId: principal.keyId,
        purpose,
        allowedInputSurface: surfaces[index],
        signatureBase64: sign(
          null,
          Buffer.from(canonical(payload)),
          roleKeys[index]!.privateKey,
        ).toString("base64"),
      };
    });
    const input = {
      route: "exact",
      evidenceRows,
      authorityRegistry,
      attestationRows: [{ ...row, statements }],
    };
    const trustAnchor = {
      ed25519RootSpkiBase64: rootSpki.toString("base64"),
      trustedRegistryGeneration: registryGeneration,
    };
    const result = evaluateCleanRoomAttestationAuthorityGateV1(
      input,
      trustAnchor,
    ) as unknown as {
      candidateAdmissions: number;
      publicCandidateAssemblyAllowed: boolean;
      publicPromotionAllowed: boolean;
      publicAssetsWritten: number;
      summary: Record<string, unknown>;
      rows: readonly {
        formulaId: string;
        syntheticAuthorityContractSatisfied: boolean;
        principalCredentialBindingStatus: string;
        behaviorPackageContentAttestationStatus: string;
        contentAttested: boolean;
        candidateApproved: boolean;
        behaviorPackageAdmitted: boolean;
        implementationAuthorized: boolean;
      }[];
    };

    expect(result.summary).toMatchObject({
      total: 452,
      submittedAttestationRows: 1,
      cryptographicallyBoundToEnrolledPrincipals: 1,
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
    expect(result.rows[0]).toMatchObject({
      formulaId: row.formulaId,
      syntheticAuthorityContractSatisfied: false,
      principalCredentialBindingStatus:
        "cryptographically-bound-to-enrolled-principals",
      behaviorPackageContentAttestationStatus: "bytes-not-read-unverified",
      contentAttested: false,
      candidateApproved: false,
      behaviorPackageAdmitted: false,
      implementationAuthorized: false,
    });
    expect(result.candidateAdmissions).toBe(0);
    expect(result.publicCandidateAssemblyAllowed).toBe(false);
    expect(result.publicPromotionAllowed).toBe(false);
    expect(result.publicAssetsWritten).toBe(0);
    expect(
      verifyCleanRoomAttestationAuthorityGateV1(input, trustAnchor, result),
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
