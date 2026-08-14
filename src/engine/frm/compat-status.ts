/**
 * Four-level classic-FRM compatibility status (v0.4.18 Slice 7e1, plan §5.6).
 *
 * Every recognizable entry gets exactly one product level:
 *
 * | level       | meaning                                             | runs |
 * |-------------|-----------------------------------------------------|------|
 * | supported   | semantics supported directly                        | yes  |
 * | adapted     | runs via declared, verified adaptations             | yes  |
 * | read-only   | source readable; semantics beyond this version      | no   |
 * | invalid     | structure insufficient to form a valid entry/IR     | no   |
 *
 * The level is decided MECHANICALLY by which stage fails, never by message
 * heuristics: blocking scanner findings / selection failures / lexer or
 * parser severity-errors (no IR can form) → invalid; a parsed entry
 * rejected by validation or the bailout-descriptor contract → read-only;
 * a clean v2 compile → supported, or adapted when declared adaptations
 * apply. Adaptation drivers (each declared and verified by the engine's
 * own gates): smooth 'adapted'/'unavailable' (escape-time fallback),
 * descriptor kinds C2/C4-R/C5, lowering-injected default bailout, and
 * classic c-init rebinding. after-step timing is NOT an adaptation — it
 * is the uniform classic-v2 truth.
 *
 * Diagnostics carry severity + blocking separately, dedupe by
 * reasonCode + location + message digest (distinct issues at one site
 * must survive), and keep classic source coordinates: lowering notes are
 * already classic-line; native compile lines are mapped back through the
 * lowering line map.
 */

import { scanFrmEntries, FRM_BLOCKING_DIAGNOSTICS } from './scanner';
import {
  compileClassicFrmEntry,
  compileFrmDetailed,
  isClassicFrmSource,
  type ClassicEntryCompileResult,
} from './compile';
import {
  BAILOUT_DESCRIPTOR_KINDS,
  BAILOUT_REJECT_REASONS,
} from './bailout-descriptor';
import type { FrmSemanticsVersion } from './semantics-version';
import { STRICT_FRM_SEMANTICS_VERSION } from './semantics-version';
import {
  parseFormattedFrmDiagnostic,
  primaryFrmDiagnosticMessage,
} from './diagnostic-format';

export type FrmCompatLevel = 'supported' | 'adapted' | 'read-only' | 'invalid';

export const FRM_COMPAT_LEVELS: readonly FrmCompatLevel[] = [
  'supported',
  'adapted',
  'read-only',
  'invalid',
] as const;

export interface FrmCompatDiagnostic {
  /** Machine-stable code: a bailout reject reason, stage code, or note kind. */
  reasonCode: string;
  severity: 'error' | 'warning' | 'note';
  /** True when this diagnostic blocks running (never inferred from text). */
  blocking: boolean;
  message: string;
  /** 1-based classic source line when known. */
  line?: number;
  col?: number;
  suggestion?: string;
}

export interface FrmEntryCompat {
  key: string;
  level: FrmCompatLevel;
  runnable: boolean;
  /** Declared, verified adaptations driving an 'adapted' level. */
  adaptations: string[];
  diagnostics: FrmCompatDiagnostic[];
}

export interface FrmSourceCompat {
  /** One status per recognized entry (plan §5.6: exactly one level each). */
  entries: FrmEntryCompat[];
  /** Source-level diagnostics (e.g. no entries found, scan annotations). */
  sourceDiagnostics: FrmCompatDiagnostic[];
}

/** Simple string hash (djb2) — produces a stable 8-char hex digest suitable
 * for dedupe disambiguation and stable IDs. Browser-safe, no node:crypto. */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
}

const REJECT_REASON_SET: ReadonlySet<string> = new Set(BAILOUT_REJECT_REASONS);

/** Extract a bracketed machine reason (`... [threshold-not-loop-invariant]`)
 * from an engine error string; only KNOWN codes are trusted. */
function extractReasonCode(message: string): string | null {
  const match = message.match(/\[([a-z0-9-]+)\]\s*$/);
  if (!match) return null;
  return REJECT_REASON_SET.has(match[1]) ? match[1] : null;
}

function dedupe(diagnostics: FrmCompatDiagnostic[]): FrmCompatDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((d) => {
    // reasonCode + location + message digest: distinct issues sharing a
    // code (two undeclared variables on one line) must survive dedupe.
    const digest = hashString(d.message);
    const key = `${d.reasonCode}@${d.line ?? ''}:${d.col ?? ''}#${digest}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function structuredDiagnosticKey(
  line: number,
  col: number,
  message: string,
): string {
  return `${line}:${col}:${primaryFrmDiagnosticMessage(message)}`;
}

function classifyEntry(
  source: string,
  key: string,
  semanticsVersion: FrmSemanticsVersion,
): FrmEntryCompat {
  const result: ClassicEntryCompileResult = compileClassicFrmEntry(
    source,
    key,
    `compat-${hashString(key)}`,
    semanticsVersion,
  );
  const diagnostics: FrmCompatDiagnostic[] = [];
  // The classic import boundary has already mapped structured and formatted
  // diagnostics back to the displayed source. Remember that one coordinate
  // space so formatted duplicates can be skipped deterministically.
  const structured = new Set<string>();
  for (const e of result.lexerErrors ?? []) {
    structured.add(structuredDiagnosticKey(e.line, e.col, e.message));
    diagnostics.push({
      reasonCode: 'lexer-error',
      severity: e.severity === 'error' ? 'error' : 'warning',
      blocking: e.severity === 'error',
      message: e.message,
      line: e.line,
      col: e.col,
      ...(e.suggestion ? { suggestion: e.suggestion } : {}),
    });
  }
  for (const e of result.parseErrors ?? []) {
    structured.add(structuredDiagnosticKey(e.line, e.col, e.message));
    diagnostics.push({
      reasonCode: 'parse-error',
      severity: e.severity === 'error' ? 'error' : 'warning',
      blocking: e.severity === 'error',
      message: e.message,
      line: e.line,
      col: e.col,
      ...(e.suggestion ? { suggestion: e.suggestion } : {}),
    });
  }

  // Scan annotations (prose paragraphs, duplicate names) must never be
  // invisible. Blocking scan codes are structural errors (spec §2 set).
  let scanBlocking = false;
  for (const a of result.scanAnnotations ?? []) {
    const blocking = FRM_BLOCKING_DIAGNOSTICS.has(a.code);
    if (blocking) scanBlocking = true;
    diagnostics.push({
      reasonCode: `scan-${a.code}`,
      severity: blocking ? 'error' : 'note',
      blocking,
      message: a.message,
    });
  }

  if (!result.success) {
    // Selection failure with a blocking structural code → invalid source
    // (e.g. unclosed brace anywhere in the file).
    const selectionInvalid =
      result.selectionError?.code === 'invalid-source' || scanBlocking;

    for (const message of result.errors) {
      const formatted = parseFormattedFrmDiagnostic(message);
      if (
        formatted &&
        structured.has(
          structuredDiagnosticKey(
            formatted.line,
            formatted.col,
            formatted.message,
          ),
        )
      ) {
        continue; // already emitted as a structured lexer/parser diagnostic
      }
      const code = extractReasonCode(message);
      const isWarningMarker = formatted?.prefix.includes('⚠️') ?? false;
      diagnostics.push({
        reasonCode: code ?? (isWarningMarker ? 'compile-warning' : 'compile-error'),
        severity: isWarningMarker ? 'warning' : 'error',
        blocking: !isWarningMarker,
        message,
        ...(formatted
          ? { line: formatted.line, col: formatted.col }
          : {}),
      });
    }
    const hasStructuralFatal =
      selectionInvalid ||
      diagnostics.some(
        (d) => d.blocking && (d.reasonCode === 'lexer-error' || d.reasonCode === 'parse-error'),
      );
    return {
      key,
      level: hasStructuralFatal ? 'invalid' : 'read-only',
      runnable: false,
      adaptations: [],
      diagnostics: dedupe(diagnostics),
    };
  }

  // Success: collect declared adaptations + note-level diagnostics.
  const adaptations: string[] = [];
  const descriptor = result.bailoutDescriptor;
  if (descriptor && descriptor.kind !== 'C1') {
    if (!(BAILOUT_DESCRIPTOR_KINDS as readonly string[]).includes(descriptor.kind)) {
      // Fail closed at the UI boundary (never throw here): an unknown kind
      // is a read-only diagnostic, not a crash and never a relabel.
      return {
        key,
        level: 'read-only',
        runnable: false,
        adaptations: [],
        diagnostics: dedupe([
          ...diagnostics,
          {
            reasonCode: 'unknown-descriptor-kind',
            severity: 'error',
            blocking: true,
            message: `Unrecognized bailout descriptor kind '${descriptor.kind}' — failing closed`,
          },
        ]),
      };
    }
    adaptations.push(`exotic-bailout-${descriptor.kind}`);
  }
  const smooth = result.plugin?.smoothCapability;
  if (smooth === 'adapted') adaptations.push('smooth-adapted');
  if (smooth === 'unavailable') adaptations.push('smooth-fallback-escape-time');
  for (const note of result.loweringNotes ?? []) {
    if (note.kind === 'default-bailout') {
      adaptations.push('default-bailout-injected');
    }
    if (note.kind === 'c-init-rebinding-renamed') {
      adaptations.push('c-init-rebinding');
    }
    diagnostics.push({
      reasonCode: `lowering-${note.kind}`,
      severity: 'note',
      blocking: false,
      message: note.message,
      // LoweringNote.line is ALREADY classic-source coordinates — never
      // remap it through the lowering line map (Codex 7e1 round-1).
      line: note.line,
    });
  }
  for (const message of result.warnings) {
    const formatted = parseFormattedFrmDiagnostic(message);
    diagnostics.push({
      reasonCode: 'compile-warning',
      severity: 'warning',
      blocking: false,
      message: formatted?.message ?? message,
      ...(formatted
        ? { line: formatted.line, col: formatted.col }
        : {}),
    });
  }

  return {
    key,
    level: adaptations.length > 0 ? 'adapted' : 'supported',
    runnable: true,
    adaptations,
    diagnostics: dedupe(diagnostics),
  };
}

/** Classify every recognizable entry of a classic FRM source (strict v2). */
export function classifyFrmSource(
  source: string,
  semanticsVersion: FrmSemanticsVersion = STRICT_FRM_SEMANTICS_VERSION,
): FrmSourceCompat {
  const scan = scanFrmEntries(source);
  const sourceDiagnostics: FrmCompatDiagnostic[] = [];
  for (const a of scan.diagnostics ?? []) {
    const blocking = FRM_BLOCKING_DIAGNOSTICS.has(a.code);
    sourceDiagnostics.push({
      reasonCode: `scan-${a.code}`,
      severity: blocking ? 'error' : 'note',
      blocking,
      message: a.message,
    });
  }
  if (scan.entries.length === 0) {
    if (!sourceDiagnostics.some((d) => d.reasonCode === 'scan-no-entries')) {
      sourceDiagnostics.push({
        reasonCode: 'scan-no-entries',
        severity: 'error',
        blocking: true,
        message: 'Source contains no recognizable formula entries',
      });
    }
    return { entries: [], sourceDiagnostics: dedupe(sourceDiagnostics) };
  }
  return {
    entries: scan.entries.map((e) => classifyEntry(source, e.key, semanticsVersion)),
    sourceDiagnostics: dedupe(sourceDiagnostics),
  };
}

/**
 * Classify an authoring/import source without confusing native section syntax
 * with a classic Fractint body. Classic entries retain the lowering analysis
 * above; native sources use the production compiler and the same stage-based
 * four-level rules.
 */
export function classifyImportedFrmSource(
  source: string,
  semanticsVersion: FrmSemanticsVersion = STRICT_FRM_SEMANTICS_VERSION,
): FrmSourceCompat {
  if (isClassicFrmSource(source)) {
    return classifyFrmSource(source, semanticsVersion);
  }

  const scan = scanFrmEntries(source);
  const result = compileFrmDetailed(
    source,
    `compat-native-${hashString(source)}`,
    semanticsVersion,
  );
  const diagnostics: FrmCompatDiagnostic[] = [];
  const structured = new Set<string>();

  for (const issue of result.lexerErrors) {
    structured.add(
      structuredDiagnosticKey(issue.line, issue.col, issue.message),
    );
    diagnostics.push({
      reasonCode: 'lexer-error',
      severity: issue.severity === 'error' ? 'error' : 'warning',
      blocking: issue.severity === 'error',
      message: issue.message,
      line: issue.line,
      col: issue.col,
      ...(issue.suggestion ? { suggestion: issue.suggestion } : {}),
    });
  }
  for (const issue of result.parseErrors) {
    structured.add(
      structuredDiagnosticKey(issue.line, issue.col, issue.message),
    );
    diagnostics.push({
      reasonCode: 'parse-error',
      severity: issue.severity === 'error' ? 'error' : 'warning',
      blocking: issue.severity === 'error',
      message: issue.message,
      line: issue.line,
      col: issue.col,
      ...(issue.suggestion ? { suggestion: issue.suggestion } : {}),
    });
  }
  for (const message of result.errors) {
    const formatted = parseFormattedFrmDiagnostic(message);
    if (
      formatted &&
      structured.has(
        structuredDiagnosticKey(
          formatted.line,
          formatted.col,
          formatted.message,
        ),
      )
    ) {
      continue;
    }
    diagnostics.push({
      reasonCode: extractReasonCode(message) ?? 'compile-error',
      severity: 'error',
      blocking: true,
      message: formatted?.message ?? message,
      ...(formatted
        ? { line: formatted.line, col: formatted.col }
        : {}),
    });
  }
  for (const message of result.warnings) {
    const formatted = parseFormattedFrmDiagnostic(message);
    diagnostics.push({
      reasonCode: 'compile-warning',
      severity: 'warning',
      blocking: false,
      message: formatted?.message ?? message,
      ...(formatted
        ? { line: formatted.line, col: formatted.col }
        : {}),
    });
  }
  for (const note of result.canonicalFormula?.compatibilityNotes ?? []) {
    diagnostics.push({
      reasonCode: `compat-${note.kind}`,
      severity: note.kind === 'info' ? 'note' : 'warning',
      blocking: false,
      message: note.message,
      ...(note.loc ? { line: note.loc.line, col: note.loc.col } : {}),
    });
  }

  const key = scan.entries[0]?.key ?? result.ast?.name;
  if (!key) {
    return {
      entries: [],
      sourceDiagnostics: dedupe(
        diagnostics.length > 0
          ? diagnostics
          : [
              {
                reasonCode: 'scan-no-entries',
                severity: 'error',
                blocking: true,
                message: 'Source contains no recognizable formula entries',
              },
            ],
      ),
    };
  }

  const structuralFatal =
    !result.ast ||
    result.lexerErrors.some((issue) => issue.severity === 'error') ||
    result.parseErrors.some((issue) => issue.severity === 'error');
  return {
    entries: [
      {
        key,
        level: result.success
          ? 'supported'
          : structuralFatal
            ? 'invalid'
            : 'read-only',
        runnable: result.success,
        adaptations: [],
        diagnostics: dedupe(diagnostics),
      },
    ],
    sourceDiagnostics: [],
  };
}
