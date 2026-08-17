import {
  createHash,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";

import { describe, expect, it } from "vitest";

import { evaluateCleanRoomAttestationAuthorityGateV1 } from "@/engine/formulas/v1/clean-room-attestation-authority-gate";
import { verifyCleanRoomAttestationAuthorityGateV1 } from "@/engine/formulas/v1/clean-room-attestation-authority-gate-verifier";

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
function fixtureBundle() {
  const evidenceRows = Array.from({ length: 452 }, (_, index) => ({
    formulaId: `00000000-0000-5000-8000-${index.toString(16).padStart(12, "0")}`,
    rowProjectionHash: index.toString(16).padStart(64, "0"),
  }));
  const binding = hash(evidenceRows);
  const root = generateKeyPairSync("ed25519");
  const rootSpki = root.publicKey
    .export({ format: "der", type: "spki" })
    .toString("base64");
  const rootId = createHash("sha256")
    .update(Buffer.from(rootSpki, "base64"))
    .digest("hex");
  const roles = [
    "contaminated-candidate-author",
    "projection-controller",
    "contaminated-reviewer",
    "clean-reviewer",
    "admission-verifier",
  ];
  const keys = roles.map(() => generateKeyPairSync("ed25519"));
  const principals = roles.map((role, index) => {
    const publicKeySpkiBase64 = keys[index]!.publicKey.export({
      format: "der",
      type: "spki",
    }).toString("base64");
    return {
      principalId: `principal-${index}`,
      role,
      keyId: createHash("sha256")
        .update(Buffer.from(publicKeySpkiBase64, "base64"))
        .digest("hex"),
      publicKeySpkiBase64,
    };
  });
  const registryPayload = {
    domain: "fractalpark/clean-room-attestation-authority/registry/v1",
    registryGeneration: 1,
    exactSetBindingSha256: binding,
    rootEd25519SpkiSha256: rootId,
    principals,
  };
  const authorityRegistry = {
    registrySchemaVersion: 1,
    registryGeneration: 1,
    exactSetBindingSha256: binding,
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
    reviewedBehaviorObjectSha256: "a".repeat(64),
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
  ];
  const statements = purposes.map((purpose, index) => {
    const principal = principals[index]!;
    const payload = {
      domain: "fractalpark/clean-room-attestation-authority/statement/v1",
      ...row,
      exactSetBindingSha256: binding,
      registryGeneration: 1,
      principalId: principal.principalId,
      role: principal.role,
      keyId: principal.keyId,
      purpose,
      allowedInputSurface: surfaces[index],
    };
    return {
      ...row,
      exactSetBindingSha256: binding,
      registryGeneration: 1,
      principalId: principal.principalId,
      role: principal.role,
      keyId: principal.keyId,
      purpose,
      allowedInputSurface: surfaces[index],
      signatureBase64: sign(
        null,
        Buffer.from(canonical(payload)),
        keys[index]!.privateKey,
      ).toString("base64"),
    };
  });
  const input = {
    route: "synthetic",
    evidenceRows,
    authorityRegistry,
    attestationRows: [{ ...row, statements }],
  };
  const trustAnchor = {
    ed25519RootSpkiBase64: rootSpki,
    trustedRegistryGeneration: 1,
  };
  return { input, trustAnchor, root };
}

function fixture() {
  return fixtureBundle();
}

function resignRegistry(
  input: ReturnType<typeof fixture>["input"],
  rootPrivateKey: KeyObject,
): void {
  const registry = input.authorityRegistry;
  const payload = {
    domain: "fractalpark/clean-room-attestation-authority/registry/v1",
    registryGeneration: registry.registryGeneration,
    exactSetBindingSha256: registry.exactSetBindingSha256,
    rootEd25519SpkiSha256: registry.rootEd25519SpkiSha256,
    principals: registry.principals,
  };
  registry.rootSignatureBase64 = sign(
    null,
    Buffer.from(canonical(payload)),
    rootPrivateKey,
  ).toString("base64");
}

function corruptSignature(value: string): string {
  const bytes = Buffer.from(value, "base64");
  bytes[0] = bytes[0]! ^ 1;
  return bytes.toString("base64");
}

describe("clean-room attestation authority gate", () => {
  it("accepts only a synthetic, root-signed, role-separated detached bundle", () => {
    const { input, trustAnchor } = fixture();
    const output = evaluateCleanRoomAttestationAuthorityGateV1(
      input,
      trustAnchor,
    ) as unknown as {
      summary: Record<string, unknown>;
      rows: readonly Record<string, unknown>[];
    };
    expect(output.summary).toMatchObject({
      cryptographicallyBoundToEnrolledPrincipals: 1,
      contentAttested: 0,
      syntheticAuthorityContractSatisfied: 1,
      candidateApprovals: 0,
      behaviorPackageAdmissions: 0,
      behaviorPackagesBlocked: 452,
      implementationAuthorizations: 0,
    });
    expect(output.rows[0]).toMatchObject({
      syntheticAuthorityContractSatisfied: true,
      principalCredentialBindingStatus:
        "cryptographically-bound-to-enrolled-principals",
      behaviorPackageContentAttestationStatus: "bytes-not-read-unverified",
      candidateApproved: false,
    });
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output.rows)).toBe(true);
    expect(Object.isFrozen(output.rows[0]!.blockReasons)).toBe(true);
    expect(Object.isFrozen(output.summary)).toBe(true);
    const serialized = JSON.stringify(output);
    for (const forbidden of [
      "signatureBase64",
      "publicKeySpkiBase64",
      "ed25519RootSpkiBase64",
      "principal-0",
      "privateKey",
      "sourcePath",
      "protectedContent",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(
      verifyCleanRoomAttestationAuthorityGateV1(input, trustAnchor, output),
    ).toEqual({ total: 452, syntheticAuthorityContractSatisfied: 1 });
  });

  it("rejects root spoofing, replay, role conflicts, hostile shapes, and output tampering", () => {
    const { input, trustAnchor } = fixture();
    const fabricatedExact = structuredClone(input);
    fabricatedExact.route = "exact";
    expect(() =>
      evaluateCleanRoomAttestationAuthorityGateV1(fabricatedExact, trustAnchor),
    ).toThrow("clean-room-attestation-authority-invalid");
    const spoof = structuredClone(input);
    spoof.authorityRegistry.rootEd25519SpkiSha256 = "b".repeat(64);
    expect(() =>
      evaluateCleanRoomAttestationAuthorityGateV1(spoof, trustAnchor),
    ).toThrow("clean-room-attestation-authority-invalid");
    const replay = structuredClone(input);
    replay.attestationRows[0]!.statements[0]!.purpose = "clean-review";
    const replayResult = evaluateCleanRoomAttestationAuthorityGateV1(
      replay,
      trustAnchor,
    ) as unknown as {
      rows: readonly { syntheticAuthorityContractSatisfied: boolean }[];
    };
    expect(replayResult.rows[0]!.syntheticAuthorityContractSatisfied).toBe(
      false,
    );
    const overlap = structuredClone(input);
    overlap.authorityRegistry.principals[1]!.keyId =
      overlap.authorityRegistry.principals[0]!.keyId;
    expect(() =>
      evaluateCleanRoomAttestationAuthorityGateV1(overlap, trustAnchor),
    ).toThrow("clean-room-attestation-authority-invalid");
    const staleTrustAnchor = structuredClone(trustAnchor);
    staleTrustAnchor.trustedRegistryGeneration = 2;
    expect(() =>
      evaluateCleanRoomAttestationAuthorityGateV1(input, staleTrustAnchor),
    ).toThrow("clean-room-attestation-authority-invalid");
    const unconfigured = {
      route: input.route,
      evidenceRows: structuredClone(input.evidenceRows),
      authorityRegistry: null,
      attestationRows: [],
    };
    const zero = evaluateCleanRoomAttestationAuthorityGateV1(
      unconfigured,
      null,
    ) as unknown as {
      summary: {
        cryptographicallyBoundToEnrolledPrincipals: number;
        behaviorPackagesBlocked: number;
      };
    };
    expect(zero.summary).toEqual(
      expect.objectContaining({
        cryptographicallyBoundToEnrolledPrincipals: 0,
        behaviorPackagesBlocked: 452,
      }),
    );
    const { input: hostile, trustAnchor: hostileTrustAnchor } = fixture();
    Object.defineProperty(hostile.evidenceRows[0]!, "formulaId", {
      enumerable: true,
      get: () => "00000000-0000-5000-8000-000000000000",
    });
    expect(() =>
      evaluateCleanRoomAttestationAuthorityGateV1(hostile, hostileTrustAnchor),
    ).toThrow("clean-room-attestation-authority-invalid");
    const result = evaluateCleanRoomAttestationAuthorityGateV1(
      input,
      trustAnchor,
    ) as unknown as {
      summary: { candidateApprovals: number };
    };
    const tampered = structuredClone(result);
    tampered.summary.candidateApprovals = 1;
    expect(() =>
      verifyCleanRoomAttestationAuthorityGateV1(input, trustAnchor, tampered),
    ).toThrow(
      "clean-room-attestation-authority-independent-verification-invalid",
    );
  });

  it("rejects a trust anchor copied into untrusted input", () => {
    const { input, trustAnchor } = fixture();
    const output = evaluateCleanRoomAttestationAuthorityGateV1(
      input,
      trustAnchor,
    );
    const contaminated = {
      ...input,
      outOfBandTrustAnchor: trustAnchor,
    };
    expect(() =>
      evaluateCleanRoomAttestationAuthorityGateV1(contaminated, trustAnchor),
    ).toThrow("clean-room-attestation-authority-invalid");
    expect(() =>
      verifyCleanRoomAttestationAuthorityGateV1(
        contaminated,
        trustAnchor,
        output,
      ),
    ).toThrow(
      "clean-room-attestation-authority-independent-verification-invalid",
    );
  });

  it("binds every credential field and rejects missing or duplicate statements", () => {
    const mutations: readonly Readonly<{
      name: string;
      apply: (input: ReturnType<typeof fixture>["input"]) => void;
    }>[] = [
      {
        name: "formula ID",
        apply: (input) => {
          input.attestationRows[0]!.statements[0]!.formulaId =
            input.evidenceRows[1]!.formulaId;
        },
      },
      {
        name: "package generation",
        apply: (input) => {
          input.attestationRows[0]!.statements[0]!.packageGeneration = 2;
        },
      },
      {
        name: "reviewed object hash",
        apply: (input) => {
          input.attestationRows[0]!.statements[0]!.reviewedBehaviorObjectSha256 =
            "b".repeat(64);
        },
      },
      {
        name: "exact-set binding",
        apply: (input) => {
          input.attestationRows[0]!.statements[0]!.exactSetBindingSha256 =
            "b".repeat(64);
        },
      },
      {
        name: "registry generation",
        apply: (input) => {
          input.attestationRows[0]!.statements[0]!.registryGeneration = 2;
        },
      },
      {
        name: "principal ID",
        apply: (input) => {
          input.attestationRows[0]!.statements[0]!.principalId =
            input.authorityRegistry.principals[1]!.principalId;
        },
      },
      {
        name: "role",
        apply: (input) => {
          input.attestationRows[0]!.statements[0]!.role = "clean-reviewer";
        },
      },
      {
        name: "key ID",
        apply: (input) => {
          input.attestationRows[0]!.statements[0]!.keyId =
            input.authorityRegistry.principals[1]!.keyId;
        },
      },
      {
        name: "purpose",
        apply: (input) => {
          input.attestationRows[0]!.statements[0]!.purpose = "clean-review";
        },
      },
      {
        name: "input surface",
        apply: (input) => {
          input.attestationRows[0]!.statements[0]!.allowedInputSurface =
            "frozen-clean-envelope-only";
        },
      },
      {
        name: "detached signature",
        apply: (input) => {
          const statement = input.attestationRows[0]!.statements[0]!;
          statement.signatureBase64 = corruptSignature(
            statement.signatureBase64,
          );
        },
      },
    ];

    for (const mutation of mutations) {
      const { input: fixtureInput, trustAnchor } = fixture();
      const input = structuredClone(fixtureInput);
      mutation.apply(input);
      const output = evaluateCleanRoomAttestationAuthorityGateV1(
        input,
        trustAnchor,
      ) as unknown as {
        rows: readonly { syntheticAuthorityContractSatisfied: boolean }[];
      };
      expect(
        output.rows[0]!.syntheticAuthorityContractSatisfied,
        mutation.name,
      ).toBe(false);
      expect(
        verifyCleanRoomAttestationAuthorityGateV1(input, trustAnchor, output),
      ).toEqual({
        total: 452,
        syntheticAuthorityContractSatisfied: 0,
      });
    }

    const { input: missingInput, trustAnchor: missingTrustAnchor } = fixture();
    const missing = structuredClone(missingInput);
    missing.attestationRows[0]!.statements.pop();
    const missingOutput = evaluateCleanRoomAttestationAuthorityGateV1(
      missing,
      missingTrustAnchor,
    ) as unknown as {
      rows: readonly { syntheticAuthorityContractSatisfied: boolean }[];
    };
    expect(missingOutput.rows[0]!.syntheticAuthorityContractSatisfied).toBe(
      false,
    );
    expect(
      verifyCleanRoomAttestationAuthorityGateV1(
        missing,
        missingTrustAnchor,
        missingOutput,
      ),
    ).toEqual({ total: 452, syntheticAuthorityContractSatisfied: 0 });

    const { input: duplicateInput, trustAnchor: duplicateTrustAnchor } =
      fixture();
    const duplicate = structuredClone(duplicateInput);
    duplicate.attestationRows[0]!.statements[3] =
      duplicate.attestationRows[0]!.statements[0]!;
    const duplicateOutput = evaluateCleanRoomAttestationAuthorityGateV1(
      duplicate,
      duplicateTrustAnchor,
    ) as unknown as {
      rows: readonly { syntheticAuthorityContractSatisfied: boolean }[];
    };
    expect(duplicateOutput.rows[0]!.syntheticAuthorityContractSatisfied).toBe(
      false,
    );
    expect(
      verifyCleanRoomAttestationAuthorityGateV1(
        duplicate,
        duplicateTrustAnchor,
        duplicateOutput,
      ),
    ).toEqual({ total: 452, syntheticAuthorityContractSatisfied: 0 });

    const { input: extraInput, trustAnchor: extraTrustAnchor } = fixture();
    const extra = structuredClone(extraInput);
    extra.attestationRows[0]!.statements.push(
      structuredClone(extra.attestationRows[0]!.statements[0]!),
    );
    expect(() =>
      evaluateCleanRoomAttestationAuthorityGateV1(extra, extraTrustAnchor),
    ).toThrow("clean-room-attestation-authority-invalid");
  });

  it("rejects self-issued roots and duplicate registry identities after re-signing", () => {
    const selfIssued = fixtureBundle();
    const attacker = generateKeyPairSync("ed25519");
    const attackerSpki = attacker.publicKey.export({
      format: "der",
      type: "spki",
    });
    selfIssued.input.authorityRegistry.rootEd25519SpkiSha256 = createHash(
      "sha256",
    )
      .update(attackerSpki)
      .digest("hex");
    resignRegistry(selfIssued.input, attacker.privateKey);
    expect(() =>
      evaluateCleanRoomAttestationAuthorityGateV1(
        selfIssued.input,
        selfIssued.trustAnchor,
      ),
    ).toThrow("clean-room-attestation-authority-invalid");

    for (const duplicate of ["principal", "role", "key"] as const) {
      const bundle = fixtureBundle();
      const first = bundle.input.authorityRegistry.principals[0]!;
      const second = bundle.input.authorityRegistry.principals[1]!;
      if (duplicate === "principal") second.principalId = first.principalId;
      else if (duplicate === "role") second.role = first.role;
      else {
        second.keyId = first.keyId;
        second.publicKeySpkiBase64 = first.publicKeySpkiBase64;
      }
      resignRegistry(bundle.input, bundle.root.privateKey);
      expect(() =>
        evaluateCleanRoomAttestationAuthorityGateV1(
          bundle.input,
          bundle.trustAnchor,
        ),
      ).toThrow("clean-room-attestation-authority-invalid");
    }
  });

  it("rejects non-data shapes, malformed credentials, and all output-row projections", () => {
    const { input: validInput, trustAnchor } = fixture();
    const validOutput = evaluateCleanRoomAttestationAuthorityGateV1(
      validInput,
      trustAnchor,
    );
    for (const extraField of ["reviewText", "protectedContent", "sourcePath"]) {
      const extra = structuredClone(validInput) as ReturnType<
        typeof fixture
      >["input"] &
        Record<string, unknown>;
      if (extraField === "sourcePath") {
        Object.assign(extra.authorityRegistry.principals[0]!, {
          [extraField]: "/private/not-allowed",
        });
      } else {
        Object.assign(extra.attestationRows[0]!.statements[0]!, {
          [extraField]: "not-allowed",
        });
      }
      expect(() =>
        evaluateCleanRoomAttestationAuthorityGateV1(extra, trustAnchor),
      ).toThrow("clean-room-attestation-authority-invalid");
      expect(() =>
        verifyCleanRoomAttestationAuthorityGateV1(
          extra,
          trustAnchor,
          validOutput,
        ),
      ).toThrow(
        "clean-room-attestation-authority-independent-verification-invalid",
      );
    }

    const wrongSignature = structuredClone(validInput);
    wrongSignature.attestationRows[0]!.statements[0]!.signatureBase64 =
      corruptSignature(
        wrongSignature.attestationRows[0]!.statements[0]!.signatureBase64,
      );
    const wrongSignatureOutput = evaluateCleanRoomAttestationAuthorityGateV1(
      wrongSignature,
      trustAnchor,
    );
    const malformedSignature = structuredClone(wrongSignature);
    malformedSignature.attestationRows[0]!.statements[0]!.signatureBase64 =
      "AA==";
    expect(() =>
      evaluateCleanRoomAttestationAuthorityGateV1(
        malformedSignature,
        trustAnchor,
      ),
    ).toThrow("clean-room-attestation-authority-invalid");
    expect(() =>
      verifyCleanRoomAttestationAuthorityGateV1(
        malformedSignature,
        trustAnchor,
        wrongSignatureOutput,
      ),
    ).toThrow(
      "clean-room-attestation-authority-independent-verification-invalid",
    );

    const closedWithoutRegistry = {
      route: validInput.route,
      evidenceRows: structuredClone(validInput.evidenceRows),
      authorityRegistry: null,
      attestationRows: structuredClone(validInput.attestationRows),
    };
    const closedWithoutRegistryOutput =
      evaluateCleanRoomAttestationAuthorityGateV1(closedWithoutRegistry, null);
    const malformedClosedStatements = [
      (input: typeof closedWithoutRegistry) => {
        input.attestationRows[0]!.statements[0]!.formulaId = "not-a-uuid";
      },
      (input: typeof closedWithoutRegistry) => {
        input.attestationRows[0]!.statements[0]!.role = "not-a-registered-role";
      },
      (input: typeof closedWithoutRegistry) => {
        input.attestationRows[0]!.statements[0]!.allowedInputSurface =
          "a".repeat(129);
      },
    ];
    for (const makeMalformed of malformedClosedStatements) {
      const malformed = structuredClone(closedWithoutRegistry);
      makeMalformed(malformed);
      expect(() =>
        evaluateCleanRoomAttestationAuthorityGateV1(malformed, null),
      ).toThrow("clean-room-attestation-authority-invalid");
      expect(() =>
        verifyCleanRoomAttestationAuthorityGateV1(
          malformed,
          null,
          closedWithoutRegistryOutput,
        ),
      ).toThrow(
        "clean-room-attestation-authority-independent-verification-invalid",
      );
    }

    const { input: malformedKeyInput, trustAnchor: malformedKeyTrustAnchor } =
      fixture();
    const malformedKey = structuredClone(malformedKeyInput);
    malformedKey.authorityRegistry.principals[0]!.publicKeySpkiBase64 = "AQ==";
    expect(() =>
      evaluateCleanRoomAttestationAuthorityGateV1(
        malformedKey,
        malformedKeyTrustAnchor,
      ),
    ).toThrow("clean-room-attestation-authority-invalid");
    const { input: unsafeInput, trustAnchor: unsafeTrustAnchor } = fixture();
    const unsafe = structuredClone(unsafeInput);
    unsafe.authorityRegistry.registryGeneration = Number.MAX_SAFE_INTEGER + 1;
    expect(() =>
      evaluateCleanRoomAttestationAuthorityGateV1(unsafe, unsafeTrustAnchor),
    ).toThrow("clean-room-attestation-authority-invalid");
    const { input: negativeZeroInput, trustAnchor: negativeZeroTrustAnchor } =
      fixture();
    const negativeZero = structuredClone(negativeZeroTrustAnchor);
    negativeZero.trustedRegistryGeneration = -0;
    expect(() =>
      evaluateCleanRoomAttestationAuthorityGateV1(
        negativeZeroInput,
        negativeZero,
      ),
    ).toThrow("clean-room-attestation-authority-invalid");
    const { input: sparse, trustAnchor: sparseTrustAnchor } = fixture();
    delete sparse.evidenceRows[1];
    expect(() =>
      evaluateCleanRoomAttestationAuthorityGateV1(sparse, sparseTrustAnchor),
    ).toThrow("clean-room-attestation-authority-invalid");
    const { input: symbols, trustAnchor: symbolsTrustAnchor } = fixture();
    Object.defineProperty(symbols, Symbol("extra"), {
      value: true,
      enumerable: true,
    });
    expect(() =>
      evaluateCleanRoomAttestationAuthorityGateV1(symbols, symbolsTrustAnchor),
    ).toThrow("clean-room-attestation-authority-invalid");
    const { input: proxyInput, trustAnchor: proxyTrustAnchor } = fixture();
    const proxy = new Proxy(proxyInput, {});
    expect(() =>
      evaluateCleanRoomAttestationAuthorityGateV1(proxy, proxyTrustAnchor),
    ).toThrow("clean-room-attestation-authority-invalid");

    const { input, trustAnchor: outputTrustAnchor } = fixture();
    const output = evaluateCleanRoomAttestationAuthorityGateV1(
      input,
      outputTrustAnchor,
    ) as unknown as {
      rows: {
        evidenceRowProjectionHash: string;
        blockReasons: string[];
      }[];
      summary: { behaviorPackagesBlocked: number };
      outputSha256: string;
    };
    for (const target of ["row", "summary", "hash"] as const) {
      const changed = structuredClone(output);
      if (target === "row")
        changed.rows[0].evidenceRowProjectionHash = "b".repeat(64);
      else if (target === "summary")
        changed.summary.behaviorPackagesBlocked = 0;
      else changed.outputSha256 = "b".repeat(64);
      expect(() =>
        verifyCleanRoomAttestationAuthorityGateV1(
          input,
          outputTrustAnchor,
          changed,
        ),
      ).toThrow(
        "clean-room-attestation-authority-independent-verification-invalid",
      );
    }

    const hostileOutputs = [
      () => {
        const changed = structuredClone(output);
        changed.rows = new Proxy(changed.rows, {});
        return changed;
      },
      () => {
        const changed = structuredClone(output);
        Object.defineProperty(changed.summary, "behaviorPackagesBlocked", {
          enumerable: true,
          get: () => 452,
        });
        return changed;
      },
      () => {
        const changed = structuredClone(output);
        changed.rows[0]!.blockReasons = new Proxy(
          changed.rows[0]!.blockReasons,
          {},
        );
        return changed;
      },
      () => {
        const changed = structuredClone(output);
        Object.defineProperty(changed.rows[0]!, Symbol("nested-output"), {
          value: true,
          enumerable: true,
        });
        return changed;
      },
    ];
    for (const makeHostileOutput of hostileOutputs) {
      expect(() =>
        verifyCleanRoomAttestationAuthorityGateV1(
          input,
          outputTrustAnchor,
          makeHostileOutput(),
        ),
      ).toThrow(
        "clean-room-attestation-authority-independent-verification-invalid",
      );
    }
  });
});
