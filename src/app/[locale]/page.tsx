import HomeClient from './HomeClient';
import HomeSeo from './HomeSeo';
import { softwareApplicationJsonLd, renderJsonLd } from '@/lib/json-ld';

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
  return (
    <>
      {/* SoftwareApplication JSON-LD — homepage is the canonical software entity page */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: renderJsonLd(softwareApplicationJsonLd) }}
      />
      <HomeClient />
      <HomeSeo params={params} />
    </>
  );
}
