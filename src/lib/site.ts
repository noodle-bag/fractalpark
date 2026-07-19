export const SITE = {
  name: 'FractalPark',
  nameZh: '\u5206\u5f62\u516c\u56ed',
  url: 'https://www.fractalpark.com',
  domain: 'www.fractalpark.com',
  repositoryUrl: 'https://github.com/noodle-bag/fractalpark',
  version: '0.4.11',
  formulaCount: 94,
  ogImage: '/opengraph-image',
} as const;

export function localizedSiteName(locale: string): string {
  return locale === 'zh' ? SITE.nameZh : SITE.name;
}

export function buildLocaleAlternates(path = ''): Record<string, string> {
  return {
    en: `${SITE.url}/en${path}`,
    zh: `${SITE.url}/zh${path}`,
    'x-default': `${SITE.url}/en${path}`,
  };
}
