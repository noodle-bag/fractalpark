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

import { createHash } from 'node:crypto';
import { scanFrmEntries, FRM_BLOCKING_DIAGNOSTICS } from './scanner';
import {
  compileClassicFrmEntry,
  type ClassicEntryCompileResult,
} from './compile';
import {
  BAILOUT_DESCRIPTOR_KINDS,
  BAILOUT_REJECT_REASONS,
} from './bailout-descriptor';
import type { FrmSemanticsVersion } from './semantics-version';
import { STRICT_FRM_SEMANTICS_VERSION } from './semantics-version';

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

const REJECT_REASON_SET: ReadonlySet<string> = new Set(BAILOUT_REJECT_REASONS);

/** Extract a bracketed machine reason (`... [threshold-not-loop-invariant]`)
 * from an engine error string; only KNOWN codes are trusted. */
function extractReasonCode(message: string): string | null {
  const match = message.match(/\[([a-z0-9-]+)\]\s*$/);
  if (!match) return null;
  return REJECT_REASON_SET.has(match[1]) ? match[1] : null;
}

/** Engine formatted errors look like `Line 5, column 9: <msg>`; warnings
 * carry a `⚠️ ` prefix on the same shape. */
const FORMATTED_ERROR_RE = /^(⚠️\s*)?Line (\d+), column (\d+): ([\s\S]*)$/;

function dedupe(diagnostics: FrmCompatDiagnostic[]): FrmCompatDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((d) => {
    // reasonCode + location + message digest: distinct issues sharing a
    // code (two undeclared variables on one line) must survive dedupe.
    const digest = createHash('sha256').update(d.message).digest('hex').slice(0, 8);
    const key = `${d.reasonCode}@${d.line ?? ''}:${d.col ?? ''}#${digest}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function classifyEntry(
  source: string,
  key: string,
  semanticsVersion: FrmSemanticsVersion,
): FrmEntryCompat {
  const result: ClassicEntryCompileResult = compileClassicFrmEntry(
    source,
    key,
    `compat-${createHash('sha256').update(key).digest('hex').slice(0, 8)}`,
    semanticsVersion,
  );
  const toClassicLine = (nativeLine: number | undefined): number | undefined => {
    if (nativeLine === undefined) return undefined;
    const map = result.loweringLineMap;
    if (!map || nativeLine < 1 || nativeLine > map.length) return nativeLine;
    return map[nativeLine - 1];
  };

  const diagnostics: FrmCompatDiagnostic[] = [];
  // Structured lexer/parser issues — remember their NATIVE coordinates so
  // the formatted duplicates in result.errors can be skipped (Codex 7e1:
  // formatted and structured reports of the same issue must not both land).
  const structuredNative = new Set<string>();
  for (const e of result.lexerErrors ?? []) {
    structuredNative.add(`${e.line}:${e.message}`);
    diagnostics.push({
      reasonCode: 'lexer-error',
      severity: e.severity === 'error' ? 'error' : 'warning',
      blocking: e.severity === 'error',
      message: e.message,
      line: toClassicLine(e.line),
      col: e.col,
    });
  }
  for (const e of result.parseErrors ?? []) {
    structuredNative.add(`${e.line}:${e.message}`);
    diagnostics.push({
      reasonCode: 'parse-error',
      severity: e.severity === 'error' ? 'error' : 'warning',
      blocking: e.severity === 'error',
      message: e.message,
      line: toClassicLine(e.line),
      col: e.col,
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
      const formatted = FORMATTED_ERROR_RE.exec(message);
      if (formatted && structuredNative.has(`${Number(formatted[2])}:${formatted[4]}`)) {
        continue; // already emitted as a structured lexer/parser diagnostic
      }
      const code = extractReasonCode(message);
      const isWarningMarker = Boolean(formatted?.[1]);
      diagnostics.push({
        reasonCode: code ?? (isWarningMarker ? 'compile-warning' : 'compile-error'),
        severity: isWarningMarker ? 'warning' : 'error',
        blocking: !isWarningMarker,
        message,
        ...(formatted
          ? { line: toClassicLine(Number(formatted[2])), col: Number(formatted[3]) }
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
    diagnostics.push({
      reasonCode: 'compile-warning',
      severity: 'warning',
      blocking: false,
      message,
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
