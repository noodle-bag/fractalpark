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
 * an equivalent native source string plus a line map (native line →
 * classic line) for diagnostic back-referencing and a structured note list
 * describing every adaptation applied. The lowered source flows through
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
 * - statements before the first top-level `:` become `init:` lines; the
 *   remaining statements become `loop:` lines (additional colons are
 *   statement separators, matching Fractint);
 * - the last non-assignment statement is the bailout predicate and becomes
 *   the `bailout:` expression; an absent predicate defaults to `|z| < 4`
 *   (Fractint's default bailout);
 * - `bailout=<value>` is an assignment and stays in its section (the
 *   variable is renamed because the native parser treats a statement
 *   starting with the `bailout` keyword as a section header);
 * - `c = pixel` is removed: in the native model `c` already equals the
 *   pixel for Mandelbrot mode (codegen: `pixel = u_isJulia ? point : c`),
 *   so the classic identity assignment is redundant there. Julia-mode
 *   pixel-binding has no native equivalent; entries relying on it classify
 *   Read-only downstream and the removal is always recorded as a note;
 * - chained assignments `a = b = expr` are split into ordered single
 *   assignments (`b = expr`, `a = b`) so the native assignment grammar can
 *   express them; the `c = pixel` removal applies per split piece, so a
 *   chained `z = c = pixel` leaves only `z = c`;
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
 * - assignments to `c` with a non-pixel value (`c = p1`, `c = 1/pixel`)
 *   have no native equivalent (native `c` is the runtime Julia parameter)
 *   and are passed through, so such entries fail the native compiler and
 *   classify as read-only downstream;
 * - chained assignments nested inside parentheses are passed through;
 * - predicate extraction considers the last top-level (outside `if`)
 *   non-assignment expression only.
 */

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
    | 'function-option-unmapped';
  /** 1-based line in the classic entry source. */
  line: number;
  message: string;
}

/** Result of lowering one classic entry to native syntax. */
export interface LoweredClassicEntry {
  /** Native-syntax source; safe to feed to `compileFrmDetailed`. */
  native: string;
  /** `lineMap[nativeLine - 1]` = 1-based classic source line. */
  lineMap: number[];
  notes: LoweringNote[];
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
  const name = line.slice(nameStart, i);
  if (name.length === 0) return null;

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
  /** expr: expression text; if/elseif: condition text. */
  text: string;
  /** 1-based classic line where the token started. */
  line: number;
}

interface WalkResult {
  tokens: BodyToken[];
  /** Number of tokens that belong to the init section (before first `:`). */
  boundary: number;
  /** 1-based classic line of the first top-level colon, or 0. */
  colonLine: number;
  /** 1-based classic line of the entry closing brace. */
  closeLine: number;
}

const KEYWORD_RE = /^(if|else|elseif|endif)(?![a-zA-Z0-9_])/i;

/**
 * Tokenize a classic body into expression and structural tokens. Comments,
 * separators (`,`, newline, `:`), and the closing `}` are consumed here.
 */
function walkBody(body: string, startLine: number, notes: LoweringNote[]): WalkResult {
  const tokens: BodyToken[] = [];
  let current: BodyToken | null = null;
  let parenDepth = 0;
  let line = startLine;
  let boundary = -1;
  let colonLine = 0;
  let closeLine = 0;

  const endCurrent = () => {
    if (current) {
      const text = current.text.trim();
      if (text.length > 0 || current.type !== 'expr') {
        current.text = text;
        tokens.push(current);
      }
      current = null;
    }
  };

  let i = 0;
  const n = body.length;
  while (i < n) {
    const ch = body[i];

    if (ch === '\n') {
      endCurrent();
      line++;
      i++;
      continue;
    }

    if (ch === ';') {
      notes.push({
        kind: 'comment-stripped',
        line,
        message: 'Classic `;` comment removed during lowering',
      });
      while (i < n && body[i] !== '\n') i++;
      continue;
    }

    // Structural keywords are recognized only at statement starts.
    if (current === null && parenDepth === 0 && /[a-zA-Z_]/.test(ch)) {
      const m = KEYWORD_RE.exec(body.slice(i));
      if (m) {
        const kw = m[1].toLowerCase();
        i += m[1].length;
        if (kw === 'else' || kw === 'endif') {
          tokens.push({ type: kw, text: '', line });
        } else {
          // if / elseif: the condition is the rest of this token.
          current = { type: kw === 'elseif' ? 'elseif' : 'if', text: '', line };
        }
        continue;
      }
    }

    if (ch === '(') {
      parenDepth++;
      if (!current) current = { type: 'expr', text: '', line };
      current.text += ch;
      i++;
      continue;
    }
    if (ch === ')') {
      if (parenDepth > 0) parenDepth--;
      if (current) current.text += ch;
      i++;
      continue;
    }
    if (ch === ',') {
      if (parenDepth === 0) endCurrent();
      else if (current) current.text += ch;
      i++;
      continue;
    }
    if (ch === ':') {
      if (parenDepth === 0) {
        endCurrent();
        if (boundary === -1) {
          boundary = tokens.length;
          colonLine = line;
        }
      } else if (current) {
        current.text += ch;
      }
      i++;
      continue;
    }
    if (ch === '}') {
      if (parenDepth === 0) {
        endCurrent();
        closeLine = line;
        break;
      }
      if (current) current.text += ch;
      i++;
      continue;
    }

    if (!current) current = { type: 'expr', text: '', line };
    current.text += ch;
    i++;
  }

  endCurrent();
  if (closeLine === 0) closeLine = line;

  return {
    tokens,
    boundary: boundary === -1 ? tokens.length : boundary,
    colonLine,
    closeLine,
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
    const KNOWN_FN = new Set([
      'identity', 'sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs', 'sqr',
      'conj', 'flip', 'recip', 'cabs', 'real', 'imag', 'sinh', 'cosh', 'tanh',
    ]);
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
  const walk = walkBody(bodyText.toLowerCase(), 1, notes);

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
  const bailoutLine = predicate ? predicate.line : (loopBodyTokens.at(-1)?.line ?? walk.colonLine) || walk.closeLine;
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

  // Flatten each section into single-assignment statement lines.
  interface Stmt {
    text: string;
    line: number;
    kind: 'stmt' | 'if' | 'else' | 'elseif' | 'endif';
  }
  const flatten = (tokensIn: BodyToken[]): Stmt[] => {
    const out: Stmt[] = [];
    for (const token of tokensIn) {
      if (token.type !== 'expr') {
        const kind = token.type === 'if' || token.type === 'else' || token.type === 'elseif' || token.type === 'endif' ? token.type : 'stmt';
        out.push({ text: token.text, line: token.line, kind });
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
        // The `c = pixel` removal applies per split piece — a chained
        // `z = c = pixel` otherwise leaks the `c = pixel` fragment into
        // native source, where assigning the reserved `c` is rejected.
        if (/^c\s*=\s*pixel$/i.test(piece)) {
          notes.push({
            kind: 'c-pixel-assignment-removed',
            line: token.line,
            message:
              '`c = pixel` removed: redundant in Mandelbrot mode (native `c` already equals the ' +
              'pixel). Julia-mode pixel-binding has no native equivalent — entries relying on it ' +
              'are expected to classify Read-only downstream.',
          });
          continue;
        }
        out.push({ text: piece, line: token.line, kind: 'stmt' });
      }
    }
    return out;
  };

  const initStmts = flatten(initTokens);
  const loopStmts = flatten(loopBodyTokens);
  if (predicate) bailoutText = renameBailout(bailoutText);

  // Emit native source with a line map back to the classic source.
  const native: string[] = [];
  const lineMap: number[] = [];
  const push = (text: string, classicLine: number) => {
    native.push(text);
    lineMap.push(classicLine);
  };

  push(`${name} {`, 1);
  // Structural tokens must be lowered identically in both sections — an
  // `if` inside the init section is valid classic syntax.
  const emitStmt = (stmt: Stmt) => {
    if (stmt.kind === 'if') {
      const cond = stmt.text;
      push(`  if ${isFullyParenWrapped(cond) ? cond : `(${cond})`}`, stmt.line);
    } else if (stmt.kind === 'elseif') {
      const cond = stmt.text;
      push(`  elseif ${isFullyParenWrapped(cond) ? cond : `(${cond})`}`, stmt.line);
    } else if (stmt.kind === 'else') {
      push('  else', stmt.line);
    } else if (stmt.kind === 'endif') {
      push('  endif', stmt.line);
    } else {
      push(`  ${stmt.text}`, stmt.line);
    }
  };
  if (initStmts.length > 0) {
    push('init:', walk.colonLine || initStmts[0].line);
    for (const stmt of initStmts) emitStmt(stmt);
  }
  if (loopStmts.length > 0) {
    push('loop:', loopStmts[0].line);
    for (const stmt of loopStmts) emitStmt(stmt);
  }
  push('bailout:', bailoutLine);
  push(`  ${bailoutText}`, bailoutLine);
  push('}', walk.closeLine);

  return {
    native: native.join('\n'),
    lineMap,
    notes,
    ...(header.options !== undefined ? { options: header.options } : {}),
    ...(fnDefaults !== undefined ? { fnDefaults } : {}),
  };
}
