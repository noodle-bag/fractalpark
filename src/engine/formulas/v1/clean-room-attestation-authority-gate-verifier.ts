import { createHash, createPublicKey, verify } from "node:crypto";
import { types } from "node:util";

// Intentionally standalone: this verifier does not import the authority evaluator
// (or its constants), so a shared defect cannot certify an authority result.
const ERROR =
  "clean-room-attestation-authority-independent-verification-invalid";
const FROZEN =
  "cc2fdecb4dd210ebb0d55d212ea973d65fb2c443b687cd8f137c8b98a6402243";
const SHA = /^[a-f0-9]{64}$/;
const B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const ROLES: Record<string, string> = {
  "candidate-author": "contaminated-candidate-author",
  "content-digest-projection": "projection-controller",
  "contaminated-review": "contaminated-reviewer",
  "clean-review": "clean-reviewer",
};
const SURFACES: Record<string, string> = {
  "candidate-author": "restricted-evidence-and-private-behavior-content",
  "content-digest-projection":
    "private-behavior-content-and-frozen-clean-envelope",
  "contaminated-review": "restricted-evidence-and-frozen-clean-envelope",
  "clean-review": "frozen-clean-envelope-only",
};
const ENROLLED_ROLES = [
  "contaminated-candidate-author",
  "projection-controller",
  "contaminated-reviewer",
  "clean-reviewer",
  "admission-verifier",
];
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function fail(): never {
  throw new Error(ERROR);
}
function canonical(v: unknown): string {
  if (
    v === null ||
    typeof v === "boolean" ||
    typeof v === "number" ||
    typeof v === "string"
  )
    return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const x = v as Record<string, unknown>;
  return `{${Object.keys(x)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`)
    .join(",")}}`;
}
function digest(v: unknown): string {
  return createHash("sha256").update(canonical(v)).digest("hex");
}
function object(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    types.isProxy(v) ||
    Object.getPrototypeOf(v) !== Object.prototype ||
    Object.getOwnPropertySymbols(v).length
  )
    fail();
  const actual = Reflect.ownKeys(v);
  if (
    actual.length !== keys.length ||
    actual.some((k) => typeof k !== "string") ||
    [...(actual as string[])].sort().some((k, i) => k !== [...keys].sort()[i])
  )
    fail();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const d = Object.getOwnPropertyDescriptor(v, k);
    if (!d || !("value" in d) || !d.enumerable) fail();
    out[k] = d.value;
  }
  return out;
}
function list(v: unknown, max: number): readonly unknown[] {
  if (
    !Array.isArray(v) ||
    types.isProxy(v) ||
    Object.getPrototypeOf(v) !== Array.prototype ||
    Object.getOwnPropertySymbols(v).length ||
    v.length > max ||
    Reflect.ownKeys(v).length !== v.length + 1
  )
    fail();
  return v.map((x, i) => {
    const d = Object.getOwnPropertyDescriptor(v, String(i));
    if (!d || !("value" in d) || !d.enumerable) fail();
    return d.value;
  });
}
function text(v: unknown, pattern: RegExp, max = 2048): string {
  if (typeof v !== "string" || v.length > max || !pattern.test(v)) fail();
  return v;
}
function num(v: unknown): number {
  if (
    typeof v !== "number" ||
    !Number.isSafeInteger(v) ||
    Object.is(v, -0) ||
    v < 1 ||
    v > 1_000_000
  )
    fail();
  return v;
}
function key(v: unknown): { encoded: string; id: string } {
  const encoded = text(v, B64);
  try {
    const suppliedDer = Buffer.from(encoded, "base64");
    if (suppliedDer.toString("base64") !== encoded) fail();
    const k = createPublicKey({
      key: suppliedDer,
      format: "der",
      type: "spki",
    });
    if (k.asymmetricKeyType !== "ed25519") fail();
    const canonicalDer = k.export({ format: "der", type: "spki" });
    if (!suppliedDer.equals(canonicalDer)) fail();
    return {
      encoded: canonicalDer.toString("base64"),
      id: createHash("sha256").update(canonicalDer).digest("hex"),
    };
  } catch {
    return fail();
  }
}
function signature(v: unknown): Buffer {
  const encoded = text(v, B64);
  const x = Buffer.from(encoded, "base64");
  if (x.length !== 64 || x.toString("base64") !== encoded) fail();
  return x;
}

function plainJson(
  value: unknown,
  depth = 0,
  budget: { remaining: number } = { remaining: 25_000 },
): unknown {
  budget.remaining -= 1;
  if (budget.remaining < 0 || depth > 8) fail();
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "string" && value.length <= 4096)
  )
    return value;
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    !Object.is(value, -0) &&
    value >= 0 &&
    value <= 1_000_000
  )
    return value;
  if (Array.isArray(value))
    return list(value, 1024).map((item) => plainJson(item, depth + 1, budget));
  if (
    !value ||
    typeof value !== "object" ||
    types.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length
  )
    fail();
  const keys = Reflect.ownKeys(value);
  if (
    keys.length > 64 ||
    keys.some((key) => typeof key !== "string" || key.length > 128)
  )
    fail();
  const normalized: Record<string, unknown> = {};
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      fail();
    normalized[key] = plainJson(descriptor.value, depth + 1, budget);
  }
  return normalized;
}

export function verifyCleanRoomAttestationAuthorityGateV1(
  input: unknown,
  outOfBandTrustAnchor: unknown,
  output: unknown,
): Readonly<{ total: 452; syntheticAuthorityContractSatisfied: number }> {
  try {
    const root = object(input, [
      "route",
      "evidenceRows",
      "authorityRegistry",
      "attestationRows",
    ]);
    const route =
      root.route === "exact" || root.route === "synthetic"
        ? root.route
        : fail();
    const evidence = list(root.evidenceRows, 452).map((v) => {
      const x = object(v, ["formulaId", "rowProjectionHash"]);
      return {
        formulaId: text(x.formulaId, UUID, 36),
        rowProjectionHash: text(x.rowProjectionHash, SHA, 64),
      };
    });
    if (
      evidence.length !== 452 ||
      new Set(evidence.map((x) => x.formulaId)).size !== 452
    )
      fail();
    const binding = digest(evidence);
    if (route === "exact" && binding !== FROZEN) fail();
    if (route === "synthetic" && binding === FROZEN) fail();
    const anchor =
      outOfBandTrustAnchor === null
        ? null
        : object(outOfBandTrustAnchor, [
            "ed25519RootSpkiBase64",
            "trustedRegistryGeneration",
          ]);
    const trusted = anchor === null ? null : key(anchor.ed25519RootSpkiBase64);
    const trustedGeneration =
      anchor === null ? null : num(anchor.trustedRegistryGeneration);
    let principals = new Map<
      string,
      { role: string; keyId: string; encoded: string }
    >();
    let generation: number | null = null;
    if (root.authorityRegistry !== null) {
      if (!trusted) fail();
      const reg = object(root.authorityRegistry, [
        "registrySchemaVersion",
        "registryGeneration",
        "exactSetBindingSha256",
        "rootEd25519SpkiSha256",
        "principals",
        "rootSignatureBase64",
      ]);
      if (
        reg.registrySchemaVersion !== 1 ||
        text(reg.exactSetBindingSha256, SHA, 64) !== binding ||
        text(reg.rootEd25519SpkiSha256, SHA, 64) !== trusted.id
      )
        fail();
      generation = num(reg.registryGeneration);
      if (generation !== trustedGeneration) fail();
      const ps = list(reg.principals, 5).map((v) => {
        const p = object(v, [
          "principalId",
          "role",
          "keyId",
          "publicKeySpkiBase64",
        ]);
        const k = key(p.publicKeySpkiBase64);
        const id = text(p.principalId, /^[a-z0-9][a-z0-9._:-]{0,127}$/);
        const role = text(
          p.role,
          /^(contaminated-candidate-author|projection-controller|contaminated-reviewer|clean-reviewer|admission-verifier)$/,
        );
        const keyId = text(p.keyId, SHA, 64);
        if (keyId !== k.id) fail();
        return { id, role, keyId, encoded: k.encoded };
      });
      if (
        ps.length !== 5 ||
        new Set(ps.map((p) => p.id)).size !== 5 ||
        new Set(ps.map((p) => p.role)).size !== 5 ||
        new Set(ps.map((p) => p.keyId)).size !== 5 ||
        !ENROLLED_ROLES.every((role) => ps.some((p) => p.role === role))
      )
        fail();
      const payload = {
        domain: "fractalpark/clean-room-attestation-authority/registry/v1",
        registryGeneration: generation,
        exactSetBindingSha256: binding,
        rootEd25519SpkiSha256: trusted.id,
        principals: ps.map((p) => ({
          principalId: p.id,
          role: p.role,
          keyId: p.keyId,
          publicKeySpkiBase64: p.encoded,
        })),
      };
      if (
        !verify(
          null,
          Buffer.from(canonical(payload)),
          createPublicKey({
            key: Buffer.from(trusted.encoded, "base64"),
            format: "der",
            type: "spki",
          }),
          signature(reg.rootSignatureBase64),
        )
      )
        fail();
      principals = new Map(ps.map((p) => [p.id, p]));
    }
    const supplied = list(root.attestationRows, 452).map((v) => {
      const r = object(v, [
        "formulaId",
        "packageGeneration",
        "reviewedBehaviorObjectSha256",
        "statements",
      ]);
      return {
        formulaId: text(r.formulaId, UUID, 36),
        packageGeneration: num(r.packageGeneration),
        reviewedBehaviorObjectSha256: text(
          r.reviewedBehaviorObjectSha256,
          SHA,
          64,
        ),
        statements: list(r.statements, 4).map((z) => {
          const parsed = object(z, [
            "formulaId",
            "packageGeneration",
            "reviewedBehaviorObjectSha256",
            "exactSetBindingSha256",
            "registryGeneration",
            "principalId",
            "role",
            "keyId",
            "purpose",
            "allowedInputSurface",
            "signatureBase64",
          ]);
          const signatureBase64 = text(parsed.signatureBase64, B64, 1024);
          signature(signatureBase64);
          return {
            formulaId: text(parsed.formulaId, UUID, 36),
            packageGeneration: num(parsed.packageGeneration),
            reviewedBehaviorObjectSha256: text(
              parsed.reviewedBehaviorObjectSha256,
              SHA,
              64,
            ),
            exactSetBindingSha256: text(parsed.exactSetBindingSha256, SHA, 64),
            registryGeneration: num(parsed.registryGeneration),
            principalId: text(
              parsed.principalId,
              /^[a-z0-9][a-z0-9._:-]{0,127}$/,
              128,
            ),
            role: text(
              parsed.role,
              /^(contaminated-candidate-author|projection-controller|contaminated-reviewer|clean-reviewer|admission-verifier)$/,
              40,
            ),
            keyId: text(parsed.keyId, SHA, 64),
            purpose: text(
              parsed.purpose,
              /^(candidate-author|content-digest-projection|contaminated-review|clean-review)$/,
              32,
            ),
            allowedInputSurface: text(
              parsed.allowedInputSurface,
              /^[a-z][a-z-]{0,127}$/,
              128,
            ),
            signatureBase64,
          };
        }),
      };
    });
    if (
      new Set(supplied.map((r) => r.formulaId)).size !== supplied.length ||
      supplied.some((r) => !evidence.some((e) => e.formulaId === r.formulaId))
    )
      fail();
    const submitted = new Map(supplied.map((r) => [r.formulaId, r]));
    const rows = evidence.map((e) => {
      const r = submitted.get(e.formulaId);
      let valid = !!r && generation !== null && r.statements.length === 4;
      if (r && valid) {
        const purposes = new Set<string>();
        for (const s of r.statements) {
          const purpose = text(
            s.purpose,
            /^(candidate-author|content-digest-projection|contaminated-review|clean-review)$/,
          );
          purposes.add(purpose);
          const p = principals.get(
            text(s.principalId, /^[a-z0-9][a-z0-9._:-]{0,127}$/),
          );
          if (
            !p ||
            p.role !== ROLES[purpose] ||
            p.keyId !== text(s.keyId, SHA, 64) ||
            text(s.role, /^[a-z-]+$/) !== ROLES[purpose] ||
            text(s.allowedInputSurface, /^[a-z-]+$/) !== SURFACES[purpose] ||
            text(s.formulaId, UUID, 36) !== r.formulaId ||
            num(s.packageGeneration) !== r.packageGeneration ||
            text(s.reviewedBehaviorObjectSha256, SHA, 64) !==
              r.reviewedBehaviorObjectSha256 ||
            text(s.exactSetBindingSha256, SHA, 64) !== binding ||
            num(s.registryGeneration) !== generation
          ) {
            valid = false;
            break;
          }
          const payload = {
            domain: "fractalpark/clean-room-attestation-authority/statement/v1",
            formulaId: r.formulaId,
            packageGeneration: r.packageGeneration,
            reviewedBehaviorObjectSha256: r.reviewedBehaviorObjectSha256,
            exactSetBindingSha256: binding,
            registryGeneration: generation,
            principalId: text(s.principalId, /^[a-z0-9][a-z0-9._:-]{0,127}$/),
            role: p.role,
            keyId: p.keyId,
            purpose,
            allowedInputSurface: SURFACES[purpose],
          };
          if (
            !verify(
              null,
              Buffer.from(canonical(payload)),
              createPublicKey({
                key: Buffer.from(p.encoded, "base64"),
                format: "der",
                type: "spki",
              }),
              signature(s.signatureBase64),
            )
          ) {
            valid = false;
            break;
          }
        }
        valid = valid && purposes.size === 4;
      }
      return {
        formulaId: e.formulaId,
        evidenceRowProjectionHash: e.rowProjectionHash,
        packageGeneration: r?.packageGeneration ?? null,
        reviewedBehaviorObjectSha256: r?.reviewedBehaviorObjectSha256 ?? null,
        syntheticAuthorityContractSatisfied: route === "synthetic" && valid,
        principalCredentialBindingStatus: valid
          ? "cryptographically-bound-to-enrolled-principals"
          : "unverified",
        behaviorPackageContentAttestationStatus: "bytes-not-read-unverified",
        contentAttested: false,
        candidateApproved: false,
        behaviorPackageAdmitted: false,
        implementationAuthorized: false,
        blockReasons: valid
          ? [
              "reviewer-identity-not-independently-attested",
              "content-bytes-not-read",
              "approval-admission-implementation-not-in-scope",
            ]
          : [
              "attestation-authority-contract-unsatisfied",
              "reviewer-identity-not-independently-attested",
              "content-bytes-not-read",
              "approval-admission-implementation-not-in-scope",
            ],
      };
    });
    const satisfied = rows.filter(
      (r) => r.syntheticAuthorityContractSatisfied,
    ).length;
    const base = {
      schema:
        "fractalpark-formula-library-clean-room-attestation-authority-gate/v1",
      controllerVersion: "clean-room-attestation-authority-gate/1",
      deterministic: true,
      route,
      exactSetBindingSha256: binding,
      trustAnchorStatus:
        anchor === null
          ? "unconfigured"
          : generation === null
            ? "registry-missing"
            : "configured",
      registryStatus: generation === null ? "unverified" : "root-signed",
      rows,
      summary: {
        total: 452,
        submittedAttestationRows: supplied.length,
        cryptographicallyBoundToEnrolledPrincipals: rows.filter(
          (r) =>
            r.principalCredentialBindingStatus ===
            "cryptographically-bound-to-enrolled-principals",
        ).length,
        contentAttested: 0,
        syntheticAuthorityContractSatisfied: satisfied,
        candidateApprovals: 0,
        candidateAdmissions: 0,
        behaviorPackageAdmissions: 0,
        behaviorPackagesBlocked: 452,
        implementationAuthorizations: 0,
        publicCandidateAssemblies: 0,
        publicPromotions: 0,
        publicAssetsWritten: 0,
      },
      candidateAdmissions: 0,
      publicCandidateAssemblyAllowed: false,
      publicPromotionAllowed: false,
      publicAssetsWritten: 0,
    };
    const normalizedOutput = plainJson(output);
    const received = object(normalizedOutput, [
      ...Object.keys(base),
      "outputSha256",
    ]);
    if (
      text(received.outputSha256, SHA, 64) !== digest(base) ||
      canonical(normalizedOutput) !==
        canonical({ ...base, outputSha256: digest(base) })
    )
      fail();
    return Object.freeze({
      total: 452 as const,
      syntheticAuthorityContractSatisfied: satisfied,
    });
  } catch {
    fail();
  }
}
