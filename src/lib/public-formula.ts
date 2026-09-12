import { PUBLICATION_DECISION_LEDGER_V1 } from '@/engine/formulas/v1/publication-decisions';

export function isPublishedFormulaId(formulaId: string): boolean {
  return (
    PUBLICATION_DECISION_LEDGER_V1.decisionFor(formulaId)
      ?.publicationDecision === 'publish'
  );
}
