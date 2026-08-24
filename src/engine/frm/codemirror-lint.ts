/**
 * FRM Language Lint/Diagnostics for CodeMirror 6
 *
 * Real-time diagnostics at the authoring/import boundary. The linter consumes
 * the same dialect router and stage-based classification as the compatibility
 * card and explicit Compile action, so classic sources are never fed directly
 * to the native parser.
 */

import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { type Extension } from '@codemirror/state';
import { classifyImportedFrmSource } from './compat-status';
import type { FrmSemanticsVersion } from './semantics-version';

/** Structured error for external consumers (e.g. FormulaEditor error panel). */
export interface EditorError {
  line: number;
  col: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  suggestion?: string;
}

export type OnErrorsChanged = (errors: EditorError[]) => void;
export type EditorErrorCollector = (
  doc: string,
  semanticsVersion: FrmSemanticsVersion,
) => EditorError[];
export type FrmSemanticsVersionSource =
  | FrmSemanticsVersion
  | (() => FrmSemanticsVersion);

function readSemanticsVersion(
  source: FrmSemanticsVersionSource,
): FrmSemanticsVersion {
  return typeof source === 'function' ? source() : source;
}

/** Calculate exact document offset from line/col (1-based). */
function calculateOffset(doc: string, line: number, col: number): number {
  const lines = doc.split('\n');
  let offset = 0;

  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    offset += lines[i].length + 1;
  }

  offset += Math.min(col - 1, lines[line - 1]?.length || 0);
  return offset;
}

export function collectEditorErrors(
  doc: string,
  semanticsVersion: FrmSemanticsVersionSource = 2,
): EditorError[] {
  if (!doc.trim()) return [];

  const classification = classifyImportedFrmSource(
    doc,
    readSemanticsVersion(semanticsVersion),
  );
  // A multi-entry source must be sliced through the explicit picker before
  // compilation. Entry diagnostics are entry-relative until then, so surface
  // source-level findings only; the workspace preflight owns the selection
  // requirement. Single-entry/sliced sources have displayed-source locations.
  const diagnostics =
    classification.entries.length > 1
      ? classification.sourceDiagnostics
      : [
          ...classification.sourceDiagnostics,
          ...classification.entries.flatMap((entry) => entry.diagnostics),
        ];

  return diagnostics.map((diagnostic) => ({
    line: diagnostic.line ?? 1,
    col: diagnostic.col ?? 1,
    message: diagnostic.message,
    severity:
      diagnostic.severity === 'note' ? 'info' : diagnostic.severity,
    ...(diagnostic.suggestion
      ? { suggestion: diagnostic.suggestion }
      : {}),
  }));
}

/** Create a CodeMirror linter extension for FRM formulas. */
export function createFRMLinter(
  onErrorsChanged?: OnErrorsChanged,
  semanticsVersion: FrmSemanticsVersionSource = 2,
  collectErrors: EditorErrorCollector = collectEditorErrors,
): Extension {
  const lint = linter(view => {
    const doc = view.state.doc.toString();
    const editorErrors = collectErrors(doc, readSemanticsVersion(semanticsVersion));

    onErrorsChanged?.(editorErrors);

    return editorErrors.map((error): Diagnostic => {
      const from = calculateOffset(doc, error.line, error.col);
      return {
        from,
        to: Math.min(from + 1, doc.length),
        severity: error.severity,
        message: error.suggestion
          ? `${error.message}\n💡 ${error.suggestion}`
          : error.message,
        source:
          error.severity === 'info' ? 'frm-compatibility' : 'frm',
      };
    });
  }, {
    delay: 300,
  });

  return [lint, lintGutter()];
}

export { forceLinting } from '@codemirror/lint';
export type { Diagnostic } from '@codemirror/lint';
