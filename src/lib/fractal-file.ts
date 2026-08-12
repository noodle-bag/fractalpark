import {
  FRACTAL_DOCUMENT_ENVELOPE_VERSION,
  readFractalDocumentEnvelope,
  type EnvelopeReadResult,
  type FractalDocumentEnvelopeV1,
  type PortableFormulaAsset,
} from '@/engine/document-envelope';
import { normalizeFractalDocument } from '@/engine/document-migrate';
import type { FractalDocument } from '@/engine/document';
import { FORMULA_CATALOG } from '@/engine/plugins/formula-catalog';
import { pluginRegistry } from '@/engine/plugins/registry';
import { resolveCustomFormula } from '@/lib/formula-resolver';
import {
  DEFAULT_FRM_SEMANTICS_VERSION,
  resolveFrmSemanticsVersion,
  type FrmSemanticsVersion,
} from '@/engine/frm/semantics-version';

export const FRACTAL_PROJECT_FILE_MAX_BYTES = 1024 * 1024;
export const PORTABLE_FORMULA_SOURCE_MAX_BYTES = 256 * 1024;
const BUILTIN_FORMULA_IDS = new Set(FORMULA_CATALOG.map((formula) => formula.id));

export type FractalProjectErrorCode =
  | 'invalid-json'
  | 'file-too-large'
  | 'invalid-envelope'
  | 'source-too-large'
  | 'missing-formula-asset'
  | 'asset-hash-mismatch'
  | 'asset-compile-failed';

export interface FractalProjectError {
  code: FractalProjectErrorCode;
  message: string;
  path?: string;
}

export type FractalProjectResult<T> =
  | { success: true; value: T }
  | { success: false; errors: FractalProjectError[] };

export interface LocalFormulaAsset {
  id: string;
  name?: string;
  source: string;
  /** Stored compile-semantics contract; preserved verbatim on export. */
  frmSemanticsVersion?: FrmSemanticsVersion;
}

export interface PreparedFormulaAsset extends LocalFormulaAsset {
  hash: string;
}

export interface PreparedFractalProjectImport {
  document: FractalDocument;
  formulasToAdd: PreparedFormulaAsset[];
  reusedFormulaIds: string[];
}

export function createFractalProjectFilename(
  name?: string,
  timestamp = Date.now()
): string {
  const safeName = name
    ?.normalize('NFKC')
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  const truncatedName = safeName ? Array.from(safeName).slice(0, 80).join('') : '';
  const fallback = new Date(timestamp).toISOString().replace(/[:.]/g, '-');
  return `fractalpark-${truncatedName || fallback}.fractal.json`;
}

export function downloadFractalProjectFile(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function failure<T>(
  code: FractalProjectErrorCode,
  message: string,
  path?: string
): FractalProjectResult<T> {
  return { success: false, errors: [{ code, message, path }] };
}

function toProjectError(result: Extract<EnvelopeReadResult, { mode: 'invalid' }>): FractalProjectError[] {
  return result.errors.map((error) => ({
    code: 'invalid-envelope',
    message: error.message,
    path: error.path,
  }));
}

function validateFormulaSourceSizes(
  envelope: FractalDocumentEnvelopeV1
): FractalProjectResult<FractalDocumentEnvelopeV1> {
  const oversized = envelope.assets?.formulas?.find(
    (asset) => byteLength(asset.source) > PORTABLE_FORMULA_SOURCE_MAX_BYTES
  );
  return oversized
    ? failure(
        'source-too-large',
        `Formula sources cannot exceed ${PORTABLE_FORMULA_SOURCE_MAX_BYTES} bytes.`,
        `formula:${oversized.id}`
      )
    : { success: true, value: envelope };
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function serializeFractalProject(
  envelope: FractalDocumentEnvelopeV1
): FractalProjectResult<string> {
  const result = readFractalDocumentEnvelope(envelope);
  if (result.mode !== 'editable') {
    return result.mode === 'invalid'
      ? { success: false, errors: toProjectError(result) }
      : failure('invalid-envelope', 'Future documents cannot be serialized as editable projects.');
  }
  const sourceSizeResult = validateFormulaSourceSizes(result.envelope);
  if (!sourceSizeResult.success) {
    return sourceSizeResult;
  }

  const json = `${JSON.stringify(result.envelope, null, 2)}\n`;
  if (byteLength(json) > FRACTAL_PROJECT_FILE_MAX_BYTES) {
    return failure(
      'file-too-large',
      `Project files cannot exceed ${FRACTAL_PROJECT_FILE_MAX_BYTES} bytes.`
    );
  }

  return { success: true, value: json };
}

export function parseFractalProjectJson(
  json: string
): FractalProjectResult<Exclude<EnvelopeReadResult, { mode: 'invalid' }>> {
  if (byteLength(json) > FRACTAL_PROJECT_FILE_MAX_BYTES) {
    return failure(
      'file-too-large',
      `Project files cannot exceed ${FRACTAL_PROJECT_FILE_MAX_BYTES} bytes.`
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return failure('invalid-json', 'The selected project file is not valid JSON.');
  }

  const result = readFractalDocumentEnvelope(raw);
  if (result.mode === 'invalid') {
    return { success: false, errors: toProjectError(result) };
  }
  if (result.mode === 'editable') {
    const sourceSizeResult = validateFormulaSourceSizes(result.envelope);
    if (!sourceSizeResult.success) {
      return sourceSizeResult;
    }
  }

  return { success: true, value: result };
}

export async function createFractalDocumentEnvelope(
  document: FractalDocument,
  localFormulas: readonly LocalFormulaAsset[]
): Promise<FractalProjectResult<FractalDocumentEnvelopeV1>> {
  const formulaId = document.formula.formulaId;
  const localFormula = localFormulas.find((formula) => formula.id === formulaId);

  if (BUILTIN_FORMULA_IDS.has(formulaId)) {
    return {
      success: true,
      value: {
        envelopeVersion: FRACTAL_DOCUMENT_ENVELOPE_VERSION,
        document: normalizeFractalDocument(document),
      },
    };
  }

  if (!localFormula) {
    return failure(
      'missing-formula-asset',
      `Custom formula source is unavailable for ${formulaId}.`,
      'document.formula.formulaId'
    );
  }

  if (byteLength(localFormula.source) > PORTABLE_FORMULA_SOURCE_MAX_BYTES) {
    return failure(
      'source-too-large',
      `Formula sources cannot exceed ${PORTABLE_FORMULA_SOURCE_MAX_BYTES} bytes.`,
      `formula:${formulaId}`
    );
  }

  const hash = await sha256Hex(localFormula.source);
  const normalizedDocument = normalizeFractalDocument(document);
  normalizedDocument.assets = {
    ...normalizedDocument.assets,
    formula: { id: formulaId, hash },
  };

  return {
    success: true,
    value: {
      envelopeVersion: FRACTAL_DOCUMENT_ENVELOPE_VERSION,
      document: normalizedDocument,
      assets: {
        formulas: [
          {
            id: formulaId,
            language: 'frm',
            name: localFormula.name,
            source: localFormula.source,
            hash,
            frmSemanticsVersion: localFormula.frmSemanticsVersion ?? DEFAULT_FRM_SEMANTICS_VERSION,
          },
        ],
      },
    },
  };
}

function deriveImportedFormulaId(hash: string, occupiedIds: Set<string>): string {
  for (let length = 12; length <= hash.length; length += 4) {
    const candidate = `custom-imported-${hash.slice(0, length)}`;
    if (!occupiedIds.has(candidate) && !pluginRegistry.hasFormula(candidate)) {
      return candidate;
    }
  }

  let suffix = 2;
  while (
    occupiedIds.has(`custom-imported-${hash}-${suffix}`) ||
    pluginRegistry.hasFormula(`custom-imported-${hash}-${suffix}`)
  ) {
    suffix += 1;
  }
  return `custom-imported-${hash}-${suffix}`;
}

async function validatePortableAsset(
  asset: PortableFormulaAsset
): Promise<FractalProjectResult<PortableFormulaAsset>> {
  if (byteLength(asset.source) > PORTABLE_FORMULA_SOURCE_MAX_BYTES) {
    return failure(
      'source-too-large',
      `Formula sources cannot exceed ${PORTABLE_FORMULA_SOURCE_MAX_BYTES} bytes.`,
      `formula:${asset.id}`
    );
  }

  const actualHash = await sha256Hex(asset.source);
  if (actualHash !== asset.hash) {
    return failure(
      'asset-hash-mismatch',
      `Formula asset hash does not match its source: ${asset.id}.`,
      `formula:${asset.id}`
    );
  }

  return { success: true, value: asset };
}

export async function prepareFractalProjectImport(
  envelope: FractalDocumentEnvelopeV1,
  localFormulas: readonly LocalFormulaAsset[]
): Promise<FractalProjectResult<PreparedFractalProjectImport>> {
  const envelopeResult = readFractalDocumentEnvelope(envelope);
  if (envelopeResult.mode !== 'editable') {
    return envelopeResult.mode === 'invalid'
      ? { success: false, errors: toProjectError(envelopeResult) }
      : failure('invalid-envelope', 'Future documents cannot be prepared for editable import.');
  }

  const normalizedEnvelope = envelopeResult.envelope;
  const portableAssets = normalizedEnvelope.assets?.formulas ?? [];
  const formulaReference = normalizedEnvelope.document.assets?.formula;
  const documentFormulaId = normalizedEnvelope.document.formula.formulaId;

  if (!formulaReference && !BUILTIN_FORMULA_IDS.has(documentFormulaId)) {
    return failure(
      'missing-formula-asset',
      `Custom formula source is unavailable for ${documentFormulaId}.`,
      'document.assets.formula'
    );
  }
  if (formulaReference && !portableAssets.some((asset) => asset.id === formulaReference.id)) {
    return failure(
      'missing-formula-asset',
      `The document references a missing formula asset: ${formulaReference.id}.`,
      'document.assets.formula'
    );
  }
  if (portableAssets.length > 0 && !formulaReference) {
    return failure(
      'missing-formula-asset',
      'Portable formula assets require a document formula asset reference.',
      'document.assets.formula'
    );
  }
  if (
    formulaReference &&
    portableAssets.some((asset) => asset.id !== formulaReference.id)
  ) {
    return failure(
      'missing-formula-asset',
      'The envelope contains formula assets that are not referenced by the document.',
      'assets.formulas'
    );
  }
  if (formulaReference && formulaReference.id !== documentFormulaId) {
    return failure(
      'missing-formula-asset',
      'The formula asset reference must match document.formula.formulaId.',
      'document.assets.formula.id'
    );
  }
  if (
    formulaReference &&
    portableAssets[0] &&
    formulaReference.hash !== portableAssets[0].hash
  ) {
    return failure(
      'asset-hash-mismatch',
      'The document formula reference hash does not match the portable asset.',
      'document.assets.formula.hash'
    );
  }

  const localById = new Map(localFormulas.map((formula) => [formula.id, formula]));
  const localHashes = new Map<string, string>();
  for (const formula of localFormulas) {
    localHashes.set(formula.id, await sha256Hex(formula.source));
  }

  const occupiedIds = new Set([
    ...BUILTIN_FORMULA_IDS,
    ...localFormulas.map((formula) => formula.id),
    ...pluginRegistry.listFormulas().map((formula) => formula.id),
  ]);
  const idMap = new Map<string, string>();
  const formulasToAdd: PreparedFormulaAsset[] = [];
  const reusedFormulaIds: string[] = [];

  for (const asset of portableAssets) {
    const validation = await validatePortableAsset(asset);
    if (!validation.success) {
      return validation;
    }

    const localFormula = localById.get(asset.id);
    const localHash = localHashes.get(asset.id);
    const shouldReuse = Boolean(
      localFormula &&
        localHash === asset.hash &&
        resolveFrmSemanticsVersion(localFormula.frmSemanticsVersion) ===
          resolveFrmSemanticsVersion(asset.frmSemanticsVersion)
    );
    let resolvedId = asset.id;

    if (!shouldReuse && occupiedIds.has(asset.id)) {
      resolvedId = deriveImportedFormulaId(asset.hash, occupiedIds);
    }

    const resolution = resolveCustomFormula(
      {
        id: resolvedId,
        source: asset.source,
        frmSemanticsVersion: asset.frmSemanticsVersion,
      },
      { register: false }
    );
    if (!resolution.success) {
      return failure(
        'asset-compile-failed',
        resolution.errors.join('; '),
        `formula:${asset.id}`
      );
    }

    if (shouldReuse) {
      reusedFormulaIds.push(asset.id);
      idMap.set(asset.id, asset.id);
      continue;
    }

    occupiedIds.add(resolvedId);
    idMap.set(asset.id, resolvedId);
    formulasToAdd.push({
      id: resolvedId,
      name: asset.name ?? resolution.plugin.name,
      source: asset.source,
      hash: asset.hash,
      frmSemanticsVersion: asset.frmSemanticsVersion,
    });
  }

  const document = normalizeFractalDocument(normalizedEnvelope.document);
  if (formulaReference) {
    const resolvedId = idMap.get(formulaReference.id);
    if (!resolvedId) {
      return failure(
        'missing-formula-asset',
        `The document formula asset was not prepared: ${formulaReference.id}.`,
        'document.assets.formula'
      );
    }
    document.formula.formulaId = resolvedId;
    document.assets = {
      ...document.assets,
      formula: { id: resolvedId, hash: formulaReference.hash },
    };
  }

  return {
    success: true,
    value: {
      document,
      formulasToAdd,
      reusedFormulaIds,
    },
  };
}
