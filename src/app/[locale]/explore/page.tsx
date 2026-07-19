import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import ExploreClient from './ExploreClient';

/**
 * Explore page — server component wrapper.
 *
 * SSR strategy:
 * 1. Renders an SEO-friendly content block (tool intro, steps, formula families, FAQ)
 *    directly into the HTML so AI crawlers (GPTBot, PerplexityBot, ClaudeBot) can read
 *    meaningful content without executing JavaScript.
 * 2. The interactive fractal explorer (Canvas + panels) remains a client component
 *    hydrated on top of the static shell.
 *
 * Fixes GEO audit CRITICAL #1: previously /en/explore returned only ~194 chars of
 * non-whitespace to no-JS crawlers — a hollow shell.
 */
export default async function ExplorePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'explore.seo' });

  return (
    <>
      {/* SEO content block — visually collapsible, always present in HTML */}
      <section
        id="explore-seo-intro"
        aria-labelledby="explore-seo-heading"
        className="border-b bg-muted/30 px-4 py-8 sm:px-8"
      >
        <div className="mx-auto max-w-4xl">
          <h1
            id="explore-seo-heading"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            {t('heading')}
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
            {t('intro')}
          </p>

          <h2 className="mt-8 text-xl font-semibold tracking-tight">
            {t('howToHeading')}
          </h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-6 text-muted-foreground">
            <li>{t('howToSteps.0')}</li>
            <li>{t('howToSteps.1')}</li>
            <li>{t('howToSteps.2')}</li>
            <li>{t('howToSteps.3')}</li>
            <li>{t('howToSteps.4')}</li>
          </ol>

          <h2 className="mt-8 text-xl font-semibold tracking-tight">
            {t('familiesHeading')}
          </h2>
          <p className="mt-2 text-muted-foreground">{t('familiesIntro')}</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-3 py-2 text-left font-medium">
                    {t('familiesTable.colFamily')}
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    {t('familiesTable.colExamples')}
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    {t('familiesTable.colCharacter')}
                  </th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="px-3 py-2 font-medium text-foreground">
                    {t('familiesTable.rows.classic.name')}
                  </td>
                  <td className="px-3 py-2">
                    {t('familiesTable.rows.classic.examples')}
                  </td>
                  <td className="px-3 py-2">
                    {t('familiesTable.rows.classic.character')}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2 font-medium text-foreground">
                    {t('familiesTable.rows.burningShip.name')}
                  </td>
                  <td className="px-3 py-2">
                    {t('familiesTable.rows.burningShip.examples')}
                  </td>
                  <td className="px-3 py-2">
                    {t('familiesTable.rows.burningShip.character')}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2 font-medium text-foreground">
                    {t('familiesTable.rows.newton.name')}
                  </td>
                  <td className="px-3 py-2">
                    {t('familiesTable.rows.newton.examples')}
                  </td>
                  <td className="px-3 py-2">
                    {t('familiesTable.rows.newton.character')}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2 font-medium text-foreground">
                    {t('familiesTable.rows.phoenix.name')}
                  </td>
                  <td className="px-3 py-2">
                    {t('familiesTable.rows.phoenix.examples')}
                  </td>
                  <td className="px-3 py-2">
                    {t('familiesTable.rows.phoenix.character')}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2 font-medium text-foreground">
                    {t('familiesTable.rows.transcendental.name')}
                  </td>
                  <td className="px-3 py-2">
                    {t('familiesTable.rows.transcendental.examples')}
                  </td>
                  <td className="px-3 py-2">
                    {t('familiesTable.rows.transcendental.character')}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2 font-medium text-foreground">
                    {t('familiesTable.rows.magnet.name')}
                  </td>
                  <td className="px-3 py-2">
                    {t('familiesTable.rows.magnet.examples')}
                  </td>
                  <td className="px-3 py-2">
                    {t('familiesTable.rows.magnet.character')}
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-medium text-foreground">
                    {t('familiesTable.rows.exotic.name')}
                  </td>
                  <td className="px-3 py-2">
                    {t('familiesTable.rows.exotic.examples')}
                  </td>
                  <td className="px-3 py-2">
                    {t('familiesTable.rows.exotic.character')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2 className="mt-8 text-xl font-semibold tracking-tight">
            {t('featuresHeading')}
          </h2>
          <ul className="mt-3 grid gap-2 text-muted-foreground sm:grid-cols-2">
            <li>· {t('features.0')}</li>
            <li>· {t('features.1')}</li>
            <li>· {t('features.2')}</li>
            <li>· {t('features.3')}</li>
            <li>· {t('features.4')}</li>
            <li>· {t('features.5')}</li>
          </ul>

          <noscript>
            <p className="mt-6 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              {t('noScriptNotice')}
            </p>
          </noscript>
        </div>
      </section>

      {/* Interactive explorer — client-side hydration */}
      <Suspense fallback={<div className="h-[calc(100dvh-4rem)] bg-black" />}>
        <ExploreClient />
      </Suspense>
    </>
  );
}
