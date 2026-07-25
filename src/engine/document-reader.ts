import {
  FRACTAL_DOCUMENT_SCHEMA_VERSION,
  type FractalDocument,
} from './document';
import {
  hasFractalDocumentShape,
  migrateFractalDocument,
  normalizeFractalDocument,
} from './document-migrate';

export interface DocumentReadError {
  code:
    | 'not-an-object'
    | 'missing-schema-version'
    | 'invalid-schema-version'
    | 'missing-document-sections'
    | 'migration-failed';
  message: string;
}

export type DocumentReadResult =
  | {
      mode: 'editable';
      document: FractalDocument;
      migratedFrom?: number;
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
      errors: DocumentReadError[];
    };

function invalid(code: DocumentReadError['code'], message: string): DocumentReadResult {
  return {
    mode: 'invalid',
    errors: [{ code, message }],
  };
}

export function readFractalDocument(input: unknown): DocumentReadResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return invalid('not-an-object', 'The document must be a JSON object.');
  }

  if (!('schemaVersion' in input)) {
    return invalid('missing-schema-version', 'The document is missing schemaVersion.');
  }

  const schemaVersion = (input as Record<string, unknown>).schemaVersion;
  if (
    typeof schemaVersion !== 'number' ||
    !Number.isFinite(schemaVersion) ||
    !Number.isInteger(schemaVersion) ||
    schemaVersion < 0
  ) {
    return invalid('invalid-schema-version', 'schemaVersion must be a non-negative integer.');
  }

  if (!hasFractalDocumentShape(input)) {
    return invalid(
      'missing-document-sections',
      'The document must contain scene, formula, coloring, transform, and render sections.'
    );
  }

  if (schemaVersion > FRACTAL_DOCUMENT_SCHEMA_VERSION) {
    const previewInput = {
      ...input,
      schemaVersion: FRACTAL_DOCUMENT_SCHEMA_VERSION,
    };

    try {
      return {
        mode: 'readonly-future',
        document: normalizeFractalDocument(previewInput as FractalDocument),
        sourceVersion: schemaVersion,
        original: input,
        warnings: [
          `This artwork uses schema version ${schemaVersion}; this version of FractalPark supports ${FRACTAL_DOCUMENT_SCHEMA_VERSION}.`,
          'Unknown fields are preserved only in the original input and would be lost from an editable copy.',
        ],
      };
    } catch (error) {
      return invalid(
        'migration-failed',
        error instanceof Error ? error.message : 'The future document could not be projected for preview.'
      );
    }
  }

  try {
    return {
      mode: 'editable',
      document: migrateFractalDocument(input),
      ...(schemaVersion < FRACTAL_DOCUMENT_SCHEMA_VERSION
        ? { migratedFrom: schemaVersion }
        : {}),
    };
  } catch (error) {
    return invalid(
      'migration-failed',
      error instanceof Error ? error.message : 'The document could not be migrated.'
    );
  }
}
