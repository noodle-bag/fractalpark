import { describe, expect, it } from 'vitest';

import { PUBLISHED_FORMULA_GUIDES } from '@/content/formula-guides';
import { STANDARD_MANIFEST_INDEX_V1 } from '@/engine/formulas/v1/standard-manifest';
import {
  FORMULA_ROUTE_RECORD_REVISION_V1,
  buildFormulaCanonicalPathV1,
  buildFormulaRouteRecordV1,
  resolveFormulaRouteV1,
} from '@/lib/formula-routes';

describe('canonical formula routes v1', () => {
  it('resolves all 677 frozen Standard IDs to unique canonical paths', () => {
    const paths = new Set<string>();

    for (const formulaId of STANDARD_MANIFEST_INDEX_V1.formulaIds) {
      expect(resolveFormulaRouteV1(formulaId)).toEqual({
        kind: 'canonical',
        formulaId,
      });
      paths.add(buildFormulaCanonicalPathV1(formulaId));
    }

    expect(paths).toHaveLength(677);
  });

  it('resolves exactly 21 Guide slugs as legacy redirects', () => {
    const targets = new Set<string>();

    for (const guide of PUBLISHED_FORMULA_GUIDES) {
      const formulaId = STANDARD_MANIFEST_INDEX_V1.resolveAlias(
        'guide-slug',
        guide.slug,
      );
      expect(formulaId).toBeDefined();
      expect(resolveFormulaRouteV1(guide.slug)).toEqual({
        kind: 'legacy-redirect',
        formulaId,
      });
      targets.add(buildFormulaCanonicalPathV1(formulaId!));
    }

    const manifestGuideAliases = STANDARD_MANIFEST_INDEX_V1.formulaIds.flatMap(
      (formulaId) =>
        STANDARD_MANIFEST_INDEX_V1.aliasesFor(formulaId).filter(
          (alias) => alias.kind === 'guide-slug',
        ),
    );
    expect(PUBLISHED_FORMULA_GUIDES).toHaveLength(21);
    expect(manifestGuideAliases).toHaveLength(21);
    expect(new Set(manifestGuideAliases.map((alias) => alias.value))).toEqual(
      new Set(PUBLISHED_FORMULA_GUIDES.map((guide) => guide.slug)),
    );
    expect(targets).toHaveLength(21);
  });

  it('fails closed for unknown, malformed, and non-canonical UUID values', () => {
    const canonical = STANDARD_MANIFEST_INDEX_V1.formulaIds[0];

    expect(resolveFormulaRouteV1('not-a-formula')).toEqual({
      kind: 'not-found',
    });
    expect(resolveFormulaRouteV1(canonical.toUpperCase())).toEqual({
      kind: 'not-found',
    });
    expect(
      resolveFormulaRouteV1('00000000-0000-5000-8000-000000000000'),
    ).toEqual({ kind: 'not-found' });
  });

  it('projects a revision- and locale-keyed route record without executable assets', () => {
    const formulaId = STANDARD_MANIFEST_INDEX_V1.formulaIds[0];
    const record = buildFormulaRouteRecordV1(
      formulaId,
      FORMULA_ROUTE_RECORD_REVISION_V1,
      'zh',
    );

    expect(record).toMatchObject({
      formulaId,
      recordRevision: FORMULA_ROUTE_RECORD_REVISION_V1,
      locale: 'zh',
    });
    expect(record?.displayName).toBeTruthy();
    expect(record?.primaryFamily).toBeTruthy();
    expect(record).not.toHaveProperty('source');
    expect(record).not.toHaveProperty('profile');
    expect(record).not.toHaveProperty('runtime');
    expect(buildFormulaRouteRecordV1(formulaId, 'stale', 'zh')).toBeUndefined();
    expect(
      buildFormulaRouteRecordV1(
        formulaId,
        FORMULA_ROUTE_RECORD_REVISION_V1,
        '',
      ),
    ).toBeUndefined();
  });
});
