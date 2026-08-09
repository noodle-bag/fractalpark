import { SITE } from '@/lib/site';

/**
 * Public-project content contract — the single source of truth for product
 * facts shared by the GitHub README, the /[locale]/about page, the Explore
 * landing SSR content, the SoftwareApplication JSON-LD builder, and llms.txt.
 *
 * English canonical strings live here because the README is English-only.
 * messages/en.json `publicProject.*` must mirror these strings exactly
 * (enforced by src/test/public-project.test.ts); messages/zh.json holds the
 * Simplified Chinese projection used by the site.
 *
 * Boundaries: capabilities marked `current` are shipped today; `future`
 * entries are directions, not claims. Never describe accounts, cloud sync,
 * a public community, full Fractint compatibility, the complete historical
 * formula archive, Modern Coloring, general animation, or Deep Zoom as
 * available today.
 */

export const PUBLIC_PROJECT = {
  /** Approved single-sentence positioning. Used verbatim everywhere. */
  tagline:
    'FractalPark is an open-source, formula-first fractal knowledge and creation platform with growing Fractint-compatible FRM support, working to bring Fractint’s formula heritage into the modern browser.',

  url: SITE.url,
  repositoryUrl: SITE.repositoryUrl,
  version: SITE.version,
  license: {
    name: 'MIT',
    url: 'https://opensource.org/license/mit',
  },

  /** Verified product numbers. Keep in sync with the engine and content. */
  facts: {
    formulaCount: 94,
    formulaFamilyCount: 7,
    formulaGuideCount: 21,
    galleryPresetCount: 26,
    /** Includes the identity `none` transform, matching llms.txt. */
    transformCount: 7,
    /** 6 outside modes + 3 inside modes. */
    coloringModeCount: 9,
    maxExportScale: 4,
  },

  /** Real product render used as README hero, About hero, and Explore poster. */
  heroImage: {
    src: '/images/formulas/guides/mandelbrot.jpg',
    width: 1200,
    height: 750,
    altEn:
      'The Mandelbrot set rendered in real time by the FractalPark WebGL engine',
    altZh: 'FractalPark WebGL 引擎实时渲染的 Mandelbrot 集',
  },

  /** The four things a user can do today, in canonical order. */
  capabilities: [
    {
      id: 'discover',
      href: '/formulas',
      titleEn: 'Discover formulas',
      summaryEn:
        'Browse the Formula Atlas: 94 built-in formulas across 7 families, with 21 in-depth Formula Guides covering the math, history, and visual character of the classics.',
    },
    {
      id: 'create',
      href: '/explore',
      titleEn: 'Create in the browser',
      summaryEn:
        'Explore and render in real time with WebGL: Mandelbrot and Julia modes for every formula, 7 transforms, 9 coloring modes, gradients, lighting, and keyframe animation.',
    },
    {
      id: 'authorFrm',
      href: '/formulas/frm',
      titleEn: 'Author FRM',
      summaryEn:
        'Write custom formulas in the Fractint-compatible FRM language with the Guide and standalone Editor: AST validation, live GLSL preview, and clear diagnostics.',
    },
    {
      id: 'saveExport',
      href: '/gallery',
      titleEn: 'Save and share',
      summaryEn:
        'Save artworks and custom formulas to your private cloud with email sign-in and pick them up on any device, publish pieces to the community gallery, or create anonymously and export high-resolution PNG images up to 4× with SSAA anti-aliasing.',
    },
  ],

  /** Stable call-to-action destinations shared by README and About. */
  ctas: [
    { id: 'explore', labelEn: 'Open Explore', href: '/explore' },
    { id: 'formulas', labelEn: 'Browse the Formula Atlas', href: '/formulas' },
    { id: 'frmGuide', labelEn: 'Read the FRM Guide', href: '/formulas/frm' },
    { id: 'gallery', labelEn: 'Visit the Gallery', href: '/gallery' },
  ],

  /**
   * Current vs. future framing. `future` items are plans, not shipped
   * capabilities; wording must keep that boundary explicit.
   */
  boundaries: {
    currentEn: [
      'Growing Fractint-compatible FRM support: a practical, tested subset of the Fractint formula language runs today — not a complete Fractint reimplementation.',
      'Creating needs no account. Saving artworks and formulas uses email one-time-code sign-in and stores them in your private cloud library; publishing is always explicit, and artworks carrying a custom formula publish its source under the MIT license.',
      'The interface is available in seven languages: English, Simplified Chinese, Portuguese, Korean, Russian, Spanish, and French.',
    ],
    futureEn: [
      'Working to bring Fractint’s historical formula archive into the modern browser over time.',
      'Deeper coloring, animation, and zoom capabilities are on the roadmap but not released.',
    ],
  },
} as const;

export type PublicProjectCapability =
  (typeof PUBLIC_PROJECT.capabilities)[number];
export type PublicProjectCta = (typeof PUBLIC_PROJECT.ctas)[number];

export function capabilityById(
  id: PublicProjectCapability['id']
): PublicProjectCapability {
  const capability = PUBLIC_PROJECT.capabilities.find((c) => c.id === id);
  if (!capability) {
    throw new Error(`Unknown public-project capability: ${id}`);
  }
  return capability;
}

/** Absolute site URL for a locale-aware in-site destination. */
export function publicProjectHref(href: string, locale?: string): string {
  return locale ? `${SITE.url}/${locale}${href}` : `${SITE.url}${href}`;
}
