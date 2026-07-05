import fs from 'node:fs';
import path from 'node:path';
import { registerBuiltins } from '@/engine/plugins/builtins';
import type { FractalDocument } from '@/engine/document';
import { migrateFractalDocument } from '@/engine/document-migrate';
import { buildFractalParamsFromPresetQuery, parseGalleryPresetsFile } from '@/lib/gallery-presets';
import { decodeParams, documentToExploreHref } from '@/lib/url-params';
import { SITE } from '@/lib/site';
import { runtimeParamsToDocument } from '@/engine/document-adapter';

type JsonRecord = Record<string, unknown>;

export interface CliSuccess<T> {
  ok: true;
  command: string;
  data: T;
}

export interface CliFailure {
  ok: false;
  command: string;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class CliCommandError extends Error {
  constructor(
    public readonly code: string,
    public readonly exitCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'CliCommandError';
  }
}

let builtinsReady = false;

function ensureBuiltinsRegistered(): void {
  if (builtinsReady) return;
  registerBuiltins({ quiet: true });
  builtinsReady = true;
}

function asObject(value: unknown): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected a JSON object input.');
  }
  return value as JsonRecord;
}

function searchParamsFromInput(args: { url?: string; query?: string }): URLSearchParams {
  if (args.url && args.query) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Use either --url or --query, not both.');
  }

  if (!args.url && !args.query) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected --url or --query input.');
  }

  if (args.url) {
    try {
      return new URL(args.url).searchParams;
    } catch (error) {
      throw new CliCommandError('INVALID_URL', 1, `Expected a valid ${SITE.name} explore URL.`, {
        input: args.url,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return new URLSearchParams(args.query?.startsWith('?') ? args.query.slice(1) : args.query);
}

function findPresetConfigById(presetId: string, presetsPath?: string) {
  const resolvedPath = presetsPath
    ? path.resolve(presetsPath)
    : path.resolve(process.cwd(), 'public/gallery-presets.json');

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (error) {
    throw new CliCommandError('PRESET_FILE_READ_FAILED', 3, 'Failed to read gallery-presets.json.', {
      path: resolvedPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  const file = parseGalleryPresetsFile(parsed);
  const config = file.presets.find((preset) => preset.id === presetId);

  if (!config) {
    throw new CliCommandError('PRESET_NOT_FOUND', 2, `Preset "${presetId}" was not found.`, {
      path: resolvedPath,
      presetId,
    });
  }

  return { config, resolvedPath };
}

function normalizeDocumentInput(input: unknown): FractalDocument {
  const objectInput = asObject(input);
  return migrateFractalDocument(objectInput);
}

export function createSuccess<T>(command: string, data: T): CliSuccess<T> {
  return { ok: true, command, data };
}

export function createFailure(command: string, error: unknown): CliFailure {
  if (error instanceof CliCommandError) {
    return {
      ok: false,
      command,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }

  return {
    ok: false,
    command,
    error: {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unexpected CLI error.',
    },
  };
}

export function docFromUrl(args: { url?: string; query?: string }) {
  ensureBuiltinsRegistered();

  const searchParams = searchParamsFromInput(args);
  const query = searchParams.toString();
  const decoded = decodeParams(searchParams);
  const document = migrateFractalDocument(decoded);

  return createSuccess('doc from-url', {
    document,
    source: {
      type: 'url' as const,
      url: args.url,
      query,
    },
  });
}

export function docToUrl(args: { document: unknown; locale: string; baseUrl?: string }) {
  ensureBuiltinsRegistered();

  if (!args.locale) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected --locale for doc to-url.');
  }

  const document = normalizeDocumentInput(args.document);
  const href = documentToExploreHref(document, args.locale);
  const baseUrl = args.baseUrl ?? SITE.url;
  const url = new URL(href, baseUrl).toString();

  return createSuccess('doc to-url', {
    href,
    url,
    query: href.split('?')[1] ?? '',
    locale: args.locale,
  });
}

export function docFromPreset(args: { id: string; presetsPath?: string }) {
  ensureBuiltinsRegistered();

  if (!args.id) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected --id for doc from-preset.');
  }

  const { config, resolvedPath } = findPresetConfigById(args.id, args.presetsPath);
  const { params, keyframes } = buildFractalParamsFromPresetQuery(config.url);
  const document = migrateFractalDocument(
    runtimeParamsToDocument(params, keyframes ? { animation: { keyframes } } : undefined)
  );

  return createSuccess('doc from-preset', {
    document,
    source: {
      type: 'preset' as const,
      id: config.id,
      name: config.name,
      nameZh: config.nameZh,
      path: resolvedPath,
    },
  });
}

export function docFromSaved(args: { payload: unknown }) {
  ensureBuiltinsRegistered();

  const payload = asObject(args.payload);
  const document = migrateFractalDocument(payload);

  return createSuccess('doc from-saved', {
    document,
    source: {
      type: 'saved' as const,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      sourceFormat: typeof payload.schemaVersion === 'number' ? 'document' : 'saved-fractal',
    },
  });
}
