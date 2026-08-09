import { PUBLIC_PROJECT } from '@/content/public-project';
import { routing } from '@/i18n/routing';
import { SITE } from '@/lib/site';

/**
 * Centralized JSON-LD structured data for FractalPark.
 *
 * Two canonical schemas:
 *
 *  - `websiteJsonLd`                    → [locale] layout (every page)
 *  - `buildSoftwareApplicationJsonLd()` → Explore landing (the default product
 *    entity page) and the About page (which adds a small set of page-consistent
 *    extensions such as datePublished and programmingLanguage)
 *
 * Why a single builder:
 *  - One stable `@id` (`/#software`) lets Google / AI crawlers deduplicate the
 *    entity across pages, which is what actually builds Knowledge Graph
 *    presence.
 *  - Feature facts come from the public-project content contract, so the
 *    numbers cannot drift between Explore, About, README, and llms.txt.
 */

const baseUrl = SITE.url;
const ogImage = `${baseUrl}${SITE.ogImage}`;

/** BCP 47 language tags for JSON-LD `inLanguage`, derived from routing. */
const IN_LANGUAGE: readonly string[] = routing.locales.map((locale) => {
  const map: Record<string, string> = {
    en: 'en',
    zh: 'zh-CN',
    pt: 'pt-BR',
    ko: 'ko-KR',
    ru: 'ru-RU',
    es: 'es-ES',
    fr: 'fr-FR',
  };
  return map[locale] ?? locale;
});

/**
 * WebSite schema — emitted on every page via [locale]/layout.tsx.
 * Establishes the site entity and points at the SoftwareApplication it hosts.
 */
export const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${baseUrl}/#website`,
  name: SITE.name,
  alternateName: SITE.nameZh,
  url: baseUrl,
  description: PUBLIC_PROJECT.tagline,
  inLanguage: IN_LANGUAGE,
  publisher: {
    '@type': 'Organization',
    '@id': `${baseUrl}/#organization`,
    name: `${SITE.name} Project`,
    url: baseUrl,
  },
} as const;

export interface SoftwareApplicationJsonLdOptions {
  /**
   * Localized product description. Callers should pass the
   * `publicProject.aiDescription` message with contract numbers applied.
   * Defaults to the approved English tagline.
   */
  description?: string;
}

/**
 * SoftwareApplication schema — the product entity. Emitted on the Explore
 * landing page; the About page spreads this object and appends its
 * page-consistent extensions (datePublished, programmingLanguage, …).
 */
export function buildSoftwareApplicationJsonLd(
  options: SoftwareApplicationJsonLdOptions = {}
) {
  const { facts } = PUBLIC_PROJECT;

  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${baseUrl}/#software`,
    name: SITE.name,
    alternateName: SITE.nameZh,
    url: baseUrl,
    description: options.description ?? PUBLIC_PROJECT.tagline,
    applicationCategory: 'GraphicsApplication',
    applicationSubCategory: 'Fractal generator',
    operatingSystem: 'Any (web browser with WebGL 1.0)',
    browserRequirements: 'Requires WebGL 1.0',
    softwareVersion: PUBLIC_PROJECT.version,
    license: PUBLIC_PROJECT.license.url,
    codeRepository: PUBLIC_PROJECT.repositoryUrl,
    screenshot: ogImage,
    image: ogImage,
    isAccessibleForFree: true,
    inLanguage: IN_LANGUAGE,
    featureList: [
      `${facts.formulaCount} GLSL fractal formulas across ${facts.formulaFamilyCount} families (Classic, Burning Ship, Newton, Phoenix, Transcendental, Magnet, Exotic)`,
      'Mandelbrot and Julia modes for every formula',
      'Real-time WebGL rendering',
      `${facts.coloringModeCount} coloring modes including smooth iteration, orbit traps, and custom gradients`,
      `${facts.transformCount} UV transform plugins`,
      'Fractint-compatible FRM formula language with a Guide and standalone Editor',
      `${facts.formulaGuideCount} in-depth Formula Guides`,
      `High-resolution PNG export up to ${facts.maxExportScale}× with SSAA anti-aliasing`,
      'Shareable URLs that encode the exact view and parameters',
      'Local on-device artwork storage; no account required',
      'Bilingual interface (English and Simplified Chinese)',
    ],
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
    author: {
      '@type': 'Organization',
      '@id': `${baseUrl}/#organization`,
      name: `${SITE.name} Project`,
      url: baseUrl,
    },
    publisher: {
      '@type': 'Organization',
      '@id': `${baseUrl}/#organization`,
      name: `${SITE.name} Project`,
      url: baseUrl,
    },
  } as const;
}

/**
 * Helper: serialize a JSON-LD object for use inside <script type="application/ld+json">.
 * Angle brackets and ampersands become JSON unicode escapes, so embedded
 * user-controlled strings — community titles, descriptions, author display
 * names — can never break out of the script element. Semantically
 * identical JSON.
 */
export function renderJsonLd(data: object): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}
