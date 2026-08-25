import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import {
  DEFAULT_LOCALE,
  HTML_LANG,
  OG_LOCALE,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from '@/i18n/supported-locales';
import {
  dynamicParams,
  htmlLangForLocale,
  isSupportedLocaleRoute,
} from '@/app/[locale]/layout';

describe('locale metadata maps', () => {
  it('allows child route fallbacks while rejecting unsupported locale values', () => {
    expect(dynamicParams).toBe(true);
    for (const locale of SUPPORTED_LOCALES) {
      expect(isSupportedLocaleRoute(locale)).toBe(true);
    }
    expect(isSupportedLocaleRoute('de')).toBe(false);
    expect(isSupportedLocaleRoute('EN')).toBe(false);
  });

  it('covers every supported locale exactly once', () => {
    expect(Object.keys(HTML_LANG).sort()).toEqual([...SUPPORTED_LOCALES].sort());
    expect(Object.keys(OG_LOCALE).sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it('maps each locale to a distinct html lang tag', () => {
    const values = SUPPORTED_LOCALES.map((l) => HTML_LANG[l]);
    expect(new Set(values).size).toBe(SUPPORTED_LOCALES.length);
    expect(HTML_LANG.zh).toBe('zh-CN');
    expect(HTML_LANG.pt).toBe('pt-BR');
    expect(HTML_LANG.ko).toBe('ko-KR');
    expect(HTML_LANG.ru).toBe('ru-RU');
    expect(HTML_LANG.es).toBe('es-ES');
    expect(HTML_LANG.fr).toBe('fr-FR');
  });

  it('maps each locale to a distinct Open Graph locale code', () => {
    const values = SUPPORTED_LOCALES.map((l) => OG_LOCALE[l]);
    expect(new Set(values).size).toBe(SUPPORTED_LOCALES.length);
    for (const value of values) {
      expect(value).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
    }
  });

  it('htmlLangForLocale never falls back to en for a supported non-en locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const lang = htmlLangForLocale(locale);
      expect(lang).toBe(HTML_LANG[locale]);
      if (locale !== DEFAULT_LOCALE) {
        expect(lang).not.toBe(HTML_LANG[DEFAULT_LOCALE]);
      }
    }
  });

  it('htmlLangForLocale passes through unknown locales defensively', () => {
    expect(htmlLangForLocale('de' as SupportedLocale)).toBe('de');
  });

  it('every locale carries the Editor compat-status keys (Slice 7e2)', () => {
    for (const locale of [...SUPPORTED_LOCALES]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages: any = JSON.parse(
        readFileSync(join(__dirname, '../../messages', `${locale}.json`), 'utf-8'),
      );
      const frmEditor = messages.frmEditor;
      expect(frmEditor, `${locale}.json missing frmEditor`).toBeTruthy();
      const c = frmEditor.compat;
      expect(c, `${locale}.json missing frmEditor.compat keys (Slice 7e2)`).toBeTypeOf('object');
      expect(c.level, `missing level object in ${locale}`).toBeTypeOf('object');
      for (const sub of ['supported', 'adapted', 'readOnly', 'invalid']) {
        expect(
          (c.level as Record<string, unknown>)[sub],
          `missing level.${sub} in ${locale}`,
        ).toBeTypeOf('string');
      }
      for (const key of ['entriesTitle', 'select', 'blockingTag', 'lineJump', 'summary']) {
        expect(
          (c as Record<string, unknown>)[key],
          `missing ${key} in ${locale}`,
        ).toBeTypeOf('string');
      }
    }
  });

  it('every locale carries accessible custom-formula action labels', () => {
    for (const locale of [...SUPPORTED_LOCALES]) {
      const messages = JSON.parse(
        readFileSync(join(__dirname, '../../messages', `${locale}.json`), 'utf-8'),
      ) as {
        explore: { formula: { customLibrary: Record<string, unknown> } };
      };
      const customLibrary = messages.explore.formula.customLibrary;
      for (const key of ['renameAction', 'editAction', 'deleteAction']) {
        const value = customLibrary[key];
        expect(value, `missing ${key} in ${locale}`).toBeTypeOf('string');
        expect(String(value), `${key} in ${locale} must identify the formula`).toContain(
          '{name}',
        );
      }
    }
  });

  it('Editor persistence copy is cloud-only in every locale', () => {
    const localPersistenceMarkers: Record<SupportedLocale, RegExp> = {
      en: /\blocal(?:ly)?\b/i,
      zh: /本地/,
      pt: /local(?:mente)?/i,
      ko: /로컬/,
      ru: /локал/i,
      es: /local(?:mente)?/i,
      fr: /local(?:ement)?/i,
    };

    for (const locale of [...SUPPORTED_LOCALES]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages: any = JSON.parse(
        readFileSync(join(__dirname, '../../messages', `${locale}.json`), 'utf-8'),
      );
      const values = [
        messages.explore.editor.savedDescription,
        messages.frmEditor.saved,
        messages.frmEditor.saveError,
        messages.frmEditor.errors.formulaNotFound,
        messages.frmEditor.errors.storageUnavailable,
        messages.formulas.index.frm.description,
        messages.formulas.index.cta.description,
        messages.formulas.frmGuide.sections.tutorials.editorNote,
        messages.formulas.frmGuide.sections['next-steps'].editorNote,
        messages.frmEditor.unknownExample,
      ];

      expect(values, `${locale} Editor cloud-only copy count`).toHaveLength(10);
      for (const value of values) {
        expect(value, `${locale} Editor cloud-only copy`).toBeTypeOf('string');
        expect(String(value).trim(), `${locale} Editor cloud-only copy`).not.toBe('');
        expect(String(value), `${locale} still claims local formula persistence`).not.toMatch(
          localPersistenceMarkers[locale],
        );
      }
    }
  });

  it('no private corpus text leaks into the public repo (Slice 7f leakage scan)', () => {
    const cmd =
      `git grep -l -E 'frm-corpus|fractint/?(float)?/formulas|ledger-row-sha256|f588_level2_report\\.json' -- ':!docs/specs/*' ':!scripts/*' ':!tests/e2e/.fixtures/*' ':!resources/formula-library/v1/formula-record-provenance.v1.json' ':!src/engine/formulas/v1/record-provenance.ts' ':!src/engine/frm/compat-report.ts' ':!src/test/*'`;
    let leaked = '';
    try {
      leaked = execSync(cmd, { encoding: 'utf-8' }).trim();
    } catch {
      /* git grep exit-1 = no matches */
    }
    if (leaked) {
      const files = execSync(
        `git grep -l -E 'frm-corpus|fractint/?(float)?/formulas' -- ':!docs/specs/*' ':!scripts/*' ':!tests/e2e/.fixtures/*' ':!resources/formula-library/v1/formula-record-provenance.v1.json' ':!src/engine/formulas/v1/record-provenance.ts' ':!src/engine/frm/compat-report.ts' ':!src/test/*'`,
        { encoding: 'utf-8' },
      ).trim();
      const allowed = new Set(['.hermes', 'obsidian', 'node_modules', '.git']);
      const violations = files.split('\n').filter((f) => f && !allowed.has(f.split('/')[0]));
      expect(violations, `private corpus references found in ${violations.length} file(s)`).toEqual(
        [],
      );
    }
  });
});
