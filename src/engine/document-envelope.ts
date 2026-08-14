import type { FractalDocument } from './document';
import { readFractalDocument } from './document-reader';
import {
  resolveFrmSemanticsVersion,
  type FrmSemanticsVersion,
} from './frm/semantics-version';
import { canonicalizeCloudCustomFormulaRuntimeId } from '@/lib/cloud/custom-formula-identity';

export const FRACTAL_DOCUMENT_ENVELOPE_VERSION = 1 as const;

export interface PortableFormulaAsset {
  id: string;
  language: 'frm';
  name?: string;
  source: string;
  hash: string;
  /** FRM compile-semantics contract (spec §3); missing reads as v1. */
  frmSemanticsVersion?: FrmSemanticsVersion;
}

export interface FractalDocumentEnvelopeV1 {
  envelopeVersion: typeof FRACTAL_DOCUMENT_ENVELOPE_VERSION;
  document: FractalDocument;
  assets?: {
    formulas?: PortableFormulaAsset[];
  };
}

export interface EnvelopeReadError {
  code:
    | 'not-an-object'
    | 'missing-envelope-version'
    | 'unsupported-envelope-version'
    | 'invalid-document'
    | 'invalid-assets';
  path: string;
  message: string;
}

export type EnvelopeReadResult =
  | {
      mode: 'editable';
      envelope: FractalDocumentEnvelopeV1;
    }
  | {
      mode: 'readonly-future';
      document: FractalDocument;
      sourceVersion: number;
      original: unknown;
      warnings: string[];
    }
  | {
      mode: 'invalid';
      errors: EnvelopeReadError[];
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(
  code: EnvelopeReadError['code'],
  path: string,
  message: string
): EnvelopeReadResult {
  return {
    mode: 'invalid',
    errors: [{ code, path, message }],
  };
}

function readPortableFormulaAsset(
  value: unknown,
  index: number
): PortableFormulaAsset | EnvelopeReadError {
  const path = `assets.formulas[${index}]`;
  if (!isObject(value)) {
    return { code: 'invalid-assets', path, message: 'Formula assets must be objects.' };
  }
  if (typeof value.id !== 'string' || value.id.length === 0) {
    return { code: 'invalid-assets', path: `${path}.id`, message: 'Asset ID is required.' };
  }
  if (value.language !== 'frm') {
    return {
      code: 'invalid-assets',
      path: `${path}.language`,
      message: 'Only FRM formula assets are supported.',
    };
  }
  if (typeof value.source !== 'string' || value.source.length === 0) {
    return {
      code: 'invalid-assets',
      path: `${path}.source`,
      message: 'Formula source is required.',
    };
  }
  if (typeof value.hash !== 'string' || !/^[a-f0-9]{64}$/.test(value.hash)) {
    return {
      code: 'invalid-assets',
      path: `${path}.hash`,
      message: 'Formula hash must be a lowercase SHA-256 hex digest.',
    };
  }
  if (value.name !== undefined && typeof value.name !== 'string') {
    return {
      code: 'invalid-assets',
      path: `${path}.name`,
      message: 'Formula name must be a string.',
    };
  }

  return {
    id: canonicalizeCloudCustomFormulaRuntimeId(value.id),
    language: 'frm',
    name: value.name as string | undefined,
    source: value.source,
    hash: value.hash,
    // Missing/abnormal versions read as legacy v1 (lenient reader); the
    // parsed asset always carries an effective version.
    frmSemanticsVersion: resolveFrmSemanticsVersion(value.frmSemanticsVersion),
  };
}

export function readFractalDocumentEnvelope(input: unknown): EnvelopeReadResult {
  if (!isObject(input)) {
    return invalid('not-an-object', '', 'The project envelope must be a JSON object.');
  }
  if (!('envelopeVersion' in input)) {
    return invalid(
      'missing-envelope-version',
      'envelopeVersion',
      'The project envelope is missing envelopeVersion.'
    );
  }
  if (input.envelopeVersion !== FRACTAL_DOCUMENT_ENVELOPE_VERSION) {
    return invalid(
      'unsupported-envelope-version',
      'envelopeVersion',
      `Unsupported envelope version: ${String(input.envelopeVersion)}.`
    );
  }

  const documentResult = readFractalDocument(input.document);
  if (documentResult.mode === 'invalid') {
    return {
      mode: 'invalid',
      errors: documentResult.errors.map((error) => ({
        code: 'invalid-document',
        path: 'document',
        message: error.message,
      })),
    };
  }
  if (documentResult.mode === 'readonly-future') {
    return {
      mode: 'readonly-future',
      document: documentResult.document,
      sourceVersion: documentResult.sourceVersion,
      original: input,
      warnings: documentResult.warnings,
    };
  }

  let formulas: PortableFormulaAsset[] | undefined;
  if (input.assets !== undefined) {
    if (!isObject(input.assets)) {
      return invalid('invalid-assets', 'assets', 'Envelope assets must be an object.');
    }
    if (input.assets.formulas !== undefined) {
      if (!Array.isArray(input.assets.formulas)) {
        return invalid(
          'invalid-assets',
          'assets.formulas',
          'Envelope formula assets must be an array.'
        );
      }

      const seenIds = new Set<string>();
      formulas = [];
      for (const [index, value] of input.assets.formulas.entries()) {
        const asset = readPortableFormulaAsset(value, index);
        if ('code' in asset) {
          return { mode: 'invalid', errors: [asset] };
        }
        if (seenIds.has(asset.id)) {
          return invalid(
            'invalid-assets',
            `assets.formulas[${index}].id`,
            `Duplicate formula asset ID: ${asset.id}.`
          );
        }
        seenIds.add(asset.id);
        formulas.push(asset);
      }
    }
  }

  return {
    mode: 'editable',
    envelope: {
      envelopeVersion: FRACTAL_DOCUMENT_ENVELOPE_VERSION,
      document: documentResult.document,
      assets: formulas && formulas.length > 0 ? { formulas } : undefined,
    },
  };
}
