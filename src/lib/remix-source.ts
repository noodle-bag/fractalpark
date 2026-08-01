import { isPublishedArtworkPagePresetId } from '@/content/artwork-pages';
import type { FractalDocument } from '@/engine/document';
import { normalizeFractalDocument } from '@/engine/document-migrate';
import { getFormulaMetadata } from '@/engine/plugins/formula-catalog';

export type RemixSourceType = 'formula' | 'preset';

export interface RemixSource {
  type: RemixSourceType;
  id: string;
  sourceId: `${RemixSourceType}:${string}`;
}

const REMIX_PARAM = 'remix';
const MAX_REMIX_SOURCE_LENGTH = 128;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function resolveRemixSource(value: string): RemixSource | null {
  if (
    value.length === 0 ||
    value.length > MAX_REMIX_SOURCE_LENGTH ||
    CONTROL_CHARACTERS.test(value)
  ) {
    return null;
  }

  const separatorIndex = value.indexOf(':');
  if (
    separatorIndex <= 0 ||
    separatorIndex !== value.lastIndexOf(':') ||
    separatorIndex === value.length - 1
  ) {
    return null;
  }

  const type = value.slice(0, separatorIndex);
  const id = value.slice(separatorIndex + 1);

  if (type === 'formula' && getFormulaMetadata(id)) {
    return { type, id, sourceId: `formula:${id}` };
  }
  if (type === 'preset' && isPublishedArtworkPagePresetId(id)) {
    return { type, id, sourceId: `preset:${id}` };
  }

  return null;
}

export function parseRemixSource(
  searchParams: URLSearchParams
): RemixSource | null {
  const values = searchParams.getAll(REMIX_PARAM);
  return values.length === 1 ? resolveRemixSource(values[0]) : null;
}

export function appendRemixSource(
  href: string,
  source: Pick<RemixSource, 'type' | 'id'>
): string {
  const resolved = resolveRemixSource(`${source.type}:${source.id}`);
  if (!resolved) {
    throw new Error(`Invalid Remix source: ${source.type}:${source.id}`);
  }

  const url = new URL(href, 'https://fractalpark.invalid');
  url.searchParams.set(REMIX_PARAM, resolved.sourceId);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function applyRemixSource(
  document: FractalDocument,
  source: RemixSource | null
): FractalDocument {
  if (!source) return document;

  return normalizeFractalDocument({
    ...document,
    metadata: {
      ...document.metadata,
      source: 'remix',
      sourceId: source.sourceId,
    },
  });
}
