import { describe, expect, it } from 'vitest';

import enMessages from '../../messages/en.json';
import esMessages from '../../messages/es.json';
import frMessages from '../../messages/fr.json';
import koMessages from '../../messages/ko.json';
import ptMessages from '../../messages/pt.json';
import ruMessages from '../../messages/ru.json';
import zhMessages from '../../messages/zh.json';

const localeSemantics = {
  en: enMessages.cloud.customFormulas.semantics,
  zh: zhMessages.cloud.customFormulas.semantics,
  pt: ptMessages.cloud.customFormulas.semantics,
  ko: koMessages.cloud.customFormulas.semantics,
  ru: ruMessages.cloud.customFormulas.semantics,
  es: esMessages.cloud.customFormulas.semantics,
  fr: frMessages.cloud.customFormulas.semantics,
} as const;

const STALE_IDENTICAL_RENDERING_CLAIMS = [
  'Rendering is visually identical today',
  'Rendering stays visually identical today',
  '当前渲染效果完全相同',
  '当前渲染效果保持不变',
];

describe('FRM semantics locale contract', () => {
  it('keeps every Upgrade & Compare key complete in all seven locales', () => {
    const expectedKeys = Object.keys(localeSemantics.en).sort();
    expect(expectedKeys).toHaveLength(42);

    for (const [locale, messages] of Object.entries(localeSemantics)) {
      expect(Object.keys(messages).sort(), locale).toEqual(expectedKeys);
      for (const [key, value] of Object.entries(messages)) {
        expect(value, `${locale}.${key}`).toBeTypeOf('string');
        expect(String(value).trim(), `${locale}.${key}`).not.toBe('');
      }
    }
  });

  it('does not claim the v1 and v2 render contracts are still identical', () => {
    for (const [locale, messages] of Object.entries(localeSemantics)) {
      const copy = Object.values(messages).join('\n');
      for (const staleClaim of STALE_IDENTICAL_RENDERING_CLAIMS) {
        expect(copy, locale).not.toContain(staleClaim);
      }
    }
  });
});
