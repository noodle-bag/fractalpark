import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from '@/i18n/supported-locales';
import {
  renderLegacyFormulaDirectoryGoneHtmlV1,
  resolveLegacyFormulaDirectoryStatusV1,
} from '@/lib/formula-directory-status';

function resolve(path: string) {
  return resolveLegacyFormulaDirectoryStatusV1(
    new URL(path, 'https://www.fractalpark.com'),
  );
}

describe('legacy Formula Directory status URLs', () => {
  it('passes canonical Directory and unrelated routes through', () => {
    expect(resolve('/en/formulas/directory')).toEqual({ kind: 'pass' });
    expect(resolve('/en/formulas/directory?q=dragon')).toEqual({ kind: 'pass' });
    expect(resolve('/en/formulas')).toEqual({ kind: 'pass' });
  });

  it('permanently redirects published status URLs and preserves only valid state', () => {
    expect(
      resolve(
        '/zh/formulas/directory/?status=published&q= dragon &category=classic&sort=name-desc&page=4&internal=hold',
      ),
    ).toEqual({
      kind: 'redirect',
      location:
        'https://www.fractalpark.com/zh/formulas/directory?q=dragon&category=classic&sort=name-desc',
    });
    expect(
      resolve(
        '/en/formulas/directory?status=published&q=&category=invalid&sort=random&page=1',
      ),
    ).toEqual({
      kind: 'redirect',
      location: 'https://www.fractalpark.com/en/formulas/directory',
    });
  });

  it('fails duplicate or unknown status values closed as 404', () => {
    expect(
      resolve('/en/formulas/directory?status=published&status=published'),
    ).toEqual({ kind: 'not-found' });
    expect(resolve('/en/formulas/directory?status=unknown')).toEqual({
      kind: 'not-found',
    });
    expect(resolve('/en/formulas/directory?status=Published')).toEqual({
      kind: 'not-found',
    });
  });

  it('returns a localized, metadata-free 410 projection for held status', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const result = resolve(`/${locale}/formulas/directory?status=held`);
      expect(result).toEqual({ kind: 'gone', locale });
      const html = renderLegacyFormulaDirectoryGoneHtmlV1(locale);
      expect(html).toContain(`lang="`);
      expect(html).toContain(`href="/${locale}/formulas/directory"`);
      expect(html).toContain('noindex, follow');
      expect(html).not.toContain('143');
      expect(html).not.toContain('status=held');
      expect(html).not.toContain('publicationDecision');
      expect(html).not.toContain('holdReason');
    }
  });
});
