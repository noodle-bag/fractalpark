import { describe, expect, it } from 'vitest';
import origins from '@/content/formula-origin-projection.json';
import provenance from '../../resources/formula-library/v1/formula-record-provenance.v1.json';
import { PUBLISHED_FORMULA_DIRECTORY_V1 as directory } from '@/content/published-formula-directory';
import { resolveExploreFormulaIdentity } from '@/lib/explore-formula-identity';
import type { PublishedFormulaLibraryClient } from '@/lib/published-formula-library';

const client = {
  directory: {
    rows: directory.rows,
    categoryCounts: directory.categoryCounts,
    runtimeAliasFormulaIds: Object.fromEntries(directory.runtimeAliases.map(row => [row.runtimeId, row.canonicalFormulaId])),
  },
} satisfies Pick<PublishedFormulaLibraryClient, 'directory'>;

describe('Explore formula display identity', () => {
  it('projects exactly the published provenance without carrying source files or authority ledgers into the UI', () => {
    expect(origins).toEqual(Object.fromEntries(provenance.rows.map(row => [row.formulaId, row.sourceProject])));
    expect(Object.keys(origins).sort()).toEqual(directory.rows.map(row => row.formulaId).sort());
  });

  it('resolves fatso and distinguishes Fractint from Iterated Dynamics', () => {
    expect(resolveExploreFormulaIdentity('fd4db987-1bd3-5ab0-983f-9a9bb01d0304', client)).toEqual({
      displayName: 'fractint-fatso',
      canonicalPath: '/formulas/fd4db987-1bd3-5ab0-983f-9a9bb01d0304',
    });
    for (const row of directory.rows.filter(row => !row.categories.includes('classic'))) {
      expect(resolveExploreFormulaIdentity(row.formulaId, client)?.displayName)
        .toBe(`${origins[row.formulaId as keyof typeof origins]}-${row.displayName}`);
    }
  });

  it('uses canonical destinations for all Classic runtime aliases, including duplicate aliases', () => {
    for (const alias of directory.runtimeAliases) {
      const identity = resolveExploreFormulaIdentity(alias.runtimeId, client);
      expect(identity?.canonicalPath).toBe(`/formulas/${alias.canonicalFormulaId}`);
      expect(identity?.displayName).toMatch(/^classic-/);
    }
    expect(resolveExploreFormulaIdentity('mandelbrot', client)?.displayName).toBe('classic-mandelbrot');
    expect(resolveExploreFormulaIdentity('perpendicularCeltic', client)?.displayName).toBe('classic-perpendicularCeltic');
  });

  it.each(['custom-fractint-fatso', 'fatso', 'frm-unknown', '__proto__', 'toString', '00000000-0000-4000-8000-000000000001'])(
    'does not invent provenance or a public destination for %s', id => {
      expect(resolveExploreFormulaIdentity(id, client)).toBeUndefined();
    },
  );
});
