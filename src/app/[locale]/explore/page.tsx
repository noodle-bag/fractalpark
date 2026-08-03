import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import ExploreClient from './ExploreClient';
import ExploreLanding from './ExploreLanding';
import { buildSoftwareApplicationJsonLd, renderJsonLd } from '@/lib/json-ld';
import { PUBLIC_PROJECT } from '@/content/public-project';

/**
 * Explore page — server component wrapper.
 *
 * Explore is the default landing and the canonical product entity page:
 *  - emits the shared SoftwareApplication JSON-LD (single stable `@id`,
 *    facts from the public-project content contract);
 *  - the workspace is progressively enhanced: the initial HTML ships a
 *    fixed-size static poster with a descriptive alt, then the WebGL
 *    workspace takes over;
 *  - visible, bilingual SSR product content follows the workspace
 *    (<ExploreLanding />), readable without JavaScript.
 */
export default async function ExplorePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tProduct = await getTranslations({ locale, namespace: 'publicProject' });
  const tLanding = await getTranslations({ locale, namespace: 'explore.landing' });
  const facts = PUBLIC_PROJECT.facts;
  const poster = PUBLIC_PROJECT.heroImage;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: renderJsonLd(
            buildSoftwareApplicationJsonLd({
              description: tProduct('aiDescription', { ...facts }),
            })
          ),
        }}
      />
      <Suspense
        fallback={
          <div className="relative h-[calc(100dvh-3rem)] overflow-hidden bg-black">
            {/* Static poster: fixed dimensions + descriptive alt; replaced by
                the WebGL workspace once the client bundle hydrates. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={poster.src}
              width={poster.width}
              height={poster.height}
              alt={tLanding('posterAlt')}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        }
      >
        <ExploreClient posterImage={poster.src} />
      </Suspense>
      <ExploreLanding params={params} />
    </>
  );
}
