/**
 * Authoritative classic FRM entry scanner (v0.4.18 Slice 1).
 *
 * Splits a classic Fractint `.frm` source into its entries with exact source
 * ranges, header metadata, stable selection keys, and structured
 * diagnostics. The scanner deliberately locates entry boundaries only —
 * classic body syntax (comma/newline separators, `:` loop transition,
 * bailout predicate) is lowered by a later stage.
 *
 * Entry contract (docs/specs/frm-compatibility-v1.md §2):
 * - A single-entry file may be selected implicitly; a multi-entry file must
 *   be selected explicitly (`requiresSelection` / `selectFrmEntry`).
 * - Trailing tokens, duplicated names, and broken boundaries are surfaced
 *   as structured diagnostics so every consumer rejects consistently.
 * - The source is never mutated; all ranges slice the original text exactly.
 *
 * Boundary grammar:
 *   header := [ws] name [ws] ['(' SYM ')'] [ws] '{'
 *   entry  := header body '}'            (brace depth matched)
 *   ';' starts a comment that runs to end of line; braces inside comments
 *   never count toward depth. In top-level state, comment lines, blank
 *   lines, and brace-led separator blocks (`{ ==== }`) are file noise and
 *   are skipped; any other non-header content is reported as trailing
 *   tokens.
 */

/** An inclusive-start / exclusive-end offset range into the source text. */
export interface FrmSourceRange {
  /** Inclusive start offset (UTF-16 code units, matches `String#slice`). */
  startOffset: number;
  /** Exclusive end offset (UTF-16 code units). */
  endOffset: number;
}

/** A single formula entry located in the source. */
export interface FrmEntry {
  /** Stable selection key: the plain name, or `name#2`/`name#3` for duplicates. */
  key: string;
  /** Formula name as written in the header (may contain hyphens and digits). */
  name: string;
  /** Symmetry marker from the header (e.g. `XAXIS`), uppercased, when present. */
  symmetry?: string;
  /** Raw `[...]` option block content from the header, when present. */
  options?: string;
  /** Full entry text range: header name start through the closing `}`. */
  range: FrmSourceRange;
  /** Header range: name start through the opening `{` (inclusive). */
  headerRange: FrmSourceRange;
}

export type FrmScanDiagnosticCode =
  | 'no-entries'
  | 'duplicate-name'
  | 'preamble-content'
  | 'prose-content'
  | 'trailing-tokens'
  | 'unclosed-brace';

/** Diagnostic codes that must block entry compilation (spec §2). */
export const FRM_BLOCKING_DIAGNOSTICS: ReadonlySet<FrmScanDiagnosticCode> = new Set<FrmScanDiagnosticCode>([
  'no-entries',
  'trailing-tokens',
  'unclosed-brace',
]);

/** Structured scanner finding; consumers reject or annotate from these. */
export interface FrmScanDiagnostic {
  code: FrmScanDiagnosticCode;
  message: string;
  /** Start offset of the offending region. */
  offset: number;
  /** Exclusive end offset of the offending region, when bounded. */
  endOffset?: number;
  /** Entry key for entry-scoped diagnostics (duplicate-name, unclosed-brace). */
  entryKey?: string;
}

export interface FrmScanResult {
  entries: FrmEntry[];
  diagnostics: FrmScanDiagnostic[];
}

/** Characters that terminate a header name token. */
const NAME_STOP = new Set([' ', '\t', '\r', '\n', '(', '{', '}', ';', '[']);

/** Leading noise on a line that can never begin an entry header. */
const LEADING_NOISE = new Set([' ', '\t', '\r', '\uFEFF']);

interface ParsedHeader {
  name: string;
  nameStart: number;
  nameEnd: number;
  symmetry?: string;
  /** Raw `[...]` option block content (e.g. `float=y function=sqr/exp`). */
  options?: string;
  braceOffset: number;
}

function skipHorizontalWs(source: string, i: number): number {
  while (i < source.length && LEADING_NOISE.has(source[i])) i++;
  return i;
}

function skipToEol(source: string, i: number): number {
  while (i < source.length && source[i] !== '\n') i++;
  return i;
}

/**
 * Try to parse an entry header at `start` (the first non-noise character of
 * a line). Returns null when the line is not a header; never throws.
 */
function tryParseHeader(source: string, start: number): ParsedHeader | null {
  const n = source.length;

  // Name token: run of characters until whitespace, '(', '{', '}', or ';'.
  let i = start;
  while (i < n && !NAME_STOP.has(source[i])) i++;
  let name = source.slice(start, i);
  if (name.length === 0) return null;
  // A trailing `=` glued to the name is the optional header equals, not
  // part of the name (`T={` / `T= {`) — but only when a `{` follows it;
  // `z^3-1=0(...)` keeps its `=` because the name does not end with one.
  if (name.endsWith('=')) {
    let k = i;
    while (k < n && (source[k] === ' ' || source[k] === '\t' || source[k] === '\r')) k++;
    if (source[k] === '{') {
      name = name.slice(0, -1);
      i = k;
    }
  }

  // Optional whitespace, then an optional symmetry marker `(SYM)`.
  while (i < n && (source[i] === ' ' || source[i] === '\t' || source[i] === '\r')) i++;
  let symmetry: string | undefined;
  if (source[i] === '(') {
    let k = i + 1;
    while (k < n && source[k] !== ')' && source[k] !== '\n') k++;
    if (source[k] !== ')') return null;
    const raw = source.slice(i + 1, k).trim();
    if (raw.length === 0 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
    symmetry = raw.toUpperCase();
    i = k + 1;
    while (i < n && (source[i] === ' ' || source[i] === '\t' || source[i] === '\r')) i++;
  }

  // Optional `[...]` option block (e.g. `[float=y function=sqr/exp]`). The
  // content is recorded verbatim; consumers decide what each option means.
  let options: string | undefined;
  if (source[i] === '[') {
    let k = i + 1;
    while (k < n && source[k] !== ']' && source[k] !== '\n' && source[k] !== '{') k++;
    if (source[k] !== ']') return null;
    options = source.slice(i + 1, k).trim();
    i = k + 1;
    while (i < n && (source[i] === ' ' || source[i] === '\t' || source[i] === '\r')) i++;
  }

  // Optional `=` before the opening brace (`Name = {` — a classic variant).
  if (source[i] === '=' && source[i + 1] !== '=') {
    let k = i + 1;
    while (k < n && (source[k] === ' ' || source[k] === '\t' || source[k] === '\r')) k++;
    if (source[k] === '{') i = k;
  }

  if (source[i] !== '{') return null;
  return {
    name,
    nameStart: start,
    nameEnd: start + name.length,
    ...(symmetry !== undefined ? { symmetry } : {}),
    ...(options !== undefined ? { options } : {}),
    braceOffset: i,
  };
}

interface BodyScan {
  /** Offset just past the closing `}` when closed, or end of source. */
  endOffset: number;
  closed: boolean;
}

/**
 * Scan an entry body starting just after the opening `{`, tracking brace
 * depth. `;` comments run to end of line and their braces never count.
 */
function scanBody(source: string, start: number): BodyScan {
  const n = source.length;
  let depth = 1;
  let i = start;
  while (i < n) {
    const ch = source[i];
    if (ch === ';') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    if (ch === '{') {
      depth++;
      i++;
      continue;
    }
    if (ch === '}') {
      depth--;
      i++;
      if (depth === 0) return { endOffset: i, closed: true };
      continue;
    }
    i++;
  }
  // Unclosed: report the boundary as broken and truncate at end of source.
  return { endOffset: n, closed: false };
}

/**
 * Scan a classic FRM source into its entries and diagnostics. The returned
 * ranges slice the original source exactly; the source is never modified.
 */
export function scanFrmEntries(source: string): FrmScanResult {
  const entries: FrmEntry[] = [];
  const diagnostics: FrmScanDiagnostic[] = [];
  const nameCounts = new Map<string, number>();
  const usedKeys = new Set<string>();
  const n = source.length;

  // A failed-header line that contains `{` may be a corrupted entry header
  // and stays blocking; bare prose lines (classic files carry `;`-less
  // comment paragraphs between entries) are annotated, never blocking.
  let trailingRegion: { start: number; end: number; kind: 'prose' | 'tokens' } | null = null;
  const closeTrailingRegion = () => {
    if (trailingRegion) {
      const isPreamble = entries.length === 0;
      const code: FrmScanDiagnosticCode = isPreamble
        ? 'preamble-content'
        : trailingRegion.kind === 'prose'
          ? 'prose-content'
          : 'trailing-tokens';
      diagnostics.push({
        code,
        message: isPreamble
          ? 'Non-entry content before the first formula entry'
          : trailingRegion.kind === 'prose'
            ? 'Bare prose paragraph between formula entries (annotated, non-blocking)'
            : 'Non-entry content outside any formula entry',
        offset: trailingRegion.start,
        endOffset: trailingRegion.end,
      });
      trailingRegion = null;
    }
  };

  let i = 0;
  while (i < n) {
    const contentStart = skipHorizontalWs(source, i);
    if (contentStart >= n) break;

    const ch = source[contentStart];

    // Blank line.
    if (ch === '\n') {
      closeTrailingRegion();
      i = contentStart + 1;
      continue;
    }

    // Comment line or brace-led separator block — file noise, never a header.
    if (ch === ';' || ch === '{') {
      closeTrailingRegion();
      i = skipToEol(source, contentStart);
      if (i < n) i++;
      continue;
    }

    const header = tryParseHeader(source, contentStart);
    if (!header) {
      // Non-header, non-comment content. Consecutive same-kind lines merge
      // into a single diagnostic region.
      const lineEnd = skipToEol(source, contentStart);
      const kind = source.slice(contentStart, lineEnd).includes('{') ? 'tokens' : 'prose';
      if (trailingRegion && trailingRegion.kind === kind) {
        trailingRegion.end = lineEnd;
      } else {
        closeTrailingRegion();
        trailingRegion = { start: contentStart, end: lineEnd, kind };
      }
      i = lineEnd < n ? lineEnd + 1 : lineEnd;
      continue;
    }

    closeTrailingRegion();

    const count = (nameCounts.get(header.name) ?? 0) + 1;
    nameCounts.set(header.name, count);
    // Keys must stay unique even when a literal name collides with a
    // generated suffix (e.g. entries `A#2`, `A`, `A`): bump the counter
    // until the candidate key is unused.
    let key = count === 1 ? header.name : `${header.name}#${count}`;
    let suffix = count;
    while (usedKeys.has(key)) {
      suffix += 1;
      key = `${header.name}#${suffix}`;
    }
    usedKeys.add(key);
    if (count > 1) {
      // Classic files carry intentional duplicates (authors re-release
      // formulas; `comment { }` doc blocks repeat per file). Keys stay
      // unique and selection is always by key, so this annotates instead of
      // blocking — a bare name deterministically resolves to the FIRST
      // occurrence, later ones need their `#2`/`#3` keys.
      diagnostics.push({
        code: 'duplicate-name',
        message: `Duplicate formula name "${header.name}" (entry key "${key}"; bare-name selection resolves to the first occurrence)`,
        offset: header.nameStart,
        endOffset: header.nameEnd,
        entryKey: key,
      });
    }

    const body = scanBody(source, header.braceOffset + 1);
    entries.push({
      key,
      name: header.name,
      ...(header.symmetry !== undefined ? { symmetry: header.symmetry } : {}),
      ...(header.options !== undefined ? { options: header.options } : {}),
      range: { startOffset: header.nameStart, endOffset: body.endOffset },
      headerRange: { startOffset: header.nameStart, endOffset: header.braceOffset + 1 },
    });

    if (!body.closed) {
      diagnostics.push({
        code: 'unclosed-brace',
        message: `Entry "${header.name}" is missing its closing brace; entry range truncated to end of file`,
        offset: header.braceOffset,
        endOffset: body.endOffset,
        entryKey: key,
      });
    }

    i = body.endOffset;
  }

  closeTrailingRegion();

  if (entries.length === 0) {
    diagnostics.push({
      code: 'no-entries',
      message: 'Source contains no formula entries',
      offset: 0,
      endOffset: n,
    });
  }

  return { entries, diagnostics };
}

/**
 * True when the result contains more than one entry, i.e. an explicit
 * selection key is required before any entry may be compiled.
 */
export function requiresSelection(result: FrmScanResult): boolean {
  return result.entries.length > 1;
}

/**
 * Resolve an entry by stable key. Without a key, the only entry of a
 * single-entry file is returned (implicit selection); multi-entry files
 * without a key resolve to null, as does any unknown key.
 */
export function selectFrmEntry(result: FrmScanResult, key?: string): FrmEntry | null {
  const { entries } = result;
  if (entries.length === 0) return null;
  if (!key) {
    return entries.length === 1 ? entries[0] : null;
  }
  return entries.find((entry) => entry.key === key) ?? null;
}
