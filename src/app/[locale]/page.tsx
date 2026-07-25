import HomeClient from './HomeClient';
import HomeSeo from './HomeSeo';
import { softwareApplicationJsonLd, renderJsonLd } from '@/lib/json-ld';
import {
  galleryPresetConfigToPreset,
  parseGalleryPresetsFile,
  presetToSavedFractal,
} from '@/lib/gallery-presets';
import presetsFile from '../../../public/gallery-presets.json';

/**
 * Homepage — server component wrapper.
 *
 * Composes:
 *  - <HomeClient />   : existing full-screen fractal slideshow (client component)
 *  - <HomeSeo />      : server-rendered SEO content block (sr-only, AI-crawler readable)
 *
 * Pattern matches /explore: server wrapper + client interactive + SEO content.
 * Fixes GEO audit CRITICAL #2 (homepage had no H2/H3/FAQ structure for AIO citability).
 *
 * Also emits the SoftwareApplication JSON-LD so AI answer engines and Google
 * rich results correctly identify FractalPark as a free, MIT-licensed software
 * product — not just a website. (HIGH #4 from 2026-07-18 GEO audit.)
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const firstPresetConfig = parseGalleryPresetsFile(presetsFile).presets[0];
  const initialFractal = firstPresetConfig
    ? presetToSavedFractal(galleryPresetConfigToPreset(firstPresetConfig, locale))
    : null;

  return (
    <>
      {/* SoftwareApplication JSON-LD — homepage is the canonical software entity page */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: renderJsonLd(softwareApplicationJsonLd) }}
      />
      <HomeClient initialFractal={initialFractal} />
      <HomeSeo params={params} />
    </>
  );
}
