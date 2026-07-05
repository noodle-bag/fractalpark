/**
 * FRM Language Support for CodeMirror 6
 * M4.2 Phase 2.2
 */

import { StreamLanguage, type StreamParser } from '@codemirror/language';
import { styleTags, tags as t } from '@lezer/highlight';

// FRM syntax highlighting
const frmParser: StreamParser<{ expectBlock?: boolean }> = {
  startState() {
    return {};
  },

  token(stream) {
    // Comments: ; to end of line
    if (stream.match(';')) {
      stream.skipToEnd();
      return 'comment';
    }

    // Skip whitespace
    if (stream.eatSpace()) {
      return null;
    }

    // Section keywords
    if (stream.match(/^(init|loop|bailout):/i)) {
      return 'keyword';
    }

    // Control flow keywords
    if (stream.match(/^(if|elseif|else|endif)$/i)) {
      return 'keyword';
    }

    // Builtin variables
    if (stream.match(/^(z|c|pixel|zPrev|p1|p2|p3)$/i)) {
      return 'variableName';
    }

    // Functions
    if (stream.match(/^(sin|cos|tan|exp|log|sqrt|abs|real|imag|conj|flip|sqr|recip|cabs|atan2|sinh|cosh|tanh)$/i)) {
      return 'function';
    }

    // Complex number literal: (real, imag)
    if (stream.match(/^\(\s*[-+]?[0-9]*\.?[0-9]+\s*,\s*[-+]?[0-9]*\.?[0-9]+\s*\)/)) {
      return 'number';
    }

    // Number literal
    if (stream.match(/^[-+]?[0-9]*\.?[0-9]+/)) {
      return 'number';
    }

    // Formula name (at start, before {)
    if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\{)/)) {
      return 'typeName';
    }

    // Operators
    if (stream.match(/^(\|\||\u0026\u0026|==|!=|<=|>=|<|>)/)) {
      return 'operator';
    }

    if (stream.match(/^[+\-*/^=!]/)) {
      return 'operator';
    }

    // Braces and delimiters
    if (stream.match(/^[{}()\[\]:;,.|]/)) {
      return 'punctuation';
    }

    // Identifiers
    if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/)) {
      return 'variableName';
    }

    // Skip unknown character
    stream.next();
    return null;
  },

  tokenTable: {
    keyword: t.keyword,
    number: t.number,
    string: t.string,
    variableName: t.variableName,
    function: t.function(t.variableName),
    typeName: t.typeName,
    operator: t.operator,
    punctuation: t.punctuation,
    comment: t.lineComment,
  },
};

export const frmLanguage = StreamLanguage.define(frmParser);

// Highlight style configuration
export const frmHighlightStyle = styleTags({
  keyword: t.keyword,
  number: t.number,
  variableName: t.variableName,
  function: t.function(t.variableName),
  typeName: t.typeName,
  operator: t.operator,
  punctuation: t.punctuation,
  comment: t.lineComment,
});
