import { SITE } from '@/lib/site';

/**
 * Centralized JSON-LD structured data for FractalPark.
 *
 * Three canonical schemas, deployed at different layers:
 *
 *  - `websiteJsonLd`           → root [locale] layout (every page)
 *  - `softwareApplicationJsonLd` → homepage (and any product-focused page)
 *  - About page keeps its own, more detailed SoftwareApplication variant
 *    (extends the base with datePublished, softwareVersion, richer featureList)
 *
 * Why a single source of truth:
 *  - Stable `@id` values let Google / AI crawlers deduplicate the entity
 *    across pages, which is what actually builds Knowledge Graph presence.
 *  - Prevents drift between homepage / about / explore schemas.
 */

const baseUrl = SITE.url;
const ogImage = `${baseUrl}${SITE.ogImage}`;

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
  description:
    'Free, open-source (MIT) WebGL fractal generator that runs entirely in the browser. Explore 94 fractal formulas with real-time rendering and high-resolution PNG export.',
  inLanguage: ['en', 'zh-CN'],
  publisher: {
    '@type': 'Organization',
    '@id': `${baseUrl}/#organization`,
    name: `${SITE.name} Project`,
    url: baseUrl,
  },
} as const;

/**
 * SoftwareApplication schema — emitted on the homepage.
 * Tells Google and AI answer engines "this site is a software product",
 * enabling rich results and accurate AI summaries.
 */
export const softwareApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': `${baseUrl}/#software`,
  name: SITE.name,
  alternateName: SITE.nameZh,
  url: baseUrl,
  description:
    'Free, open-source MIT-licensed browser fractal generator featuring 94 formulas, real-time WebGL rendering, and high-resolution PNG export up to 4×.',
  applicationCategory: 'GraphicsApplication',
  applicationSubCategory: 'Fractal generator',
  operatingSystem: 'Any (web browser with WebGL 1.0)',
  browserRequirements: 'Requires WebGL 1.0',
  softwareVersion: SITE.version,
  license: 'https://opensource.org/license/mit',
  codeRepository: SITE.repositoryUrl,
  screenshot: ogImage,
  image: ogImage,
  isAccessibleForFree: true,
  inLanguage: ['en', 'zh-CN'],
  featureList: [
    '94 GLSL fractal formulas across 7 families (Classic, Burning Ship, Newton, Phoenix, Transcendental, Magnet, Exotic)',
    'Mandelbrot and Julia modes for every formula',
    'Real-time WebGL rendering at 60 fps',
    '7 coloring modes including smooth iteration, orbit traps, and custom gradients',
    'High-resolution PNG export up to 4× with SSAA anti-aliasing',
    'Shareable URLs that encode the exact view and parameters',
    'Custom formula editor with AST validation and live preview',
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

/**
 * Helper: serialize a JSON-LD object for use inside <script type="application/ld+json">.
 * JSON.stringify with the default replacer is safe here because the schema
 * contains no user-controlled strings.
 */
export function renderJsonLd(data: object): string {
  return JSON.stringify(data);
}
