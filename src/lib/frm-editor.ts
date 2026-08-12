/** Browser helpers and one-time intent parsing for the standalone FRM editor. */
import type { FrmEntry } from '@/engine/frm/scanner';

export const MAX_FRM_FILE_BYTES = 256 * 1024;

const CUSTOM_FORMULA_ID_PATTERN = /^custom-[A-Za-z0-9._~-]{1,180}$/;

export type FrmFileReadResult =
  | { success: true; source: string }
  | { success: false; error: 'extension' | 'size' | 'encoding' };

export type FrmSourcePreflight =
  | { status: 'empty' | 'single' }
  | { status: 'multiple' | 'trailing' };

export type EditorToExploreIntent =
  | { status: 'none' }
  | { status: 'invalid'; formulaId: string; reason: 'missing' | 'invalid-id' }
  | { status: 'valid'; formulaId: string };

export async function readFrmFile(file: File): Promise<FrmFileReadResult> {
  if (!file.name.toLowerCase().endsWith('.frm')) {
    return { success: false, error: 'extension' };
  }
  if (file.size > MAX_FRM_FILE_BYTES) {
    return { success: false, error: 'size' };
  }

  try {
    const source = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: true,
    }).decode(await file.arrayBuffer());
    return { success: true, source };
  } catch {
    return { success: false, error: 'encoding' };
  }
}

/**
 * Detect source that the single-formula compiler would otherwise partially read.
 * The source is never rewritten; parser/compiler diagnostics still own syntax errors.
 */
export function preflightFrmSource(source: string): FrmSourcePreflight {
  if (!source.trim()) {
    return { status: 'empty' };
  }

  let depth = 0;
  let topLevelEntries = 0;
  let sawTrailingContent = false;
  let inComment = false;

  for (const char of source) {
    if (inComment) {
      if (char === '\n' || char === '\r') {
        inComment = false;
      }
      continue;
    }

    if (char === ';') {
      inComment = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        topLevelEntries += 1;
      }
      depth += 1;
      continue;
    }

    if (char === '}') {
      if (depth > 0) {
        depth -= 1;
      } else if (topLevelEntries > 0) {
        sawTrailingContent = true;
      }
      continue;
    }

    if (depth === 0 && topLevelEntries > 0 && char.trim()) {
      sawTrailingContent = true;
    }
  }

  if (topLevelEntries > 1) {
    return { status: 'multiple' };
  }
  if (topLevelEntries === 1 && sawTrailingContent) {
    return { status: 'trailing' };
  }

  return { status: 'single' };
}

export function frmDownloadFilename(name?: string): string {
  const safe = (name ?? '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${safe || 'fractalpark-formula'}.frm`;
}

/**
 * Slice one entry's full text (header through closing `}`) out of a
 * multi-entry source, using the scanner's own ranges. The result is a
 * valid single-entry classic source — the editor compiles exactly what it
 * displays, so coordinates never drift (Slice 7e2).
 */
export function sliceFrmEntrySource(source: string, entry: FrmEntry): string {
  const { startOffset, endOffset } = entry.range;
  return source.slice(startOffset, endOffset).replace(/\s+$/, '') + '\n';
}

export function createFrmDownload(source: string, name?: string) {
  return {
    blob: new Blob([source], { type: 'text/plain;charset=utf-8' }),
    filename: frmDownloadFilename(name),
  };
}

export function editorToExploreHref(locale: string, formulaId: string): string {
  return `/${locale}/explore?open=custom-formula&formula=${encodeURIComponent(formulaId)}`;
}

export function parseEditorToExploreIntent(
  searchParams: URLSearchParams
): EditorToExploreIntent {
  if (searchParams.get('open') !== 'custom-formula') {
    return { status: 'none' };
  }

  const formulaId = searchParams.get('formula') ?? '';
  if (!formulaId) {
    return { status: 'invalid', formulaId, reason: 'missing' };
  }
  if (!CUSTOM_FORMULA_ID_PATTERN.test(formulaId)) {
    return { status: 'invalid', formulaId, reason: 'invalid-id' };
  }

  return { status: 'valid', formulaId };
}

export function stripEditorToExploreIntent(
  locale: string,
  searchParams: URLSearchParams
): string {
  const remaining = new URLSearchParams(searchParams.toString());
  remaining.delete('open');
  remaining.delete('formula');
  const query = remaining.toString();
  return `/${locale}/explore${query ? `?${query}` : ''}`;
}
