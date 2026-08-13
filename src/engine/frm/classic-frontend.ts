/**
 * Classic FRM → native FRM source-to-source lowering (v0.4.18 Slice 1).
 *
 * Classic Fractint `.frm` bodies use comma/newline statement separators, a
 * `:` transition from the init section to the loop section, an implicit
 * bailout predicate as the last non-assignment expression, `;` line
 * comments, CRLF line endings, `(SYM)` header symmetry markers, and
 * hyphen/digit-led header names. The native frontend instead uses explicit
 * `init:` / `loop:` / `bailout:` sections, keyword `if`/`else`/`endif`
 * statements, and lexer-valid identifiers.
 *
 * This module lowers a single scanned classic entry (header included) into
 * an equivalent native source string plus line/column provenance for
 * diagnostic back-referencing and a structured note list describing every
 * adaptation applied. The lowered source flows through
 * the existing `compileFrmDetailed` pipeline unchanged (docs/specs/
 * frm-compatibility-v1.md §1).
 *
 * Mapping rules (corpus-verified):
 * - header name kept verbatim unless it is not lexer-safe, then sanitised
 *   (`-` and other non-alphanumerics → `_`, leading digit prefixed `_`);
 * - `(SYM)` header symmetry stripped and recorded as a note;
 * - `;` comments stripped (native lexer would accept them, but the
 *   lowering makes the IR comment-free);
 * - `\r\n` / stray `\r` normalized to `\n`;
 * - a classic backslash at the end of a code line joins the following
 *   physical line before tokenization (comments never participate);
 * - statements before the first top-level `:` become `init:` lines; the
 *   remaining statements become `loop:` lines (additional colons are
 *   statement separators, matching Fractint);
 * - the last non-assignment statement is the bailout predicate and becomes
 *   the `bailout:` expression; an absent predicate defaults to `|z| < 4`
 *   (Fractint's default bailout);
 * - `bailout=<value>` is an assignment and stays in its section (the
 *   variable is renamed because the native parser treats a statement
 *   starting with the `bailout` keyword as a section header);
 * - classic assignments to the native read-only `c` are lowered to a fresh
 *   mutable `cclassic[N]` variable seeded from framework `c`; references in
 *   init, loop, and bailout follow the same rename so Mandelbrot and Julia
 *   modes retain classic cross-iteration state honestly;
 * - chained assignments `a = b = expr` are split into ordered single
 *   assignments (`b = expr`, `a = b`) so the native assignment grammar can
 *   express them; a chained `z = c = pixel` therefore becomes ordered
 *   assignments to the renamed mutable `cclassic[N]` and then `z`;
 * - the body is fully case-insensitive in classic semantics (`Real` ≡
 *   `real`, `Z` ≡ `z`), so it is lowercased once before tokenization —
 *   entry names come from the header parse and keep their case;
 * - header `[...]` option blocks are recorded verbatim; `function=`
 *   pre-specifies fn slot defaults (mapped to engine fn-option keys where
 *   known, raw otherwise) and `float=` is provenance-only (the engine is
 *   always float);
 * - `IF (...) ... ELSE ... ENDIF` (any case, inline or line-based) is
 *   lowered to native `if`/`else`/`endif` keyword statements;
 * - non-comment text trailing the header `{` that cannot start a statement
 *   (e.g. `Name {was modified by ...`) is ignored, matching how the
 *   classic sources treat header notes.
 *
 * Known limitations (documented, not silently hidden):
 * - chained assignments nested inside parentheses are passed through;
 * - predicate extraction considers the last top-level (outside `if`)
 *   non-assignment expression only.
 */

import { FN_SLOT_OPTIONS } from './builtins';

/** Structured note describing one adaptation applied during lowering. */
export interface LoweringNote {
  kind:
    | 'comment-stripped'
    | 'default-bailout'
    | 'symmetry-recorded'
    | 'name-sanitised'
    | 'crlf-normalized'
    | 'c-pixel-assignment-removed'
    | 'bailout-variable-renamed'
    | 'bailout-magnitude-normalized'
    | 'chained-assignment-split'
    | 'header-trailing-text-ignored'
    | 'float-option-recorded'
    | 'function-option-recorded'
    | 'function-option-unmapped'
    | 'c-init-rebinding-renamed'
    | 'builtin-name-recased'
    | 'reserved-word-renamed'
    | 'unary-call-complex-pair'
    | 'line-continuation-joined';
  /** 1-based line in the classic entry source. */
  line: number;
  message: string;
}

/** A 1-based location in the selected classic entry source. */
export interface ClassicSourceLocation {
  line: number;
  col: number;
}

/** Result of lowering one classic entry to native syntax. */
export interface LoweredClassicEntry {
  /** Native-syntax source; safe to feed to `compileFrmDetailed`. */
  native: string;
  /** `lineMap[nativeLine - 1]` = 1-based classic source line. */
  lineMap: number[];
  /** Per-generated-line provenance back to the selected classic entry. */
  locationMap: Array<{
    /** 1-based line/column anchor in the selected classic entry. */
    line: number;
    col: number;
    /** 1-based column where source-derived text starts on the native line. */
    generatedCol: number;
    /**
     * `columnMap[nativeColumn - 1]` gives the source-facing location used for
     * diagnostics. Matched source characters are exact; characters inserted
     * by lowering inherit the nearest stable source anchor.
     */
    columnMap: ClassicSourceLocation[];
  }>;
  notes: LoweringNote[];
  /** The generated c-rebinding seed target (`cclassic[N]`) when the
   * rename fired — provenance marker consumed by the C2 init-binding
   * analysis so only the GENERATED seed is transparent, never user code. */
  cSeedTarget?: string;
  /** Raw `[...]` option block content from the header, when present. */
  options?: string;
  /**
   * `function=fn1/fn2/...` bracket defaults, mapped positionally to fn
   * slots. Names matching the engine's fn options are canonicalized
   * (`ident` → `identity`); unknown names pass through raw so consumers
   * (orbit fixtures, future UI plumbing) see the original intent instead
   * of a silently wrong default.
   */
  fnDefaults?: Record<string, string>;
}

/** Characters that terminate a header name token (mirrors scanner). */
const NAME_STOP = new Set([' ', '\t', '\r', '\n', '(', '{', '}', ';', '[']);

interface ParsedHeader {
  name: string;
  symmetry?: string;
  /** Raw `[...]` option block content (e.g. `float=y function=sqr/exp`). */
  options?: string;
  /** Offset (in the header line) of the opening `{`. */
  braceOffset: number;
}

function parseClassicHeader(line: string): ParsedHeader | null {
  let i = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
  const nameStart = i;
  while (i < line.length && !NAME_STOP.has(line[i])) i++;
  let name = line.slice(nameStart, i);
  if (name.length === 0) return null;
  // A trailing `=` glued to the name is the optional header equals, not
  // part of the name (`T={` / `T= {`) — only when a `{` directly follows.
  if (name.endsWith('=')) {
    let k = i;
    while (k < line.length && (line[k] === ' ' || line[k] === '\t')) k++;
    if (line[k] === '{') {
      name = name.slice(0, -1);
      i = k;
    }
  }

  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
  let symmetry: string | undefined;
  if (line[i] === '(') {
    const close = line.indexOf(')', i + 1);
    if (close === -1) return null;
    const raw = line.slice(i + 1, close).trim();
    if (raw.length === 0 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
    symmetry = raw.toUpperCase();
    i = close + 1;
    while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
  }
  let options: string | undefined;
  if (line[i] === '[') {
    const close = line.indexOf(']', i + 1);
    if (close === -1) return null;
    options = line.slice(i + 1, close).trim();
    i = close + 1;
    while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
  }
  // Optional `=` before the opening brace (`Name = {` — a classic variant).
  if (line[i] === '=' && line[i + 1] !== '=') {
    let k = i + 1;
    while (k < line.length && (line[k] === ' ' || line[k] === '\t')) k++;
    if (line[k] === '{') i = k;
  }
  if (line[i] !== '{') return null;
  return {
    name,
    ...(symmetry !== undefined ? { symmetry } : {}),
    ...(options !== undefined ? { options } : {}),
    braceOffset: i,
  };
}

/** Make a header name lexer-safe: non-alphanumerics → `_`, digit prefix `_`. */
function sanitiseName(name: string): string {
  let out = name.replace(/[^a-zA-Z0-9_]/g, '_');
  if (/^[0-9]/.test(out)) out = `_${out}`;
  return out;
}

/** True when the text is wrapped in one matching pair of parentheses. */
function isFullyParenWrapped(text: string): boolean {
  if (text.length < 2 || text[0] !== '(') return false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return i === text.length - 1;
    }
  }
  return false;
}

/** True when the expression is a top-level assignment (`ident = ...`). */
function isAssignmentExpr(text: string): boolean {
  const m = /^[a-zA-Z_][a-zA-Z0-9_]*\s*=/.exec(text);
  if (!m) return false;
  // The matched `=` must be a plain assignment operator, not the start of
  // `==` (equality) — and the character before it (if any) must not turn it
  // into `<=`, `>=`, `!=` either (defensive; the identifier prefix normally
  // prevents this).
  const eqIndex = m[0].length - 1;
  if (text[eqIndex + 1] === '=') return false;
  if (eqIndex > 0 && '=!<>'.includes(text[eqIndex - 1]) && !/\s/.test(text[eqIndex - 1])) return false;
  return true;
}

/**
 * Split a chained assignment `a = b = expr` into ordered single
 * assignments: `b = expr`, `a = b`. Only top-level assignment `=`
 * (outside parentheses, not part of `==`/`!=`/`<=`/`>=`) participates; a
 * plain assignment is returned unchanged.
 */
function splitChainedAssignment(text: string): string[] {
  if (!isAssignmentExpr(text)) return [text];
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === '=' && depth === 0) {
      const prev = text[i - 1];
      const next = text[i + 1];
      // Skip comparison operators: ==, <=, >=, !=
      if (next === '=' || prev === '=' || prev === '!' || prev === '<' || prev === '>') continue;
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  if (parts.length <= 2) return [text];
  const out: string[] = [];
  for (let i = parts.length - 2; i >= 0; i--) {
    out.push(`${parts[i]} = ${parts[i + 1]}`);
  }
  return out;
}

interface BodyToken {
  type: 'expr' | 'if' | 'else' | 'elseif' | 'endif';
  /** expr: lowered expression text; if/elseif: lowered condition text. */
  text: string;
  /** Token text before any length-changing lowering rewrite. */
  sourceText: string;
  /** Exact source location for every character in `sourceText`. */
  sourceMap: ClassicSourceLocation[];
  /** O(1) leading-whitespace tracking while the walker appends chars. */
  hasNonWhitespace: boolean;
  /** 1-based classic line where the token started. */
  line: number;
  /** 1-based classic column where the token started. */
  col: number;
}

interface WalkResult {
  tokens: BodyToken[];
  /** Number of tokens that belong to the init section (before first `:`). */
  boundary: number;
  /** 1-based classic line of the first top-level colon, or 0. */
  colonLine: number;
  /** 1-based classic column of the first top-level colon, or 0. */
  colonCol: number;
  /** 1-based classic line of the entry closing brace. */
  closeLine: number;
  /** 1-based classic column of the entry closing brace. */
  closeCol: number;
}

const KEYWORD_RE = /^(if|else|elseif|endif)(?![a-zA-Z0-9_])/i;

function newBodyToken(
  type: BodyToken['type'],
  line: number,
  col: number,
): BodyToken {
  return {
    type,
    text: '',
    sourceText: '',
    sourceMap: [],
    hasNonWhitespace: false,
    line,
    col,
  };
}

function appendOriginChar(
  token: BodyToken,
  ch: string,
  line: number,
  col: number,
): void {
  token.sourceText += ch;
  token.sourceMap.push({ line, col });
}

function appendSourceChar(
  token: BodyToken,
  ch: string,
  line: number,
  col: number,
): void {
  token.text += ch;
  token.sourceMap.push({ line, col });
  if (!/[ \t\r]/.test(ch)) token.hasNonWhitespace = true;
}

const MAX_SOURCE_MAP_ALIGNMENT_CELLS = 262_144;
const MAX_SOURCE_MAP_ALIGNMENT_DIMENSION = 4_096;

function alignGeneratedTextToSource(
  generated: string,
  sourceText: string,
  sourceMap: readonly ClassicSourceLocation[],
  fallback: ClassicSourceLocation,
): ClassicSourceLocation[] {
  if (generated.length === 0) return [];
  if (sourceText.length === 0 || sourceMap.length !== sourceText.length) {
    return Array.from({ length: generated.length }, () => fallback);
  }

  const generatedFolded = generated.toLowerCase();
  const sourceFolded = sourceText.toLowerCase();
  if (generatedFolded === sourceFolded) return [...sourceMap];
  const matches = new Map<number, number>();

  if (
    generated.length <= MAX_SOURCE_MAP_ALIGNMENT_DIMENSION &&
    sourceText.length <= MAX_SOURCE_MAP_ALIGNMENT_DIMENSION &&
    generated.length * sourceText.length <=
    MAX_SOURCE_MAP_ALIGNMENT_CELLS
  ) {
    const rows = Array.from(
      { length: generated.length + 1 },
      () => new Uint32Array(sourceText.length + 1),
    );
    for (let i = 1; i <= generated.length; i++) {
      for (let j = 1; j <= sourceText.length; j++) {
        rows[i][j] =
          generatedFolded[i - 1] === sourceFolded[j - 1]
            ? rows[i - 1][j - 1] + 1
            : Math.max(rows[i - 1][j], rows[i][j - 1]);
      }
    }
    let i = generated.length;
    let j = sourceText.length;
    while (i > 0 && j > 0) {
      const current = rows[i][j];
      // Multiple LCS paths are common after an identifier expansion such as
      // `c` -> `cclassic`: both `c` characters in the generated identifier
      // can produce the same LCS length. Prefer the earliest generated/source
      // occurrence so a diagnostic at the identifier start maps back to the
      // original identifier start, not to preceding punctuation or spacing.
      if (rows[i - 1][j] === current) {
        i--;
      } else if (rows[i][j - 1] === current) {
        j--;
      } else {
        // The DP recurrence guarantees the remaining path is a matching
        // diagonal; the other two branches already cover every non-match.
        matches.set(i - 1, j - 1);
        i--;
        j--;
      }
    }
  } else {
    // Constant-space fallback for adversarially long single-line expressions.
    // Keep exact anchors for the unchanged prefix and suffix; the unmatched
    // middle inherits its nearest stable anchor below. This is intentionally
    // more conservative than the bounded LCS path, but strictly O(g + s).
    let prefixLength = 0;
    const sharedLength = Math.min(generated.length, sourceText.length);
    while (
      prefixLength < sharedLength &&
      generatedFolded[prefixLength] === sourceFolded[prefixLength]
    ) {
      matches.set(prefixLength, prefixLength);
      prefixLength++;
    }

    let generatedIndex = generated.length - 1;
    let sourceIndex = sourceText.length - 1;
    while (
      generatedIndex >= prefixLength &&
      sourceIndex >= prefixLength &&
      generatedFolded[generatedIndex] === sourceFolded[sourceIndex]
    ) {
      matches.set(generatedIndex, sourceIndex);
      generatedIndex--;
      sourceIndex--;
    }
  }

  const exact = Array.from({ length: generated.length }, (_, index) => {
    const sourceIndex = matches.get(index);
    return sourceIndex === undefined ? undefined : sourceMap[sourceIndex];
  });
  let previous: ClassicSourceLocation | undefined;
  for (let index = 0; index < exact.length; index++) {
    if (exact[index]) previous = exact[index];
    else if (previous) exact[index] = previous;
  }
  let next: ClassicSourceLocation | undefined;
  for (let index = exact.length - 1; index >= 0; index--) {
    if (exact[index]) next = exact[index];
    else if (next) exact[index] = next;
  }
  return exact.map((location) => location ?? fallback);
}

// This marker represents the physical newline removed by a classic `\\`
// continuation.  `walkBody` consumes it without ending the current token,
// but still advances its physical source-line counter.  Consequently a
// joined statement keeps the first line as its diagnostic line while later
// statements retain their real physical lines.
const LINE_CONTINUATION_MARKER = '\u0000';

/**
 * Join classic code lines ending in `\\`, leaving comments untouched.
 *
 * The marker preserves physical line accounting for `walkBody`; it is never
 * emitted into native source.  A continuation immediately followed by the
 * entry's closing brace (or EOF) has no statement to continue and is an
 * honest source error rather than an implicit deletion of the backslash.
 */
function joinClassicLineContinuations(body: string, notes: LoweringNote[]): { text: string; physicalLines: number[] } {
  const lines = body.split('\n');
  let joined = 0;
  let firstLine = 0;
  const isClosingBraceLine = (line: string): boolean => {
    const code = line.slice(0, line.indexOf(';') === -1 ? line.length : line.indexOf(';'));
    return code.trimStart().startsWith('}');
  };

  const out: string[] = [];
  /** physicalLines[logical index] = 1-based body-relative physical line. */
  const physicalLines: number[] = [];
  let logical = 0;
  let previousContinued = false;
  for (let i = 0; i < lines.length; i++) {
    const semi = lines[i].indexOf(';');
    const code = semi === -1 ? lines[i] : lines[i].slice(0, semi);
    // Continuation is a backslash at the TRUE physical end of the line.
    // A comment anywhere on the line (`code \; note` or `; note \`) makes
    // the slash ordinary text — joining would swallow the next physical
    // line into the comment (Codex 6b1 round-2).
    const continues = semi === -1 && lines[i].endsWith('\\');
    if (continues && (i === lines.length - 1 || isClosingBraceLine(lines[i + 1]))) {
      throw new Error(`Classic line continuation at line ${i + 1} has no following statement`);
    }
    const transformed = continues
      ? `${lines[i].slice(0, code.length - 1)}${LINE_CONTINUATION_MARKER}${lines[i].slice(code.length)}`
      : lines[i];
    // A continuation replaces the following newline, so do not add one
    // before this line when the preceding line continued.
    if (i > 0 && !previousContinued) out.push('\n');
    if (!previousContinued) {
      // A new logical line starts at physical line i (1-based).
      physicalLines[logical] = i + 1;
    }
    out.push(transformed);
    if (continues) {
      joined++;
      if (!firstLine) firstLine = i + 1;
    } else {
      logical++;
    }
    previousContinued = continues;
  }

  if (joined > 0) {
    notes.push({
      kind: 'line-continuation-joined',
      line: firstLine,
      message: `${joined} classic backslash line continuation(s) joined before tokenization`,
    });
  }
  return { text: out.join(''), physicalLines };
}

/**
 * Tokenize a classic body into expression and structural tokens. Comments,
 * separators (`,`, newline, `:`), and the closing `}` are consumed here.
 */
function walkBody(
  body: string,
  startLine: number,
  startCol: number,
  notes: LoweringNote[],
): WalkResult {
  const tokens: BodyToken[] = [];
  let current: BodyToken | null = null;
  let parenDepth = 0;
  let line = startLine;
  let col = startCol;
  let boundary = -1;
  let colonLine = 0;
  let colonCol = 0;
  let closeLine = 0;
  let closeCol = 0;

  const endCurrent = () => {
    if (current) {
      const leading = current.text.length - current.text.trimStart().length;
      const trailing = current.text.length - current.text.trimEnd().length;
      const end = current.text.length - trailing;
      const text = current.text.slice(leading, end);
      if (text.length > 0 || current.type !== 'expr') {
        current.text = text;
        current.sourceText = text;
        current.sourceMap = current.sourceMap.slice(leading, end);
        tokens.push(current);
      }
      current = null;
    }
  };

  let i = 0;
  const n = body.length;
  while (i < n) {
    const ch = body[i];

    if (ch === LINE_CONTINUATION_MARKER) {
      // This is a removed `\\` plus its following physical newline. Keep
      // the current token open, but account for the original line break.
      line++;
      col = 1;
      i++;
      continue;
    }

    if (ch === '\n') {
      endCurrent();
      line++;
      col = 1;
      i++;
      continue;
    }

    if (ch === ';') {
      notes.push({
        kind: 'comment-stripped',
        line,
        message: 'Classic `;` comment removed during lowering',
      });
      while (i < n && body[i] !== '\n') {
        i++;
        col++;
      }
      continue;
    }

    // Structural keywords are recognized only at statement starts.
    if (current === null && parenDepth === 0 && /[a-zA-Z_]/.test(ch)) {
      const m = KEYWORD_RE.exec(body.slice(i));
      if (m) {
        const kw = m[1].toLowerCase();
        const tokenCol = col;
        i += m[1].length;
        col += m[1].length;
        if (kw === 'else' || kw === 'endif') {
          const token = newBodyToken(kw, line, tokenCol);
          for (let offset = 0; offset < m[1].length; offset++) {
            appendOriginChar(token, m[1][offset], line, tokenCol + offset);
          }
          tokens.push(token);
        } else {
          // if / elseif: the condition is the rest of this token.
          current = newBodyToken(
            kw === 'elseif' ? 'elseif' : 'if',
            line,
            tokenCol,
          );
        }
        continue;
      }
    }

    if (ch === '(') {
      parenDepth++;
      if (!current) current = newBodyToken('expr', line, col);
      if (current.type === 'expr' && !current.hasNonWhitespace) {
        current.col = col;
      }
      appendSourceChar(current, ch, line, col);
      i++;
      col++;
      continue;
    }
    if (ch === ')') {
      if (parenDepth > 0) parenDepth--;
      if (current) appendSourceChar(current, ch, line, col);
      i++;
      col++;
      continue;
    }
    if (ch === ',') {
      if (parenDepth === 0) endCurrent();
      else if (current) appendSourceChar(current, ch, line, col);
      i++;
      col++;
      continue;
    }
    if (ch === ':') {
      if (parenDepth === 0) {
        endCurrent();
        if (boundary === -1) {
          boundary = tokens.length;
          colonLine = line;
          colonCol = col;
        }
      } else if (current) {
        appendSourceChar(current, ch, line, col);
      }
      i++;
      col++;
      continue;
    }
    if (ch === '}') {
      if (parenDepth === 0) {
        endCurrent();
        closeLine = line;
        closeCol = col;
        break;
      }
      if (current) appendSourceChar(current, ch, line, col);
      i++;
      col++;
      continue;
    }

    if (!current) current = newBodyToken('expr', line, col);
    if (
      current.type === 'expr' &&
      !current.hasNonWhitespace &&
      !/[ \t\r]/.test(ch)
    ) {
      current.col = col;
    }
    appendSourceChar(current, ch, line, col);
    i++;
    col++;
  }

  endCurrent();
  if (closeLine === 0) closeLine = line;
  if (closeCol === 0) closeCol = col;

  return {
    tokens,
    boundary: boundary === -1 ? tokens.length : boundary,
    colonLine,
    colonCol,
    closeLine,
    closeCol,
  };
}

/** 1-based line of `offset` in `source`. */
function lineOfOffset(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

/**
 * Lower one classic entry source (header included, exactly as sliced by
 * `scanFrmEntries`) into an equivalent native source. Throws on an
 * unparsable header; the scanner guarantees headers are well-formed.
 */
/**
 * Parser-protected variables that classic sources may nevertheless rebind:
 * the lowering below rewrites such assignments into a fresh mutable seed
 * variable before the parser's protection applies. The capability manifest
 * derives its `classicRebindable` fact from this list (Slice 7a review).
 */
export const CLASSIC_REBINDABLE_VARIABLES = ['c'] as const;

export function lowerClassicEntryToNative(entrySource: string): LoweredClassicEntry {
  const notes: LoweringNote[] = [];

  // CRLF normalization (covers \r\n and stray \r).
  let normalized = entrySource;
  if (normalized.includes('\r')) {
    const firstCr = normalized.indexOf('\r');
    notes.push({
      kind: 'crlf-normalized',
      line: lineOfOffset(entrySource, firstCr),
      message: 'Carriage returns normalized to LF',
    });
    normalized = normalized.replace(/\r/g, '');
  }

  const lines = normalized.split('\n');
  const header = parseClassicHeader(lines[0]);
  if (!header) {
    throw new Error(`Classic entry has an unparsable header line: ${JSON.stringify(lines[0])}`);
  }

  const name = sanitiseName(header.name);
  if (name !== header.name) {
    notes.push({
      kind: 'name-sanitised',
      line: 1,
      message: `Header name "${header.name}" sanitised to "${name}" for native syntax`,
    });
  }
  if (header.symmetry) {
    notes.push({
      kind: 'symmetry-recorded',
      line: 1,
      message: `Header symmetry (${header.symmetry}) recorded; native syntax has no symmetry concept`,
    });
  }

  // Header `[...]` options: `float=` selects the classic float code path
  // (the engine is always float — recorded for provenance only);
  // `function=a/b/c` pre-specifies the fn slots positionally (classic would
  // otherwise prompt at run time — see fractint.hlp fn1..fn4).
  let fnDefaults: Record<string, string> | undefined;
  if (header.options) {
    const FN_DEFAULT_CANONICAL: Record<string, string> = { ident: 'identity' };
    // Derive from FN_SLOT_OPTIONS — a hand-maintained list drifts (cosxx
    // was added to the engine and this set falsely reported it unmapped).
    const KNOWN_FN = new Set(FN_SLOT_OPTIONS.map((o) => o.key));
    for (const token of header.options.split(/\s+/)) {
      const eq = token.indexOf('=');
      if (eq <= 0) continue;
      const key = token.slice(0, eq).toLowerCase();
      const value = token.slice(eq + 1);
      if (key === 'float') {
        notes.push({
          kind: 'float-option-recorded',
          line: 1,
          message: `Header option float=${value} recorded; the engine always evaluates in float`,
        });
      } else if (key === 'function') {
        fnDefaults = fnDefaults ?? {};
        const slots = value.split('/');
        for (let s = 0; s < slots.length && s < 4; s++) {
          const rawName = slots[s].trim().toLowerCase();
          if (!rawName) continue;
          const canonical = FN_DEFAULT_CANONICAL[rawName] ?? rawName;
          if (KNOWN_FN.has(canonical)) {
            fnDefaults[`fn${s + 1}`] = canonical;
            notes.push({
              kind: 'function-option-recorded',
              line: 1,
              message: `Header function= sets fn${s + 1} default to ${canonical}`,
            });
          } else {
            fnDefaults[`fn${s + 1}`] = rawName;
            notes.push({
              kind: 'function-option-unmapped',
              line: 1,
              message: `Header function= name "${rawName}" (fn${s + 1}) has no engine equivalent; recorded raw — consumers must not treat the slot default as the classic intent`,
            });
          }
        }
      }
    }
  }

  // Body text: remainder of the header line after `{`, then every line up
  // to the entry's closing brace. Non-comment text after `{` that cannot
  // start a statement (classic header notes like "was modified by ...")
  // is skipped.
  let bodyStart = header.braceOffset + 1;
  const headerRest = lines[0].slice(bodyStart);
  const headerRestTrimmed = headerRest.trimStart();
  if (headerRestTrimmed.length > 0 && !headerRestTrimmed.startsWith(';')) {
    const looksLikeCode =
      /^(?:[a-zA-Z_][a-zA-Z0-9_]*\s*=|if[\s(]|else\b|elseif\b|endif\b|[|(\-0-9])/i.test(
        headerRestTrimmed,
      );
    if (!looksLikeCode) {
      notes.push({
        kind: 'header-trailing-text-ignored',
        line: 1,
        message: `Non-statement text after the header brace ignored: ${JSON.stringify(
          headerRestTrimmed.slice(0, 60),
        )}`,
      });
      bodyStart = lines[0].length;
    }
  }
  const bodyText = normalized.slice(bodyStart);
  // Classic FRM is fully case-insensitive (`Real` ≡ `real`, `Z` ≡ `z`,
  // `IF` ≡ `if`); the native parser is case-sensitive. Lowercase the body
  // once, before tokenization — entry names come from the header parse and
  // are unaffected.
  const joinedBody = joinClassicLineContinuations(bodyText.toLowerCase(), notes);
  const walk = walkBody(joinedBody.text, 1, bodyStart + 1, notes);

  // 5b — three classic-dialect text rules. Apply them AFTER walkBody so
  // source positions come from the original classic text; length-changing
  // rewrites (for example exp(1.,0.) → exp((1.,0.))) must not shift the
  // column of a later comma-separated statement on the same source line.
  const PAIR_FN_NAMES = ['sin', 'cos', 'cosxx', 'cotanh', 'tan', 'sinh', 'cosh', 'tanh', 'exp', 'log', 'sqrt', 'abs', 'sqr', 'conj', 'flip', 'recip', 'cabs', 'real', 'imag', 'fn1', 'fn2', 'fn3', 'fn4'];
  const pairRe = new RegExp(
    `\\b(${PAIR_FN_NAMES.join('|')})\\s*\\(\\s*([^(),]+?)\\s*,\\s*([^(),]+?)\\s*\\)`,
    'g',
  );
  let recased = 0;
  let recasedLine = 0;
  let constRenamed = false;
  let constLine = 0;
  let pairWrapped = 0;
  let pairLine = 0;
  for (const token of walk.tokens) {
    token.text = token.text.replace(/\blastsqr\b/g, () => {
      recased++;
      if (!recasedLine) recasedLine = token.line;
      return 'LastSqr';
    });
    token.text = token.text.replace(/\bconst\b/g, () => {
      constRenamed = true;
      if (!constLine) constLine = token.line;
      return 'const_';
    });
    token.text = token.text.replace(pairRe, (_m, fn, a, b) => {
      pairWrapped++;
      if (!pairLine) pairLine = token.line;
      return `${fn}((${a},${b}))`;
    });
  }
  if (recased > 0) {
    notes.push({
      kind: 'builtin-name-recased',
      line: recasedLine,
      message: `${recased} classic LastSqr builtin reference(s) re-canonicalized after the case-insensitive lowercase pass`,
    });
  }
  if (constRenamed) {
    notes.push({
      kind: 'reserved-word-renamed',
      line: constLine,
      message: 'classic variable `const` renamed to `const_` (GLSL-reserved; classic reserves only operator symbols)',
    });
  }
  if (pairWrapped > 0) {
    notes.push({
      kind: 'unary-call-complex-pair',
      line: pairLine,
      message: `${pairWrapped} unary call(s) with a bare complex pair wrapped as a complex literal (classic fn(a,b) ≡ fn((a,b)))`,
    });
  }

  const initTokens = walk.tokens.slice(0, walk.boundary);
  const loopTokens = walk.tokens.slice(walk.boundary);

  // Predicate: the last expression outside any `if` block. Non-assignment
  // expressions are bailout tests in Fractint (comparisons such as
  // `|z| <= 4`, `iter>0`, or bare variables such as `PHC_bailout`).
  let predicate: BodyToken | null = null;
  {
    let depth = 0;
    let lastTopLevel: BodyToken | null = null;
    for (const token of loopTokens) {
      // `elseif` stays at the same nesting level — only `if` opens a new
      // block and `endif` closes one.
      if (token.type === 'if') depth++;
      else if (token.type === 'endif') depth = Math.max(0, depth - 1);
      else if (token.type === 'expr' && depth === 0) lastTopLevel = token;
    }
    if (lastTopLevel && !isAssignmentExpr(lastTopLevel.text)) predicate = lastTopLevel;
  }
  const loopBodyTokens = predicate
    ? loopTokens.filter((t) => t !== predicate)
    : loopTokens;

  let bailoutText = predicate ? predicate.text : '|z| < 4';
  const bailoutSourceText = predicate?.sourceText ?? '';
  const bailoutSourceMap = predicate?.sourceMap ?? [];
  const bailoutLine = predicate ? predicate.line : (loopBodyTokens.at(-1)?.line ?? walk.colonLine) || walk.closeLine;
  const bailoutCol = predicate
    ? predicate.col
    : (loopBodyTokens.at(-1)?.col ?? walk.colonCol) || walk.closeCol;
  if (!predicate) {
    notes.push({
      kind: 'default-bailout',
      line: bailoutLine,
      message: 'No bailout predicate found; defaulting to |z| < 4 (Fractint default)',
    });
  }

  // Classic magnitude shorthand: a bare `z` in a comparison predicate means
  // |z| in Fractint semantics (`z<=4` ≡ `|z| <= 4`; swapped `4>=z` ≡
  // `|z| <= 4` with the direction flipped). Normalize here so the strict v2
  // descriptor contract (which only accepts |z|, |real(z)|, or real(z))
  // sees the intended form.
  const flipCmp: Record<string, string> = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' };
  if (/^z\s*(<=|>=|<|>)/.test(bailoutText)) {
    bailoutText = bailoutText.replace(/^z\s*(?=(?:<=|>=|<|>))/, '|z|');
    notes.push({
      kind: 'bailout-magnitude-normalized',
      line: bailoutLine,
      message: 'Bare `z` in the bailout predicate normalized to |z| (Fractint magnitude shorthand)',
    });
  } else {
    const swapped = /^(.+?)\s*(<=|>=|<|>)\s*z$/.exec(bailoutText);
    if (swapped) {
      bailoutText = `|z| ${flipCmp[swapped[2]]} ${swapped[1]}`;
      notes.push({
        kind: 'bailout-magnitude-normalized',
        line: bailoutLine,
        message:
          'Swapped bare `z` bailout normalized to |z| with the direction flipped (Fractint magnitude shorthand)',
      });
    }
  }

  // Variable `bailout` rename: the native parser treats a statement that
  // starts with the `bailout` keyword as a section header.
  const hasBailoutVar = [...initTokens, ...loopBodyTokens].some((t) =>
    t.type === 'expr' && /\bbailout\b/.test(t.text),
  );
  const renameBailout = (text: string): string => text.replace(/\bbailout\b/g, 'bailoutVar');
  if (hasBailoutVar) {
    const firstLine =
      [...initTokens, ...loopBodyTokens].find((t) => t.type === 'expr' && /\bbailout\b/.test(t.text))
        ?.line ?? 1;
    notes.push({
      kind: 'bailout-variable-renamed',
      line: firstLine,
      message: 'Classic `bailout` variable renamed to `bailoutVar` (native section keyword)',
    });
  }

  // Flatten each section into single-assignment statement lines. `c`
  // assignments are deliberately retained here; the stateful rename below
  // handles init and loop writes uniformly.
  interface Stmt {
    text: string;
    line: number;
    col: number;
    sourceText: string;
    sourceMap: ClassicSourceLocation[];
    kind: 'stmt' | 'if' | 'else' | 'elseif' | 'endif';
  }
  const flatten = (tokensIn: BodyToken[]): Stmt[] => {
    const out: Stmt[] = [];
    for (const token of tokensIn) {
      if (token.type !== 'expr') {
        const kind = token.type === 'if' || token.type === 'else' || token.type === 'elseif' || token.type === 'endif' ? token.type : 'stmt';
        out.push({
          text: token.text,
          line: token.line,
          col: token.col,
          sourceText: token.sourceText,
          sourceMap: token.sourceMap,
          kind,
        });
        continue;
      }
      const text = renameBailout(token.text);
      const pieces = splitChainedAssignment(text);
      if (pieces.length > 1 && pieces.join(' ') !== text.replace(/\s+/g, ' ')) {
        notes.push({
          kind: 'chained-assignment-split',
          line: token.line,
          message: `Chained assignment split into single assignments: ${pieces.join('; ')}`,
        });
      }
      for (const piece of pieces) {
        // No c=pixel deletion anywhere: in Julia mode an init `c = pixel`
        // is a real rebind (replacing the Julia constant), and in the loop
        // it is a per-iteration reset — both are expressed by the
        // c-rebinding rename below (Slice 5c). Nothing is dropped.
        out.push({
          text: piece,
          line: token.line,
          col: token.col,
          sourceText: token.sourceText,
          sourceMap: token.sourceMap,
          kind: 'stmt',
        });
      }
    }
    return out;
  };

  const initStmts = flatten(initTokens);
  const loopStmts = flatten(loopBodyTokens);
  if (predicate) bailoutText = renameBailout(bailoutText);

  // `c` rebinding (init AND/OR loop): classic pre-seeds `c` at entry
  // (Mandelbrot: pixel; Julia: the julia constant) and treats it as
  // ordinary mutable state — init may rebind it, the loop may keep
  // evolving it (j1: `c = c + p2`). Native reserves `c` as the read-only
  // runtime constant, so any `c` assignment lowers to a fresh mutable
  // variable seeded from the framework `c` (correct for both modes:
  // Mandelbrot c == point, Julia c == u_juliaC), and every `c` reference
  // (init, loop, bailout) reads the fresh variable. The prelude declares
  // it as a module-scope mutable — persistence across iterateStep calls
  // within the fragment is exactly classic cross-iteration state.
  const C_ASSIGN_RE = /^c\s*=(?![=])/;
  const initHasCRebind = initStmts.some(
    (s) => s.kind === 'stmt' && C_ASSIGN_RE.test(s.text),
  );
  const loopHasCAssign = loopStmts.some(
    (s) => s.kind === 'stmt' && C_ASSIGN_RE.test(s.text),
  );
  let cSeedTarget: string | undefined;
  if (initHasCRebind || loopHasCAssign) {
    let fresh = 'cclassic';
    const allText = () =>
      [...initStmts, ...loopStmts].map((s) => s.text).join('\n') + '\n' + bailoutText;
    for (let suffix = 2; new RegExp(`\\b${fresh}\\b`).test(allText()); suffix++) {
      fresh = `cclassic${suffix}`;
    }
    cSeedTarget = fresh;
    const renameC = (text: string) => text.replace(/\bc\b/g, fresh);
    for (const s of initStmts) s.text = renameC(s.text);
    for (const s of loopStmts) s.text = renameC(s.text);
    bailoutText = renameC(bailoutText);
    const firstLine =
      initStmts.find((s) => s.kind === 'stmt' && s.text.startsWith(`${fresh} `))?.line ??
      initStmts.find((s) => s.kind === 'stmt' && s.text.startsWith(`${fresh}=`))?.line ??
      loopStmts.find((s) => s.kind === 'stmt' && s.text.startsWith(`${fresh} `))?.line ??
      1;
    const firstCol =
      initStmts.find((s) => s.line === firstLine)?.col ??
      loopStmts.find((s) => s.line === firstLine)?.col ??
      1;
    initStmts.unshift({
      text: `${fresh} = c`,
      line: firstLine,
      col: firstCol,
      sourceText: '',
      sourceMap: [],
      kind: 'stmt',
    });
    notes.push({
      kind: 'c-init-rebinding-renamed',
      line: firstLine,
      message:
        `c rebinding lowered to \`${fresh}\` (seeded from framework c; ${loopHasCAssign ? 'loop-mutated' : 'init-only'}): ` +
        'native reserves `c` as the read-only runtime constant; classic c is ordinary mutable state',
    });
  }

  // Emit native source with line and per-column provenance back to classic.
  const native: string[] = [];
  const lineMap: number[] = [];
  const locationMap: LoweredClassicEntry['locationMap'] = [];
  const push = (
    text: string,
    classicLine: number,
    classicCol = 1,
    generatedCol = 1,
    sourceText = '',
    sourceMap: readonly ClassicSourceLocation[] = [],
  ) => {
    const fallback = { line: classicLine, col: classicCol };
    const prefixLength = Math.max(0, generatedCol - 1);
    const sourceDerivedText = text.slice(prefixLength);
    const mappedText = alignGeneratedTextToSource(
      sourceDerivedText,
      sourceText,
      sourceMap,
      fallback,
    );
    native.push(text);
    lineMap.push(classicLine);
    locationMap.push({
      line: classicLine,
      col: classicCol,
      generatedCol,
      columnMap: [
        ...Array.from({ length: prefixLength }, () => fallback),
        ...mappedText,
      ],
    });
  };

  push(`${name} {`, 1);
  // Structural tokens must be lowered identically in both sections — an
  // `if` inside the init section is valid classic syntax.
  const emitStmt = (stmt: Stmt) => {
    if (stmt.kind === 'if') {
      const cond = stmt.text;
      push(
        `  if ${isFullyParenWrapped(cond) ? cond : `(${cond})`}`,
        stmt.line,
        stmt.col,
        6,
        stmt.sourceText,
        stmt.sourceMap,
      );
    } else if (stmt.kind === 'elseif') {
      const cond = stmt.text;
      push(
        `  elseif ${isFullyParenWrapped(cond) ? cond : `(${cond})`}`,
        stmt.line,
        stmt.col,
        10,
        stmt.sourceText,
        stmt.sourceMap,
      );
    } else if (stmt.kind === 'else') {
      push('  else', stmt.line, stmt.col, 3, stmt.sourceText, stmt.sourceMap);
    } else if (stmt.kind === 'endif') {
      push('  endif', stmt.line, stmt.col, 3, stmt.sourceText, stmt.sourceMap);
    } else {
      push(
        `  ${stmt.text}`,
        stmt.line,
        stmt.col,
        3,
        stmt.sourceText,
        stmt.sourceMap,
      );
    }
  };
  if (initStmts.length > 0) {
    push(
      'init:',
      walk.colonLine || initStmts[0].line,
      walk.colonCol || initStmts[0].col,
    );
    for (const stmt of initStmts) emitStmt(stmt);
  }
  if (loopStmts.length > 0) {
    push('loop:', loopStmts[0].line, loopStmts[0].col);
    for (const stmt of loopStmts) emitStmt(stmt);
  }
  push('bailout:', bailoutLine, bailoutCol);
  push(
    `  ${bailoutText}`,
    bailoutLine,
    bailoutCol,
    3,
    bailoutSourceText,
    bailoutSourceMap,
  );
  push('}', walk.closeLine, walk.closeCol);

  return {
    native: native.join('\n'),
    lineMap,
    locationMap,
    notes,
    ...(cSeedTarget !== undefined ? { cSeedTarget } : {}),
    ...(header.options !== undefined ? { options: header.options } : {}),
    ...(fnDefaults !== undefined ? { fnDefaults } : {}),
  };
}
