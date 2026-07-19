import HomeClient from './HomeClient';
import HomeSeo from './HomeSeo';

/**
 * Homepage — server component wrapper.
 *
 * Composes:
 *  - <HomeClient />   : existing full-screen fractal slideshow (client component)
 *  - <HomeSeo />      : server-rendered SEO content block (sr-only, AI-crawler readable)
 *
 * Pattern matches /explore: server wrapper + client interactive + SEO content.
 * Fixes GEO audit CRITICAL #2 (homepage had no H2/H3/FAQ structure for AIO citability).
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return (
    <>
      <HomeClient />
      <HomeSeo params={params} />
    </>
  );
}
