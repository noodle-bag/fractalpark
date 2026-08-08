import { routing } from './routing';

/**
 * Data-driven locale metadata (ADR 0006 §9): adding a language means
 * extending routing.locales, its messages file, and this registry — no
 * button-list edits anywhere else.
 */
export interface LocaleMeta {
  code: string;
  /** Human-readable endonym shown in the dropdown (e.g. "中文"). */
  label: string;
  /** Compact label for the navbar trigger (e.g. "中"). */
  shortLabel: string;
}

const REGISTRY: Record<string, { label: string; shortLabel: string }> = {
  en: { label: 'English', shortLabel: 'EN' },
  zh: { label: '中文', shortLabel: '中' },
};

export const LOCALES: LocaleMeta[] = routing.locales.map((code) => ({
  code,
  ...(REGISTRY[code] ?? { label: code, shortLabel: code.toUpperCase() }),
}));
