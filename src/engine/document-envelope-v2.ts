import {
  FRACTAL_DOCUMENT_ENVELOPE_VERSION,
  readFractalDocumentEnvelope,
  type EnvelopeReadResult,
} from "./document-envelope";
import {
  clonePortableJsonV1,
  readFractalDocumentV3,
  type DocumentV3ReadonlyReason,
  type FractalDocumentV3,
  type FormulaSnapshotV1,
} from "./document-v3";
import type { FrmLikeV1Ir } from "./frm/v1";

export const FRACTAL_DOCUMENT_ENVELOPE_V2_READER_VERSION = 2 as const;
export const ENVELOPE_V2_MAX_ASSETS = 32;
export const ENVELOPE_V2_MAX_EMBEDDED_BYTES = 1_048_576;

export interface ContentAddressedAssetV1 {
  readonly kind: string;
  readonly mediaType: string;
  readonly sha256: string;
  readonly bytesBase64: string;
  readonly sourceUrl?: string;
}

export interface FractalDocumentEnvelopeV2 {
  readonly envelopeVersion: typeof FRACTAL_DOCUMENT_ENVELOPE_V2_READER_VERSION;
  readonly document: FractalDocumentV3;
  readonly assets: readonly ContentAddressedAssetV1[];
}

export type EnvelopeV2ReadonlyReason =
  | DocumentV3ReadonlyReason
  | "invalid-assets"
  | "asset-hash-mismatch"
  | "asset-budget-exceeded";

export interface PortableEnvelopeReadError {
  readonly code: "unsafe-input" | "invalid-envelope-v2";
  readonly path: string;
  readonly message: string;
}

export type PortableEnvelopeReadResult =
  | EnvelopeReadResult
  | {
      readonly mode: "readable-v2";
      readonly writer: "disabled";
      readonly envelope: FractalDocumentEnvelopeV2;
      readonly snapshot: FormulaSnapshotV1;
      readonly ir: FrmLikeV1Ir;
      readonly original: unknown;
      readonly warnings: readonly string[];
    }
  | {
      readonly mode: "readonly-v2";
      readonly writer: "disabled";
      readonly reason: EnvelopeV2ReadonlyReason;
      readonly document: FractalDocumentV3;
      readonly original: unknown;
      readonly warnings: readonly string[];
    }
  | {
      readonly mode: "readonly-future-envelope";
      readonly writer: "disabled";
      readonly sourceVersion: number;
      readonly original: unknown;
      readonly warnings: readonly string[];
    }
  | {
      readonly mode: "invalid";
      readonly errors: readonly PortableEnvelopeReadError[];
    };

const REQUIRED_ENVELOPE_KEYS = Object.freeze([
  "envelopeVersion",
  "document",
  "assets",
]);
const REQUIRED_ASSET_KEYS = Object.freeze([
  "kind",
  "mediaType",
  "sha256",
  "bytesBase64",
]);
const OPTIONAL_ASSET_KEYS = Object.freeze(["sourceUrl"]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function invalid(path: string, message: string): PortableEnvelopeReadResult {
  return {
    mode: "invalid",
    errors: [{ code: "invalid-envelope-v2", path, message }],
  };
}

function readonly(
  document: FractalDocumentV3,
  original: unknown,
  reason: EnvelopeV2ReadonlyReason,
  warning: string,
): PortableEnvelopeReadResult {
  return {
    mode: "readonly-v2",
    writer: "disabled",
    reason,
    document,
    original,
    warnings: Object.freeze([warning]),
  };
}

function canonicalBase64DecodedLength(value: string): number | null {
  if (
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    return null;
  }
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

function decodeCanonicalBase64(value: string): Uint8Array | null {
  try {
    const binary = globalThis.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++)
      bytes[index] = binary.charCodeAt(index);
    let encoded = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      encoded += String.fromCharCode(
        ...bytes.subarray(offset, offset + 0x8000),
      );
    }
    return globalThis.btoa(encoded) === value ? bytes : null;
  } catch {
    return null;
  }
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function sourceUrlIsSafe(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048)
    return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Unified reader seam: Envelope v1 delegates to the released legacy reader;
 * Envelope v2 is content-addressed and reader-only. No v2 writer exists here.
 */
export async function readPortableFractalDocumentEnvelope(
  input: unknown,
): Promise<PortableEnvelopeReadResult> {
  let cloned: unknown;
  try {
    cloned = clonePortableJsonV1(input, 2_097_152);
  } catch {
    return {
      mode: "invalid",
      errors: [
        {
          code: "unsafe-input",
          path: "",
          message:
            "Envelope input must be finite, acyclic, accessor-free plain JSON.",
        },
      ],
    };
  }
  if (!record(cloned))
    return invalid("", "Project envelope must be a JSON object.");
  if (
    !Number.isSafeInteger(cloned.envelopeVersion) ||
    Number(cloned.envelopeVersion) < 0
  ) {
    return invalid(
      "envelopeVersion",
      "envelopeVersion must be a non-negative safe integer.",
    );
  }
  if (cloned.envelopeVersion === FRACTAL_DOCUMENT_ENVELOPE_VERSION) {
    return readFractalDocumentEnvelope(cloned);
  }
  if (
    Number(cloned.envelopeVersion) > FRACTAL_DOCUMENT_ENVELOPE_V2_READER_VERSION
  ) {
    return {
      mode: "readonly-future-envelope",
      writer: "disabled",
      sourceVersion: Number(cloned.envelopeVersion),
      original: input,
      warnings: Object.freeze([
        `Envelope v${String(cloned.envelopeVersion)} is newer than the v2 reader.`,
      ]),
    };
  }
  if (
    cloned.envelopeVersion !== FRACTAL_DOCUMENT_ENVELOPE_V2_READER_VERSION ||
    !exactKeys(cloned, REQUIRED_ENVELOPE_KEYS) ||
    !Array.isArray(cloned.assets)
  ) {
    return invalid(
      "",
      "Expected a closed Envelope v2 with document and assets.",
    );
  }

  const documentResult = await readFractalDocumentV3(cloned.document);
  if (documentResult.mode === "invalid") {
    return invalid(
      "document",
      documentResult.errors[0]?.message ?? "Document v3 is invalid.",
    );
  }
  if (documentResult.mode === "readonly-v3") {
    return readonly(
      documentResult.document,
      input,
      documentResult.reason,
      documentResult.warnings[0] ?? "Embedded Document v3 is read-only.",
    );
  }

  if (cloned.assets.length > ENVELOPE_V2_MAX_ASSETS) {
    return readonly(
      documentResult.document,
      input,
      "asset-budget-exceeded",
      `Envelope v2 exceeds the ${String(ENVELOPE_V2_MAX_ASSETS)}-asset limit.`,
    );
  }
  const assets: ContentAddressedAssetV1[] = [];
  const digests = new Set<string>();
  let embeddedBytes = 0;
  for (const [index, rawAsset] of cloned.assets.entries()) {
    const path = `assets[${String(index)}]`;
    if (
      !record(rawAsset) ||
      !exactKeys(rawAsset, REQUIRED_ASSET_KEYS, OPTIONAL_ASSET_KEYS) ||
      typeof rawAsset.kind !== "string" ||
      rawAsset.kind.length === 0 ||
      rawAsset.kind.length > 128 ||
      typeof rawAsset.mediaType !== "string" ||
      rawAsset.mediaType.length === 0 ||
      rawAsset.mediaType.length > 255 ||
      typeof rawAsset.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(rawAsset.sha256) ||
      typeof rawAsset.bytesBase64 !== "string" ||
      !sourceUrlIsSafe(rawAsset.sourceUrl)
    ) {
      return readonly(
        documentResult.document,
        input,
        "invalid-assets",
        `${path} is not a closed content-addressed asset.`,
      );
    }
    const decodedLength = canonicalBase64DecodedLength(rawAsset.bytesBase64);
    if (decodedLength === null) {
      return readonly(
        documentResult.document,
        input,
        "invalid-assets",
        `${path}.bytesBase64 is not canonical base64.`,
      );
    }
    if (embeddedBytes + decodedLength > ENVELOPE_V2_MAX_EMBEDDED_BYTES) {
      return readonly(
        documentResult.document,
        input,
        "asset-budget-exceeded",
        "Envelope v2 exceeds the embedded content budget.",
      );
    }
    const bytes = decodeCanonicalBase64(rawAsset.bytesBase64);
    if (!bytes || bytes.byteLength !== decodedLength) {
      return readonly(
        documentResult.document,
        input,
        "invalid-assets",
        `${path}.bytesBase64 is not canonical base64.`,
      );
    }
    embeddedBytes += bytes.byteLength;
    if (digests.has(rawAsset.sha256)) {
      return readonly(
        documentResult.document,
        input,
        "invalid-assets",
        `${path}.sha256 duplicates another embedded asset.`,
      );
    }
    if ((await sha256Bytes(bytes)) !== rawAsset.sha256) {
      return readonly(
        documentResult.document,
        input,
        "asset-hash-mismatch",
        `${path}.sha256 does not match the embedded bytes.`,
      );
    }
    digests.add(rawAsset.sha256);
    assets.push(
      Object.freeze({
        kind: rawAsset.kind,
        mediaType: rawAsset.mediaType,
        sha256: rawAsset.sha256,
        bytesBase64: rawAsset.bytesBase64,
        ...(Object.hasOwn(rawAsset, "sourceUrl")
          ? { sourceUrl: rawAsset.sourceUrl as string }
          : {}),
      }),
    );
  }

  const envelope: FractalDocumentEnvelopeV2 = Object.freeze({
    envelopeVersion: FRACTAL_DOCUMENT_ENVELOPE_V2_READER_VERSION,
    document: documentResult.document,
    assets: Object.freeze(assets),
  });
  return {
    mode: "readable-v2",
    writer: "disabled",
    envelope,
    snapshot: documentResult.snapshot,
    ir: documentResult.ir,
    original: input,
    warnings: Object.freeze([
      ...documentResult.warnings,
      "Envelope v2 writer is disabled; imported bytes remain reader-only.",
    ]),
  };
}
