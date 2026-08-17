import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateCleanRoomBehaviorPackageGateV1 } from "@/engine/formulas/v1/clean-room-behavior-package-gate";
import { verifyCleanRoomBehaviorPackageGateV1 } from "@/engine/formulas/v1/clean-room-behavior-package-gate-verifier";

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
    expect(result.rows.every((row) => !row.blockReasons.includes("exact-set-authority-unbound"))).toBe(true);
    expect(result.candidateAdmissions).toBe(0);
    expect(result.publicCandidateAssemblyAllowed).toBe(false);
    expect(result.publicPromotionAllowed).toBe(false);
    expect(result.publicAssetsWritten).toBe(0);
    expect(verifyCleanRoomBehaviorPackageGateV1(input, result)).toEqual({
      total: 452,
      syntheticCandidateContractsSatisfied: 0,
    });
  });
});
