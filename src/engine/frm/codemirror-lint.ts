/**
 * FRM Language Lint/Diagnostics for CodeMirror 6
 * M4.4 - CodeMirror Inline Diagnostics
 *
 * Single source of truth for real-time formula error highlighting.
 * Runs tokenize → parse → validate pipeline and converts results
 * to CodeMirror Diagnostic[] for inline display.
 */

import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { type Extension } from '@codemirror/state';
import { tokenize } from './lexer';
import { parse } from './parser';
import { createCanonicalFormula } from './ast';
import { parseFormulaSourceDirectives } from './source-directives';
import { validate, type ValidationError } from './validator';

/**
 * Structured error for external consumers (e.g. FormulaEditor error panel)
 */
export interface EditorError {
  line: number;
  col: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  suggestion?: string;
}

/**
 * Callback type for error state updates
 */
export type OnErrorsChanged = (errors: EditorError[]) => void;

/**
 * Calculate exact document offset from line/col (1-based)
 */
function calculateOffset(doc: string, line: number, col: number): number {
  const lines = doc.split('\n');
  let offset = 0;

  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    offset += lines[i].length + 1; // +1 for newline
  }

  offset += Math.min(col - 1, lines[line - 1]?.length || 0);
  return offset;
}

/**
 * Create a CodeMirror linter extension for FRM formulas.
 *
 * @param onErrorsChanged - Optional callback invoked with structured errors
 *   whenever diagnostics change. Used by FormulaEditor to display the error panel.
 */
export function collectEditorErrors(doc: string): EditorError[] {
  const { tokens, errors: lexerErrors } = tokenize(doc);
  const { ast, errors: parseErrors } = parse(tokens);
  const sourceDirectives = parseFormulaSourceDirectives(doc);

  let validationErrors: ValidationError[] = [];
  if (ast) {
    const validation = validate(ast);
    validationErrors = validation.errors;
  }

  const compatibilityErrors: EditorError[] = [
    ...sourceDirectives.compatibilityNotes,
    ...(ast ? createCanonicalFormula(ast, doc).compatibilityNotes : []),
  ]
    .filter((note, index, notes) => {
      return notes.findIndex(
        candidate =>
          candidate.kind === note.kind &&
          candidate.message === note.message &&
          candidate.loc?.line === note.loc?.line &&
          candidate.loc?.col === note.loc?.col,
      ) === index;
    })
    .map((note): EditorError => ({
        line: note.loc?.line ?? 1,
        col: note.loc?.col ?? 1,
        message: note.message,
        severity: note.kind === 'info' ? 'info' : 'warning',
      }));

  return [
    ...lexerErrors.map(e => ({
      line: e.line,
      col: e.col,
      message: e.message,
      severity: e.severity,
      suggestion: e.suggestion,
    })),
    ...parseErrors.map(e => ({
      line: e.line,
      col: e.col,
      message: e.message,
      severity: e.severity,
      suggestion: e.suggestion,
    })),
    ...validationErrors.map(e => ({
      line: e.line,
      col: e.col,
      message: e.message,
      severity: e.severity,
    })),
    ...compatibilityErrors,
  ];
}

export function createFRMLinter(onErrorsChanged?: OnErrorsChanged): Extension {
  const lint = linter(view => {
    const doc = view.state.doc.toString();
    const editorErrors = collectEditorErrors(doc);

    if (onErrorsChanged) {
      onErrorsChanged(editorErrors);
    }

    const diagnostics: Diagnostic[] = [];
    for (const err of editorErrors) {
      const from = calculateOffset(doc, err.line, err.col);
      const to = from + 1;
      diagnostics.push({
        from,
        to,
        severity: err.severity,
        message: err.suggestion ? `${err.message}\n💡 ${err.suggestion}` : err.message,
        source: err.severity === 'info' ? 'frm-compatibility' : 'frm',
      });
    }

    return diagnostics;
  }, {
    delay: 300,
  });

  return [lint, lintGutter()];
}

/**
 * Re-export types for convenience
 */
export type { Diagnostic } from '@codemirror/lint';
