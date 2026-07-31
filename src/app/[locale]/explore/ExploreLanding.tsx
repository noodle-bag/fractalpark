import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { PUBLIC_PROJECT } from '@/content/public-project';

/**
 * Explore landing — visible, server-rendered product content below the
 * full-viewport workspace.
 *
 * This is the canonical product statement for the default landing page:
 * one clear H1, a direct "What is FractalPark" answer, a core-capability
 * summary, and descriptive links to the Formula Atlas, FRM Guide, Drift, and
 * About. It must stay genuinely visible (no sr-only / display:none, no
 * crawler-only duplicate copy) and fully readable without JavaScript.
 * Product numbers come from the public-project content contract via ICU
 * placeholders so they cannot drift from README/About/JSON-LD/llms.txt.
 */
export default async function ExploreLanding({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'explore.landing' });
  const facts = PUBLIC_PROJECT.facts;

  return (
    <section
      aria-labelledby="explore-landing-heading"
      className="border-t border-border bg-background"
    >
      <div className="container mx-auto max-w-3xl space-y-12 px-6 py-16">
        <div className="space-y-4">
          <h1
            id="explore-landing-heading"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            {t('heading')}
          </h1>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t('whatIsHeading')}
          </h2>
          <p className="text-lg leading-relaxed text-muted-foreground">
            {t('whatIsAnswer', { ...facts })}
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t('capabilitiesHeading')}
          </h2>
          <p className="text-lg leading-relaxed text-muted-foreground">
            {t('capabilitiesIntro', { ...facts })}
          </p>
        </div>

        <nav aria-labelledby="explore-landing-links-heading" className="space-y-4">
          <h2
            id="explore-landing-links-heading"
            className="text-2xl font-semibold tracking-tight"
          >
            {t('linksHeading')}
          </h2>
          <ul className="space-y-3 text-lg">
            <li>
              <Link className="text-primary underline-offset-4 hover:underline" href="/formulas">
                {t('links.formulas')}
              </Link>
            </li>
            <li>
              <Link className="text-primary underline-offset-4 hover:underline" href="/formulas/frm">
                {t('links.frmGuide')}
              </Link>
            </li>
            <li>
              <Link className="text-primary underline-offset-4 hover:underline" href="/drift">
                {t('links.drift')}
              </Link>
            </li>
            <li>
              <Link className="text-primary underline-offset-4 hover:underline" href="/about">
                {t('links.about')}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </section>
  );
}
