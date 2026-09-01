import { describe, expect, it } from 'vitest';

import {
  parsePublishedFormulaExploreIntent,
  stripPublishedFormulaExploreIntent,
} from '@/lib/published-formula-handoff';

const FORMULA_ID = '1cd7a16f-0474-5b8f-a974-e122ea893769';

describe('published Formula Record to Explore handoff', () => {
  it('accepts only the explicit Standard formula handoff', () => {
    expect(
      parsePublishedFormulaExploreIntent(
        new URLSearchParams(`open=standard-formula&formula=${FORMULA_ID}`)
      )
    ).toEqual({ status: 'valid', formulaId: FORMULA_ID, action: 'open' });
    expect(
      parsePublishedFormulaExploreIntent(
        new URLSearchParams(`open=other&formula=${FORMULA_ID}`)
      )
    ).toEqual({ status: 'none' });
  });

  it('preserves an explicit anonymous remix intent until one-shot consumption', () => {
    const params = new URLSearchParams(
      `open=standard-formula&formula=${FORMULA_ID}&intent=remix`
    );
    expect(parsePublishedFormulaExploreIntent(params)).toEqual({
      status: 'valid',
      formulaId: FORMULA_ID,
      action: 'remix',
    });
    expect(stripPublishedFormulaExploreIntent('en', params)).toBe('/en/explore');
  });

  it('rejects duplicate handoff parameters instead of choosing the first value', () => {
    const duplicateCases = [
      `open=standard-formula&open=standard-formula&formula=${FORMULA_ID}`,
      `open=standard-formula&formula=${FORMULA_ID}&formula=00e14aa8-b766-54ea-a359-3f5d20d329b7`,
      `open=standard-formula&formula=${FORMULA_ID}&intent=open&intent=remix`,
    ];
    for (const query of duplicateCases) {
      expect(
        parsePublishedFormulaExploreIntent(new URLSearchParams(query))
      ).toMatchObject({ status: 'invalid', reason: 'duplicate' });
    }
  });

  it('fails closed for missing, malformed, uppercase IDs, and unknown intents', () => {
    expect(
      parsePublishedFormulaExploreIntent(
        new URLSearchParams('open=standard-formula')
      )
    ).toEqual({ status: 'invalid', formulaId: '', reason: 'missing' });
    expect(
      parsePublishedFormulaExploreIntent(
        new URLSearchParams('open=standard-formula&formula=not-an-id')
      )
    ).toEqual({
      status: 'invalid',
      formulaId: 'not-an-id',
      reason: 'invalid-id',
    });
    expect(
      parsePublishedFormulaExploreIntent(
        new URLSearchParams(
          `open=standard-formula&formula=${FORMULA_ID.toUpperCase()}`
        )
      )
    ).toEqual({
      status: 'invalid',
      formulaId: FORMULA_ID.toUpperCase(),
      reason: 'invalid-id',
    });
    expect(
      parsePublishedFormulaExploreIntent(
        new URLSearchParams(
          `open=standard-formula&formula=${FORMULA_ID}&intent=replace`
        )
      )
    ).toEqual({
      status: 'invalid',
      formulaId: FORMULA_ID,
      reason: 'invalid-intent',
    });
  });

  it('strips only the one-shot handoff parameters', () => {
    expect(
      stripPublishedFormulaExploreIntent(
        'zh',
        new URLSearchParams(
          `open=standard-formula&formula=${FORMULA_ID}&intent=remix&palette=4`
        )
      )
    ).toBe('/zh/explore?palette=4');
    expect(
      stripPublishedFormulaExploreIntent(
        'en',
        new URLSearchParams(`open=standard-formula&formula=${FORMULA_ID}`)
      )
    ).toBe('/en/explore');
  });
});
