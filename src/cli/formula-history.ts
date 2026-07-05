import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FormulaGenerationHistoryEntry, GeneratedFormula } from '@/engine/frm/generator';

const DEFAULT_HISTORY_LIMIT = 12;

export function getDefaultFormulaHistoryPath(): string {
  return path.join(os.tmpdir(), 'myfrac-formula-history.json');
}

export function readFormulaHistory(historyPath = getDefaultFormulaHistoryPath()): FormulaGenerationHistoryEntry[] {
  try {
    if (!fs.existsSync(historyPath)) {
      return [];
    }

    const raw = fs.readFileSync(historyPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (entry): entry is FormulaGenerationHistoryEntry =>
          typeof entry?.seed === 'string' &&
          typeof entry?.family === 'string' &&
          typeof entry?.blueprint === 'string',
      )
      .slice(0, DEFAULT_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function writeFormulaHistory(
  history: FormulaGenerationHistoryEntry[],
  historyPath = getDefaultFormulaHistoryPath(),
): void {
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify(history.slice(0, DEFAULT_HISTORY_LIMIT), null, 2));
}

export function prependFormulaHistoryEntry(
  generated: GeneratedFormula,
  history: FormulaGenerationHistoryEntry[],
): FormulaGenerationHistoryEntry[] {
  const next: FormulaGenerationHistoryEntry[] = [
    {
      seed: generated.seed,
      family: generated.selection.family,
      blueprint: generated.selection.blueprint,
    },
  ];

  for (const entry of history) {
    if (entry.seed === generated.seed) {
      continue;
    }
    next.push(entry);
    if (next.length >= DEFAULT_HISTORY_LIMIT) {
      break;
    }
  }

  return next;
}
