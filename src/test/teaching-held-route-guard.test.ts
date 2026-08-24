import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import aliasesAsset from '../../resources/formula-library/v1/legacy-formula-aliases.json';
import heldAsset from '../../resources/formula-library/v1/teaching-held-guide-appendix.v1.json';
import restoredAsset from '../../resources/formula-library/v1/teaching-restored-guide-projection.v1.json';
import selectionAsset from '../../resources/formula-library/v1/teaching-selection.v1.json';
import {
  getTeachingGuideForFormulaRecordV1,
  isSelectedTeachingFormulaV1,
} from '@/content/teaching/guide-route-policy';
import { isRestoredGuideFormulaV1 } from '@/content/teaching/restored-guide-projection';
import type { FormulaIdV1 } from '@/engine/formulas/v1/types';
import { buildFormulaRecordV1 } from '@/lib/formula-records';

const guideAliases = aliasesAsset.aliases.filter(
  (alias) => alias.kind === 'guide-slug',
);
const heldIds = new Set(heldAsset.rows.map((row) => row.formulaId));
const restoredIds = new Set(restoredAsset.rows.map((row) => row.formulaId));
const selectedIds = new Set(selectionAsset.rows.map((row) => row.formulaId));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (path.includes(`${join('src', 'test')}`)) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('teaching restored-Guide route guard', () => {
  it('allows exactly the 21 selected or separately restored Guide aliases', () => {
    const allowed: string[] = [];
    const blocked: string[] = [];

    for (const alias of guideAliases) {
      const record = buildFormulaRecordV1(
        alias.formulaId as FormulaIdV1,
        'en',
      );
      expect(record).toBeDefined();
      if (!record) continue;

      const guide = getTeachingGuideForFormulaRecordV1(record);
      if (guide) allowed.push(alias.formulaId);
      else blocked.push(alias.formulaId);
    }

    expect(allowed).toHaveLength(21);
    expect(new Set(allowed)).toEqual(
      new Set(
        [...selectedIds, ...restoredIds].filter((formulaId) =>
          guideAliases.some((alias) => alias.formulaId === formulaId),
        ),
      ),
    );
    expect(blocked).toEqual([]);
  });

  it('restores exactly the historical held rows without turning them into teaching selections', () => {
    expect(restoredIds).toEqual(heldIds);
    for (const row of restoredAsset.rows) {
      const record = buildFormulaRecordV1(row.formulaId as FormulaIdV1, 'en');
      expect(record).toMatchObject({
        formulaId: row.formulaId,
        availability: 'published',
        publicationDecision: 'publish',
      });
      expect(record).toHaveProperty('source');
      expect(record).toHaveProperty('defaultProfile');
      expect(record).toHaveProperty('preview');
      expect(record).toHaveProperty('actions');
      expect(record && getTeachingGuideForFormulaRecordV1(record)).toBeDefined();
      expect(isSelectedTeachingFormulaV1(row.formulaId)).toBe(false);
      expect(isRestoredGuideFormulaV1(row.formulaId)).toBe(true);
    }
  });

  it('still requires a published Record for every separately restored Guide', () => {
    for (const row of restoredAsset.rows) {
      expect(
        getTeachingGuideForFormulaRecordV1({
          formulaId: row.formulaId as FormulaIdV1,
          availability: 'hold',
        }),
      ).toBeUndefined();
    }
  });

  it('fails closed for missing, unknown, or malformed availability', () => {
    const formulaId = restoredAsset.rows[0].formulaId as FormulaIdV1;
    for (const availability of [undefined, 'unknown', 'exclude']) {
      expect(
        getTeachingGuideForFormulaRecordV1({
          formulaId,
          availability,
        } as never),
      ).toBeUndefined();
    }
  });

  it('routes both metadata and page Guide resolution through the guard', () => {
    const pageSource = readFileSync(
      join(process.cwd(), 'src/app/[locale]/formulas/[formulaId]/page.tsx'),
      'utf8',
    );
    expect(pageSource).not.toContain('getPublishedFormulaGuideByFormulaId(');
    expect(
      pageSource.match(/getTeachingGuideForFormulaRecordV1\(routeRecord\.formulaRecord\)/g),
    ).toHaveLength(2);
  });

  it('forbids direct deep-Guide UUID lookup outside the route policy', () => {
    const allowed = new Set([
      join(process.cwd(), 'src/content/formula-guides.ts'),
      join(process.cwd(), 'src/content/teaching/guide-route-policy.ts'),
      join(
        process.cwd(),
        'src/content/teaching/restored-guide-projection.ts',
      ),
    ]);
    const offenders = sourceFiles(join(process.cwd(), 'src')).filter(
      (path) =>
        !allowed.has(path) &&
        readFileSync(path, 'utf8').includes('getPublishedFormulaGuideByFormulaId'),
    );
    expect(offenders).toEqual([]);
  });
});
