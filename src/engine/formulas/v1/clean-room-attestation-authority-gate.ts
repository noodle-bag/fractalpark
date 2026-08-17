import { createHash, createPublicKey, verify } from "node:crypto";
import { types } from "node:util";

/**
 * A deliberately non-operational authority contract. It proves only that
 * detached credential signatures are bound to operator-enrolled principal
 * labels. It neither independently authenticates the reviewer identity behind
 * a principal label nor attests behavior-package content bytes, and cannot
 * approve, admit, implement, promote, or write.
 */
const ERROR = "clean-room-attestation-authority-invalid";
const FROZEN_EXACT_SET_BINDING_SHA256 =
  "cc2fdecb4dd210ebb0d55d212ea973d65fb2c443b687cd8f137c8b98a6402243";
const SHA256 = /^[a-f0-9]{64}$/;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const ROLES = [
  "contaminated-candidate-author",
  "projection-controller",
  "contaminated-reviewer",
  "clean-reviewer",
  "admission-verifier",
] as const;
const PURPOSES = [
  "candidate-author",
  "content-digest-projection",
  "contaminated-review",
  "clean-review",
] as const;
const SURFACE: Record<(typeof PURPOSES)[number], string> = {
  "candidate-author": "restricted-evidence-and-private-behavior-content",
  "content-digest-projection":
    "private-behavior-content-and-frozen-clean-envelope",
  "contaminated-review": "restricted-evidence-and-frozen-clean-envelope",
  "clean-review": "frozen-clean-envelope-only",
};
const ROLE_FOR_PURPOSE: Record<
  (typeof PURPOSES)[number],
  (typeof ROLES)[number]
> = {
  "candidate-author": "contaminated-candidate-author",
  "content-digest-projection": "projection-controller",
  "contaminated-review": "contaminated-reviewer",
  "clean-review": "clean-reviewer",
};

/**
 * This value is operator configuration, never a field copied from an
 * untrusted submission. It pins both the root and the one registry generation
 * permitted for this evaluation, preventing a valid old registry replay.
 */
type OutOfBandTrustAnchor = Readonly<{
  ed25519RootSpkiBase64: string;
  trustedRegistryGeneration: number;
}>;

type UnknownRecord = Record<string, unknown>;
type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [key: string]: Json };

function fail(): never {
  throw new Error(ERROR);
}
function hash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function freeze<T>(value: T): T {
  if (Array.isArray(value)) value.forEach(freeze);
  else if (value !== null && typeof value === "object")
    Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
function canonical(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  )
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const item = value as Record<string, unknown>;
  return `{${Object.keys(item)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(item[key])}`)
    .join(",")}}`;
}
function record(
  value: unknown,
  keys: readonly string[],
): Readonly<UnknownRecord> {
  try {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      types.isProxy(value) ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      Object.getOwnPropertySymbols(value).length
    )
      fail();
    const actual = Reflect.ownKeys(value);
    if (
      actual.length !== keys.length ||
      actual.some((key) => typeof key !== "string") ||
      [...(actual as string[])]
        .sort()
        .some((key, i) => key !== [...keys].sort()[i])
    )
      fail();
    const result: UnknownRecord = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
        fail();
      result[key] = descriptor.value;
    }
    return Object.freeze(result);
  } catch (e) {
    if (e instanceof Error && e.message === ERROR) throw e;
    return fail();
  }
}
function array(value: unknown, max: number): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    types.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length ||
    value.length > max
  )
    fail();
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== value.length + 1 ||
    keys.some((key) => typeof key !== "string") ||
    !keys.includes("length")
  )
    fail();
  return Object.freeze(
    value.map((item, index) => {
      const d = Object.getOwnPropertyDescriptor(value, String(index));
      if (!d || !("value" in d) || !d.enumerable) fail();
      return d.value;
    }),
  );
}
function string(value: unknown, pattern: RegExp, max = 1024): string {
  if (typeof value !== "string" || value.length > max || !pattern.test(value))
    fail();
  return value;
}
function integer(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    value < 1 ||
    value > 1_000_000
  )
    fail();
  return value;
}
function spki(value: unknown): { encoded: string; keyId: string } {
  const encoded = string(value, B64, 2048);
  try {
    const suppliedDer = Buffer.from(encoded, "base64");
    if (suppliedDer.toString("base64") !== encoded) fail();
    const key = createPublicKey({
      key: suppliedDer,
      format: "der",
      type: "spki",
    });
    if (key.asymmetricKeyType !== "ed25519") fail();
    const canonicalDer = key.export({ format: "der", type: "spki" });
    if (!suppliedDer.equals(canonicalDer)) fail();
    return {
      encoded: canonicalDer.toString("base64"),
      keyId: createHash("sha256").update(canonicalDer).digest("hex"),
    };
  } catch {
    return fail();
  }
}
function signature(value: unknown): Buffer {
  const encoded = string(value, B64, 1024);
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length !== 64 || bytes.toString("base64") !== encoded) fail();
  return bytes;
}

type Evidence = Readonly<{ formulaId: string; rowProjectionHash: string }>;
type Principal = Readonly<{
  principalId: string;
  role: (typeof ROLES)[number];
  keyId: string;
  publicKeySpkiBase64: string;
}>;
type Registry = Readonly<{
  registryGeneration: number;
  exactSetBindingSha256: string;
  rootEd25519SpkiSha256: string;
  principals: readonly Principal[];
}>;
type Statement = Readonly<{
  formulaId: string;
  packageGeneration: number;
  reviewedBehaviorObjectSha256: string;
  exactSetBindingSha256: string;
  registryGeneration: number;
  principalId: string;
  role: string;
  keyId: string;
  purpose: (typeof PURPOSES)[number];
  allowedInputSurface: string;
  signatureBase64: string;
}>;

function evidence(value: unknown): Evidence {
  const x = record(value, ["formulaId", "rowProjectionHash"]);
  return Object.freeze({
    formulaId: string(x.formulaId, UUID, 36),
    rowProjectionHash: string(x.rowProjectionHash, SHA256, 64),
  });
}
function principal(value: unknown): Principal {
  const x = record(value, [
    "principalId",
    "role",
    "keyId",
    "publicKeySpkiBase64",
  ]);
  const key = spki(x.publicKeySpkiBase64);
  const role = string(
    x.role,
    /^(contaminated-candidate-author|projection-controller|contaminated-reviewer|clean-reviewer|admission-verifier)$/,
    40,
  ) as Principal["role"];
  const keyId = string(x.keyId, SHA256, 64);
  if (keyId !== key.keyId) fail();
  return Object.freeze({
    principalId: string(x.principalId, ID),
    role,
    keyId,
    publicKeySpkiBase64: key.encoded,
  });
}
function trustAnchor(value: unknown): OutOfBandTrustAnchor | null {
  if (value === null) return null;
  const x = record(value, [
    "ed25519RootSpkiBase64",
    "trustedRegistryGeneration",
  ]);
  return freeze({
    ed25519RootSpkiBase64: spki(x.ed25519RootSpkiBase64).encoded,
    trustedRegistryGeneration: integer(x.trustedRegistryGeneration),
  });
}
function registry(
  value: unknown,
  anchor: OutOfBandTrustAnchor | null,
  binding: string,
): Registry | null {
  if (value === null) return null;
  const x = record(value, [
    "registrySchemaVersion",
    "registryGeneration",
    "exactSetBindingSha256",
    "rootEd25519SpkiSha256",
    "principals",
    "rootSignatureBase64",
  ]);
  if (x.registrySchemaVersion !== 1 || anchor === null) fail();
  const rootFingerprint = string(x.rootEd25519SpkiSha256, SHA256, 64);
  if (
    rootFingerprint !== spki(anchor.ed25519RootSpkiBase64).keyId ||
    string(x.exactSetBindingSha256, SHA256, 64) !== binding
  )
    fail();
  const principals = array(x.principals, 5).map(principal);
  if (
    principals.length !== 5 ||
    new Set(principals.map((p) => p.principalId)).size !== 5 ||
    new Set(principals.map((p) => p.role)).size !== 5 ||
    new Set(principals.map((p) => p.keyId)).size !== 5 ||
    !ROLES.every((role) => principals.some((p) => p.role === role))
  )
    fail();
  const generation = integer(x.registryGeneration);
  if (generation !== anchor.trustedRegistryGeneration) fail();
  return Object.freeze({
    registryGeneration: generation,
    exactSetBindingSha256: binding,
    rootEd25519SpkiSha256: rootFingerprint,
    principals: Object.freeze(principals),
  });
}

function validateRegistrySignature(
  raw: Readonly<UnknownRecord>,
  anchor: OutOfBandTrustAnchor | null,
  parsed: Registry | null,
): void {
  if (!parsed || anchor === null) return;
  const root = spki(anchor.ed25519RootSpkiBase64);
  if (root.keyId !== parsed.rootEd25519SpkiSha256) fail();
  const payload = {
    domain: "fractalpark/clean-room-attestation-authority/registry/v1",
    registryGeneration: parsed.registryGeneration,
    exactSetBindingSha256: parsed.exactSetBindingSha256,
    rootEd25519SpkiSha256: parsed.rootEd25519SpkiSha256,
    principals: parsed.principals.map((p) => ({
      principalId: p.principalId,
      role: p.role,
      keyId: p.keyId,
      publicKeySpkiBase64: p.publicKeySpkiBase64,
    })),
  };
  try {
    if (
      !verify(
        null,
        Buffer.from(canonical(payload)),
        createPublicKey({
          key: Buffer.from(root.encoded, "base64"),
          format: "der",
          type: "spki",
        }),
        signature(raw.rootSignatureBase64),
      )
    )
      fail();
  } catch {
    fail();
  }
}
function statement(value: unknown): Statement {
  const x = record(value, [
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
  const purpose = string(
    x.purpose,
    /^(candidate-author|content-digest-projection|contaminated-review|clean-review)$/,
    32,
  ) as Statement["purpose"];
  return Object.freeze({
    formulaId: string(x.formulaId, UUID, 36),
    packageGeneration: integer(x.packageGeneration),
    reviewedBehaviorObjectSha256: string(
      x.reviewedBehaviorObjectSha256,
      SHA256,
      64,
    ),
    exactSetBindingSha256: string(x.exactSetBindingSha256, SHA256, 64),
    registryGeneration: integer(x.registryGeneration),
    principalId: string(x.principalId, ID),
    role: string(
      x.role,
      /^(contaminated-candidate-author|projection-controller|contaminated-reviewer|clean-reviewer|admission-verifier)$/,
      40,
    ),
    keyId: string(x.keyId, SHA256, 64),
    purpose,
    allowedInputSurface: string(
      x.allowedInputSurface,
      /^[a-z][a-z-]{0,127}$/,
      128,
    ),
    signatureBase64: (() => {
      const encoded = string(x.signatureBase64, B64, 1024);
      signature(encoded);
      return encoded;
    })(),
  });
}
function statementValid(
  item: Statement,
  row: {
    formulaId: string;
    packageGeneration: number;
    reviewedBehaviorObjectSha256: string;
  },
  binding: string,
  reg: Registry | null,
): boolean {
  if (
    !reg ||
    item.formulaId !== row.formulaId ||
    item.packageGeneration !== row.packageGeneration ||
    item.reviewedBehaviorObjectSha256 !== row.reviewedBehaviorObjectSha256 ||
    item.exactSetBindingSha256 !== binding ||
    item.registryGeneration !== reg.registryGeneration ||
    item.role !== ROLE_FOR_PURPOSE[item.purpose] ||
    item.allowedInputSurface !== SURFACE[item.purpose]
  )
    return false;
  const principal = reg.principals.find(
    (p) =>
      p.principalId === item.principalId &&
      p.role === item.role &&
      p.keyId === item.keyId,
  );
  if (!principal) return false;
  const payload = {
    domain: "fractalpark/clean-room-attestation-authority/statement/v1",
    formulaId: item.formulaId,
    packageGeneration: item.packageGeneration,
    reviewedBehaviorObjectSha256: item.reviewedBehaviorObjectSha256,
    exactSetBindingSha256: item.exactSetBindingSha256,
    registryGeneration: item.registryGeneration,
    principalId: item.principalId,
    role: item.role,
    keyId: item.keyId,
    purpose: item.purpose,
    allowedInputSurface: item.allowedInputSurface,
  };
  try {
    return verify(
      null,
      Buffer.from(canonical(payload)),
      createPublicKey({
        key: Buffer.from(principal.publicKeySpkiBase64, "base64"),
        format: "der",
        type: "spki",
      }),
      signature(item.signatureBase64),
    );
  } catch {
    return false;
  }
}

export type CleanRoomAttestationAuthorityResultV1 = Readonly<
  Record<string, Json>
>;
export function evaluateCleanRoomAttestationAuthorityGateV1(
  input: unknown,
  outOfBandTrustAnchor: unknown,
): CleanRoomAttestationAuthorityResultV1 {
  const root = record(input, [
    "route",
    "evidenceRows",
    "authorityRegistry",
    "attestationRows",
  ]);
  const route =
    root.route === "exact" || root.route === "synthetic" ? root.route : fail();
  const rows = array(root.evidenceRows, 452).map(evidence);
  if (rows.length !== 452 || new Set(rows.map((r) => r.formulaId)).size !== 452)
    fail();
  const binding = hash(rows);
  if (route === "exact" && binding !== FROZEN_EXACT_SET_BINDING_SHA256) fail();
  if (route === "synthetic" && binding === FROZEN_EXACT_SET_BINDING_SHA256)
    fail();
  const anchor = trustAnchor(outOfBandTrustAnchor);
  const rawRegistry =
    root.authorityRegistry === null
      ? null
      : record(root.authorityRegistry, [
          "registrySchemaVersion",
          "registryGeneration",
          "exactSetBindingSha256",
          "rootEd25519SpkiSha256",
          "principals",
          "rootSignatureBase64",
        ]);
  const reg = registry(root.authorityRegistry, anchor, binding);
  if (rawRegistry) validateRegistrySignature(rawRegistry, anchor, reg);
  const submitted = array(root.attestationRows, 452).map((value) => {
    const x = record(value, [
      "formulaId",
      "packageGeneration",
      "reviewedBehaviorObjectSha256",
      "statements",
    ]);
    return {
      formulaId: string(x.formulaId, UUID, 36),
      packageGeneration: integer(x.packageGeneration),
      reviewedBehaviorObjectSha256: string(
        x.reviewedBehaviorObjectSha256,
        SHA256,
        64,
      ),
      statements: array(x.statements, 4).map(statement),
    };
  });
  if (
    new Set(submitted.map((r) => r.formulaId)).size !== submitted.length ||
    submitted.some((r) => !rows.some((e) => e.formulaId === r.formulaId))
  )
    fail();
  const byId = new Map(submitted.map((r) => [r.formulaId, r] as const));
  const outputRows = rows.map((e) => {
    const row = byId.get(e.formulaId);
    const valid =
      row !== undefined &&
      reg !== null &&
      row.statements.length === 4 &&
      new Set(row.statements.map((s) => s.purpose)).size === 4 &&
      PURPOSES.every((purpose) =>
        row.statements.some(
          (s) => s.purpose === purpose && statementValid(s, row, binding, reg),
        ),
      );
    return freeze({
      formulaId: e.formulaId,
      evidenceRowProjectionHash: e.rowProjectionHash,
      packageGeneration: row?.packageGeneration ?? null,
      reviewedBehaviorObjectSha256: row?.reviewedBehaviorObjectSha256 ?? null,
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
    });
  });
  const base = freeze({
    schema:
      "fractalpark-formula-library-clean-room-attestation-authority-gate/v1",
    controllerVersion: "clean-room-attestation-authority-gate/1",
    deterministic: true,
    route,
    exactSetBindingSha256: binding,
    trustAnchorStatus:
      anchor === null
        ? "unconfigured"
        : reg === null
          ? "registry-missing"
          : "configured",
    registryStatus: reg === null ? "unverified" : "root-signed",
    rows: outputRows,
    summary: {
      total: 452,
      submittedAttestationRows: submitted.length,
      cryptographicallyBoundToEnrolledPrincipals: outputRows.filter(
        (r) =>
          r.principalCredentialBindingStatus ===
          "cryptographically-bound-to-enrolled-principals",
      ).length,
      contentAttested: 0,
      syntheticAuthorityContractSatisfied: outputRows.filter(
        (r) => r.syntheticAuthorityContractSatisfied,
      ).length,
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
  });
  return freeze({
    ...base,
    outputSha256: hash(base),
  }) as CleanRoomAttestationAuthorityResultV1;
}
