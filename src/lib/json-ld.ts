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

const JSON_LD_LANGUAGE_BY_LOCALE: Readonly<Record<string, string>> = Object.freeze({
  en: 'en',
  zh: 'zh-CN',
  pt: 'pt-BR',
  ko: 'ko-KR',
  ru: 'ru-RU',
  es: 'es-ES',
  fr: 'fr-FR',
});

/** BCP 47 language tags for JSON-LD `inLanguage`, derived from routing. */
const IN_LANGUAGE: readonly string[] = routing.locales.map((locale) => {
  return JSON_LD_LANGUAGE_BY_LOCALE[locale] ?? locale;
});

export interface FormulaTeachingJsonLdOptionsV1 {
  readonly url: string;
  readonly locale: string;
  readonly formulaId: string;
  readonly canonicalName: string;
  readonly name: string;
  readonly description: string;
  readonly image?: Readonly<{ url: string; width: number; height: number }>;
  readonly breadcrumb?: object;
}

export function buildFormulaTeachingJsonLdV1(
  options: FormulaTeachingJsonLdOptionsV1,
) {
  return {
    '@context': 'https://schema.org',
    '@type': ['WebPage', 'LearningResource'],
    '@id': `${options.url}#learning-resource`,
    url: options.url,
    name: options.name,
    description: options.description,
    inLanguage: JSON_LD_LANGUAGE_BY_LOCALE[options.locale] ?? options.locale,
    learningResourceType: 'Interactive formula guide',
    educationalUse: 'instruction',
    isPartOf: { '@id': `${baseUrl}/#website` },
    about: {
      '@type': 'Thing',
      identifier: options.formulaId,
      name: options.canonicalName,
    },
    license: PUBLIC_PROJECT.license.url,
    provider: {
      '@type': 'Organization',
      '@id': `${baseUrl}/#organization`,
      name: `${SITE.name} Project`,
      url: baseUrl,
    },
    ...(options.image
      ? {
          primaryImageOfPage: {
            '@type': 'ImageObject',
            ...options.image,
          },
        }
      : {}),
    ...(options.breadcrumb ? { breadcrumb: options.breadcrumb } : {}),
  } as const;
}

export interface FormulaRecordJsonLdOptionsV1 {
  readonly url: string;
  readonly directoryUrl: string;
  readonly locale: string;
  readonly formulaId: string;
  readonly canonicalName: string;
  readonly name: string;
  readonly description: string;
}

export function buildFormulaRecordJsonLdV1(
  options: FormulaRecordJsonLdOptionsV1,
) {
  const formulaEntityId = `${options.url}#formula`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${options.url}#webpage`,
        url: options.url,
        name: options.name,
        description: options.description,
        inLanguage: JSON_LD_LANGUAGE_BY_LOCALE[options.locale] ?? options.locale,
        isPartOf: { '@id': `${baseUrl}/#website` },
        mainEntity: { '@id': formulaEntityId },
      },
      {
        '@type': 'DefinedTerm',
        '@id': formulaEntityId,
        name: options.canonicalName,
        termCode: options.formulaId,
        inDefinedTermSet: {
          '@type': 'DefinedTermSet',
          '@id': `${options.directoryUrl}#formula-directory`,
          url: options.directoryUrl,
        },
      },
    ],
  } as const;
}

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
      'Interface available in seven languages (English, Simplified Chinese, Portuguese, Korean, Russian, Spanish, French)',
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
