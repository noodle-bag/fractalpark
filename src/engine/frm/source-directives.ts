import type { FormulaCompatibilityNote, FormulaDialect, FormulaMetadata, SourceLocation } from './ast';

interface ParsedDirectiveState {
  dialect: FormulaDialect;
  metadata: Omit<FormulaMetadata, 'dialect'>;
  compatibilityNotes: FormulaCompatibilityNote[];
}

function createLoc(line: number, rawLine: string, marker: string): SourceLocation {
  const index = rawLine.indexOf(marker);
  return {
    line,
    col: index >= 0 ? index + 1 : 1,
  };
}

function parseDefaultView(value: string): FormulaMetadata['defaultView'] | null {
  const parts = value
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(Number);

  if ((parts.length !== 3 && parts.length !== 4) || parts.some(part => Number.isNaN(part))) {
    return null;
  }

  const [centerX, centerY, zoom, rotation] = parts;
  return {
    centerX,
    centerY,
    zoom,
    rotation,
  };
}

function parseDefaultColoring(value: string): FormulaMetadata['defaultColoringHint'] | null {
  const coloring: NonNullable<FormulaMetadata['defaultColoringHint']> = {};
  const entries = value
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const [rawKey, rawValue] = entry.split('=').map(part => part.trim());
    if (!rawKey || !rawValue) {
      return null;
    }

    switch (rawKey) {
      case 'outside':
        coloring.outsideColoringId = rawValue;
        break;
      case 'inside':
        coloring.insideColoringId = rawValue;
        break;
      case 'palette': {
        const paletteIndex = Number(rawValue);
        if (Number.isNaN(paletteIndex)) {
          return null;
        }
        coloring.paletteIndex = paletteIndex;
        break;
      }
      default:
        return null;
    }
  }

  return Object.keys(coloring).length > 0 ? coloring : null;
}

function pushWarning(
  state: ParsedDirectiveState,
  line: number,
  rawLine: string,
  marker: string,
  message: string,
) {
  state.compatibilityNotes.push({
    kind: 'warning',
    message,
    loc: createLoc(line, rawLine, marker),
  });
}

function pushUnsupported(
  state: ParsedDirectiveState,
  line: number,
  rawLine: string,
  marker: string,
  message: string,
) {
  state.compatibilityNotes.push({
    kind: 'unsupported',
    message,
    loc: createLoc(line, rawLine, marker),
  });
}

export function parseFormulaSourceDirectives(source: string): {
  metadata: FormulaMetadata;
  compatibilityNotes: FormulaCompatibilityNote[];
} {
  const lines = source.split('\n');
  const state: ParsedDirectiveState = {
    dialect: 'fractint-compat',
    metadata: {},
    compatibilityNotes: [],
  };

  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      continue;
    }

    if (!trimmed.startsWith(';')) {
      break;
    }

    const comment = trimmed.slice(1).trim();
    const lineNumber = index + 1;

    if (!comment) {
      continue;
    }

    if (comment === '#native') {
      state.dialect = 'myfrac-native';
      continue;
    }

    if (!comment.startsWith('@')) {
      continue;
    }

    if (/^@mode:\s*native$/i.test(comment)) {
      state.dialect = 'myfrac-native';
      continue;
    }

    if (/^@mode:\s*compat$/i.test(comment) || /^@mode:\s*fractint-compat$/i.test(comment)) {
      state.dialect = 'fractint-compat';
      continue;
    }

    if (comment.toLowerCase().startsWith('@mode:')) {
      pushUnsupported(
        state,
        lineNumber,
        rawLine,
        '@mode',
        'Unrecognized mode declaration; only compat, fractint-compat, and native are supported.',
      );
      continue;
    }

    if (comment.toLowerCase().startsWith('@default-view:')) {
      if (state.dialect !== 'myfrac-native') {
        pushWarning(
          state,
          lineNumber,
          rawLine,
          '@default-view',
          '@default-view only applies in native mode; compat mode ignores this directive.',
        );
        continue;
      }

      const parsed = parseDefaultView(comment.slice(comment.indexOf(':') + 1).trim());
      if (!parsed) {
        pushWarning(
          state,
          lineNumber,
          rawLine,
          '@default-view',
          '@default-view is invalid; use centerX, centerY, zoom[, rotation].',
        );
        continue;
      }

      state.metadata.defaultView = parsed;
      continue;
    }

    if (comment.toLowerCase().startsWith('@default-coloring:')) {
      if (state.dialect !== 'myfrac-native') {
        pushWarning(
          state,
          lineNumber,
          rawLine,
          '@default-coloring',
          '@default-coloring only applies in native mode; compat mode ignores this directive.',
        );
        continue;
      }

      const parsed = parseDefaultColoring(comment.slice(comment.indexOf(':') + 1).trim());
      if (!parsed) {
        pushWarning(
          state,
          lineNumber,
          rawLine,
          '@default-coloring',
          '@default-coloring is invalid; use outside=..., inside=..., palette=....',
        );
        continue;
      }

      state.metadata.defaultColoringHint = parsed;
      continue;
    }

    pushUnsupported(
      state,
      lineNumber,
      rawLine,
      '@',
      `Unsupported native directive "${comment}".`,
    );
  }

  return {
    metadata: {
      dialect: state.dialect,
      ...state.metadata,
    },
    compatibilityNotes: state.compatibilityNotes,
  };
}

export function detectFormulaDialect(source: string): FormulaDialect {
  return parseFormulaSourceDirectives(source).metadata.dialect;
}
