import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/i18n/supported-locales';

export const SITE = {
  name: 'FractalPark',
  nameZh: '分形公园',
  url: 'https://www.fractalpark.com',
  domain: 'www.fractalpark.com',
  repositoryUrl: 'https://github.com/noodle-bag/fractalpark',
  version: '0.4.19',
  formulaCount: 534,
  ogImage: '/opengraph-image',
} as const;

export function localizedSiteName(locale: string): string {
  return locale === 'zh' ? SITE.nameZh : SITE.name;
}

export function buildLocaleAlternates(path = ''): Record<string, string> {
  const alternates: Record<string, string> = {};
  for (const locale of SUPPORTED_LOCALES) {
    alternates[locale] = `${SITE.url}/${locale}${path}`;
  }
  alternates['x-default'] = `${SITE.url}/${DEFAULT_LOCALE}${path}`;
  return alternates;
}
