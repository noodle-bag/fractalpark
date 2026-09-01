import { isStandardFormulaIdV1 } from '@/engine/formulas/v1';
import type { FormulaIdV1 } from '@/engine/formulas/v1/types';

export type PublishedFormulaExploreIntent =
  | { readonly status: 'none' }
  | {
      readonly status: 'valid';
      readonly formulaId: FormulaIdV1;
      readonly action: 'open' | 'remix';
    }
  | {
      readonly status: 'invalid';
      readonly formulaId: string;
      readonly reason:
        | 'missing'
        | 'duplicate'
        | 'invalid-id'
        | 'invalid-intent';
    };

export function parsePublishedFormulaExploreIntent(
  searchParams: URLSearchParams,
): PublishedFormulaExploreIntent {
  const openValues = searchParams.getAll('open');
  if (!openValues.includes('standard-formula')) {
    return { status: 'none' };
  }
  const formulaValues = searchParams.getAll('formula');
  const intentValues = searchParams.getAll('intent');
  const formulaId = formulaValues.length === 1 ? formulaValues[0] : '';
  if (
    openValues.length !== 1 ||
    formulaValues.length > 1 ||
    intentValues.length > 1
  ) {
    return { status: 'invalid', formulaId, reason: 'duplicate' };
  }
  if (formulaValues.length === 0) {
    return { status: 'invalid', formulaId, reason: 'missing' };
  }
  const rawIntent = intentValues[0] ?? null;
  if (!isStandardFormulaIdV1(formulaId)) {
    return { status: 'invalid', formulaId, reason: 'invalid-id' };
  }
  if (rawIntent !== null && rawIntent !== 'open' && rawIntent !== 'remix') {
    return { status: 'invalid', formulaId, reason: 'invalid-intent' };
  }
  return {
    status: 'valid',
    formulaId,
    action: rawIntent === 'remix' ? 'remix' : 'open',
  };
}

export function stripPublishedFormulaExploreIntent(
  locale: string,
  searchParams: URLSearchParams,
): string {
  const next = new URLSearchParams(searchParams);
  next.delete('open');
  next.delete('formula');
  next.delete('intent');
  const query = next.toString();
  return `/${locale}/explore${query ? `?${query}` : ''}`;
}
