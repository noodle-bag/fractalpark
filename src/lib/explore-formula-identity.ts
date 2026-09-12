import origins from '@/content/formula-origin-projection.json';
import type { PublishedFormulaLibraryClient } from '@/lib/published-formula-library';

// A minimal projection of the reviewed Formula Record provenance. Tests bind
// every entry to that authority; compiler format is never an origin signal.
export function resolveExploreFormulaIdentity(
  currentFormula: string,
  client: Pick<PublishedFormulaLibraryClient, 'directory'>,
): { displayName: string; canonicalPath: string } | undefined {
  const canonicalId = Object.hasOwn(client.directory.runtimeAliasFormulaIds, currentFormula)
    ? client.directory.runtimeAliasFormulaIds[currentFormula]
    : currentFormula;
  const row = client.directory.rows.find(candidate => candidate.formulaId === canonicalId);
  if (!row || !Object.hasOwn(origins, canonicalId)) return undefined;
  const source = origins[canonicalId as keyof typeof origins];
  const prefix = row.categories.includes('classic') ? 'classic' : source;
  return {
    displayName: `${prefix}-${row.displayName}`,
    canonicalPath: row.canonicalPath,
  };
}
