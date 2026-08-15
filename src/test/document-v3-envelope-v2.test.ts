import { describe, expect, it, vi } from "vitest";

import documentV2Fixture from "./fixtures/documents/document-v2.json";
import envelopeV1Fixture from "./fixtures/documents/envelope-v1.json";
import { FRACTAL_DOCUMENT_ENVELOPE_VERSION } from "@/engine/document-envelope";
import {
  ENVELOPE_V2_MAX_EMBEDDED_BYTES,
  readPortableFractalDocumentEnvelope,
} from "@/engine/document-envelope-v2";
import { FRACTAL_DOCUMENT_SCHEMA_VERSION } from "@/engine/document";
import {
  FORMULA_SNAPSHOT_V1_EXECUTABLE_SOURCE_BYTES,
  FORMULA_SNAPSHOT_V1_PORTABLE_SOURCE_BYTES,
  readFractalDocumentV3,
  type FormulaSnapshotV1,
} from "@/engine/document-v3";
import { hashFrmLikeV1, parseFrmLikeV1 } from "@/engine/frm/v1";
import type { FormulaIdV1, FormulaRevisionV1 } from "@/engine/formulas/v1";

const SOURCE = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Portable {
  parameters:
    power: real = 2 domain [1, 16] classic p1
    transform: function = sin classic fn1
  init:
    z = pixel
  loop:
    z = transform(z ^ power) + c
  bailout:
    |z| <= 4
}`;
const FORMULA_ID = "11111111-1111-4111-8111-111111111111" as FormulaIdV1;

function parsed() {
  const result = parseFrmLikeV1(SOURCE);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

async function snapshot(
  overrides: Partial<Record<keyof FormulaSnapshotV1, unknown>> = {},
): Promise<Record<string, unknown>> {
  const hashes = await hashFrmLikeV1(SOURCE, parsed().ir);
  return {
    schemaVersion: 1,
    formulaId: FORMULA_ID,
    scope: "mine",
    source: SOURCE,
    sourceRevision: hashes.sourceRevision as FormulaRevisionV1,
    semanticHash: hashes.semanticHash as FormulaRevisionV1,
    languageVersion: "frm-like/1",
    stdlibVersion: 1,
    numericProfile: "standard32",
    parameterSchema: [
      {
        name: "power",
        type: "real",
        default: 2,
        hardDomain: [1, 16],
        classicBinding: "p1",
      },
      {
        name: "transform",
        type: "function",
        default: "sin",
        classicBinding: "fn1",
      },
    ],
    resolvedParameters: { power: 2, transform: "sin" },
    mode: "parameter-plane",
    iterations: 200,
    termination: {
      predicateMeaning: "continue-iteration",
      nonFinite: "terminate-with-event",
      maximumIterations: "profile-resolved",
    },
    channels: [],
    ...overrides,
  };
}

async function documentV3(
  snapshotOverrides: Partial<Record<keyof FormulaSnapshotV1, unknown>> = {},
): Promise<Record<string, unknown>> {
  return {
    ...structuredClone(documentV2Fixture),
    schemaVersion: 3,
    formula: {
      ...structuredClone(documentV2Fixture.formula),
      formulaId: FORMULA_ID,
    },
    formulaSnapshot: await snapshot(snapshotOverrides),
  };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function envelopeV2() {
  const bytes = new TextEncoder().encode("portable-evidence");
  return {
    envelopeVersion: 2,
    document: await documentV3(),
    assets: [
      {
        kind: "preview",
        mediaType: "text/plain",
        sha256: await sha256(bytes),
        bytesBase64: btoa("portable-evidence"),
        sourceUrl: "https://example.test/evidence.txt",
      },
    ],
  };
}

describe("Document v3 and Envelope v2 reader-first contracts", () => {
  it("keeps released writers pinned to Document v2 and Envelope v1", () => {
    expect(FRACTAL_DOCUMENT_SCHEMA_VERSION).toBe(2);
    expect(FRACTAL_DOCUMENT_ENVELOPE_VERSION).toBe(1);
  });

  it("dual-reads legacy Envelope v1 through the released reader", async () => {
    const result = await readPortableFractalDocumentEnvelope(envelopeV1Fixture);
    expect(result.mode).toBe("editable");
  });

  it("rebuilds executable IR offline from the flat self-contained snapshot", async () => {
    const input = await envelopeV2();
    const result = await readPortableFractalDocumentEnvelope(input);
    expect(result).toMatchObject({ mode: "readable-v2", writer: "disabled" });
    if (result.mode !== "readable-v2")
      throw new Error(`unexpected:${result.mode}`);
    expect(result.snapshot).not.toHaveProperty("definition");
    expect(result.snapshot).not.toHaveProperty("profile");
    expect(result.ir.formulaName).toBe("Portable");
    expect(result.envelope.assets[0]).toEqual(input.assets[0]);
    expect(Object.isFrozen(result.envelope.document)).toBe(true);
    expect(Object.isFrozen(result.envelope.assets)).toBe(true);
  });

  it("opens tampered source revisions and content digests read-only", async () => {
    const sourceTampered = await documentV3({ sourceRevision: "a".repeat(64) });
    await expect(readFractalDocumentV3(sourceTampered)).resolves.toMatchObject({
      mode: "readonly-v3",
      reason: "snapshot-safety-invalid",
    });

    const assetTampered = await envelopeV2();
    assetTampered.assets[0].bytesBase64 = btoa("tampered");
    await expect(
      readPortableFractalDocumentEnvelope(assetTampered),
    ).resolves.toMatchObject({
      mode: "readonly-v2",
      reason: "asset-hash-mismatch",
    });
  });

  it("preserves unsupported NumericProfiles and future versions without execution", async () => {
    await expect(
      readFractalDocumentV3(await documentV3({ numericProfile: "extended64" })),
    ).resolves.toMatchObject({
      mode: "readonly-v3",
      reason: "unsupported-numeric-profile",
    });

    const futureDocument = await documentV3();
    futureDocument.schemaVersion = 4;
    await expect(readFractalDocumentV3(futureDocument)).resolves.toMatchObject({
      mode: "readonly-v3",
      reason: "future-document-version",
    });

    await expect(
      readPortableFractalDocumentEnvelope({
        envelopeVersion: 3,
        document: futureDocument,
        assets: [],
      }),
    ).resolves.toMatchObject({
      mode: "readonly-future-envelope",
      sourceVersion: 3,
    });
  });

  it("preserves 65,537-byte legacy source but rejects execution above 65,536 bytes", async () => {
    expect(FORMULA_SNAPSHOT_V1_EXECUTABLE_SOURCE_BYTES).toBe(65_536);
    expect(FORMULA_SNAPSHOT_V1_PORTABLE_SOURCE_BYTES).toBe(262_144);
    const legacy = await documentV3({
      source: "x".repeat(65_537),
      sourceRevision: "a".repeat(64),
      semanticHash: "b".repeat(64),
    });
    await expect(readFractalDocumentV3(legacy)).resolves.toMatchObject({
      mode: "readonly-v3",
      reason: "legacy-source-over-current-limit",
    });

    const overCeiling = await documentV3({
      source: "x".repeat(262_145),
      sourceRevision: "a".repeat(64),
      semanticHash: "b".repeat(64),
    });
    await expect(readFractalDocumentV3(overCeiling)).resolves.toMatchObject({
      mode: "readonly-v3",
      reason: "source-exceeds-portable-ceiling",
    });
  });

  it("fails identity/state drift and hostile accessor inputs closed", async () => {
    const mismatch = await documentV3({
      formulaId: "22222222-2222-4222-8222-222222222222",
    });
    await expect(readFractalDocumentV3(mismatch)).resolves.toMatchObject({
      mode: "readonly-v3",
      reason: "document-snapshot-identity-mismatch",
    });

    const parameterDrift = await documentV3();
    parameterDrift.formula = {
      ...(parameterDrift.formula as Record<string, unknown>),
      params: { formula: { power: 3, transform: "sin" } },
    };
    await expect(readFractalDocumentV3(parameterDrift)).resolves.toMatchObject({
      mode: "readonly-v3",
      reason: "durable-state-invalid",
    });

    const powerDrift = await documentV3();
    (powerDrift.formula as Record<string, unknown>).power = 3;
    await expect(readFractalDocumentV3(powerDrift)).resolves.toMatchObject({
      mode: "readonly-v3",
      reason: "document-snapshot-state-mismatch",
    });

    const malformedDurable = await documentV3();
    malformedDurable.coloring = {};
    await expect(
      readFractalDocumentV3(malformedDurable),
    ).resolves.toMatchObject({
      mode: "readonly-v3",
      reason: "durable-state-invalid",
    });

    const malformedSchema = await documentV3({ parameterSchema: [null] });
    await expect(readFractalDocumentV3(malformedSchema)).resolves.toMatchObject(
      {
        mode: "readonly-v3",
        reason: "snapshot-safety-invalid",
      },
    );

    const hostile = Object.defineProperty({}, "schemaVersion", {
      enumerable: true,
      get() {
        throw new Error("attacker getter");
      },
    });
    await expect(readFractalDocumentV3(hostile)).resolves.toMatchObject({
      mode: "invalid",
    });
    await expect(
      readPortableFractalDocumentEnvelope(hostile),
    ).resolves.toMatchObject({
      mode: "invalid",
    });
  });

  it("enforces canonical embedded bytes and the aggregate asset budget", async () => {
    const malformed = await envelopeV2();
    malformed.assets[0].bytesBase64 = "YR==";
    await expect(
      readPortableFractalDocumentEnvelope(malformed),
    ).resolves.toMatchObject({
      mode: "readonly-v2",
      reason: "invalid-assets",
    });

    const oversized = await envelopeV2();
    const bytes = new Uint8Array(ENVELOPE_V2_MAX_EMBEDDED_BYTES + 1);
    oversized.assets[0] = {
      kind: "preview",
      mediaType: "application/octet-stream",
      sha256: await sha256(bytes),
      bytesBase64: "AAAA".repeat(Math.ceil(bytes.length / 3)),
      sourceUrl: "https://example.test/large.bin",
    };
    const atobSpy = vi.spyOn(globalThis, "atob");
    atobSpy.mockClear();
    await expect(
      readPortableFractalDocumentEnvelope(oversized),
    ).resolves.toMatchObject({
      mode: "readonly-v2",
      reason: "asset-budget-exceeded",
    });
    expect(atobSpy).not.toHaveBeenCalled();
    atobSpy.mockRestore();
  });
});
