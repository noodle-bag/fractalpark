import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { SITE } from '@/lib/site';

/**
 * Homepage SEO content block.
 *
 * Rendered by Next.js SSR into the initial HTML payload so AI crawlers
 * (GPTBot, PerplexityBot, ClaudeBot, Google-Extended) can read structured
 * content — direct-answer block, how-to steps, formula family table, FAQ —
 * without needing to execute JavaScript.
 *
 * Visually hidden via `.sr-only` so it does not affect the full-screen
 * slideshow UX. This is a deliberate trade-off documented in the 2026-07-18
 * GEO audit (CRITICAL #2): the homepage previously had a single H1 and zero
 * H2/H3/FAQ structure, scoring 42/100 on AIO citability.
 */
export default async function HomeSeo({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'home.seo' });

  return (
    <section
      id="home-seo-content"
      aria-labelledby="home-seo-heading"
      className="sr-only"
    >
      <h2 id="home-seo-heading">{t('whatIsHeading')}</h2>
      <p>{t('whatIsAnswer')}</p>

      <h2>{t('howToHeading')}</h2>
      <ol>
        <li>{t('howToSteps.0')}</li>
        <li>{t('howToSteps.1')}</li>
        <li>{t('howToSteps.2')}</li>
        <li>{t('howToSteps.3')}</li>
        <li>{t('howToSteps.4')}</li>
      </ol>

      <h2>{t('familiesHeading')}</h2>
      <p>{t('familiesIntro')}</p>
      <table>
        <thead>
          <tr>
            <th>{t('familiesTable.colFamily')}</th>
            <th>{t('familiesTable.colExamples')}</th>
            <th>{t('familiesTable.colCharacter')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{t('familiesTable.rows.classic.name')}</td>
            <td>{t('familiesTable.rows.classic.examples')}</td>
            <td>{t('familiesTable.rows.classic.character')}</td>
          </tr>
          <tr>
            <td>{t('familiesTable.rows.burningShip.name')}</td>
            <td>{t('familiesTable.rows.burningShip.examples')}</td>
            <td>{t('familiesTable.rows.burningShip.character')}</td>
          </tr>
          <tr>
            <td>{t('familiesTable.rows.newton.name')}</td>
            <td>{t('familiesTable.rows.newton.examples')}</td>
            <td>{t('familiesTable.rows.newton.character')}</td>
          </tr>
          <tr>
            <td>{t('familiesTable.rows.phoenix.name')}</td>
            <td>{t('familiesTable.rows.phoenix.examples')}</td>
            <td>{t('familiesTable.rows.phoenix.character')}</td>
          </tr>
          <tr>
            <td>{t('familiesTable.rows.transcendental.name')}</td>
            <td>{t('familiesTable.rows.transcendental.examples')}</td>
            <td>{t('familiesTable.rows.transcendental.character')}</td>
          </tr>
          <tr>
            <td>{t('familiesTable.rows.magnet.name')}</td>
            <td>{t('familiesTable.rows.magnet.examples')}</td>
            <td>{t('familiesTable.rows.magnet.character')}</td>
          </tr>
          <tr>
            <td>{t('familiesTable.rows.exotic.name')}</td>
            <td>{t('familiesTable.rows.exotic.examples')}</td>
            <td>{t('familiesTable.rows.exotic.character')}</td>
          </tr>
        </tbody>
      </table>

      <h2>{t('featuresHeading')}</h2>
      <ul>
        <li>{t('features.0')}</li>
        <li>{t('features.1')}</li>
        <li>{t('features.2')}</li>
        <li>{t('features.3')}</li>
        <li>{t('features.4')}</li>
        <li>{t('features.5')}</li>
      </ul>

      <h2>{t('faqHeading')}</h2>
      <dl>
        <dt>{t('faq.free.q')}</dt>
        <dd>{t('faq.free.a')}</dd>
        <dt>{t('faq.chinese.q')}</dt>
        <dd>{t('faq.chinese.a')}</dd>
        <dt>{t('faq.export.q')}</dt>
        <dd>{t('faq.export.a')}</dd>
        <dt>{t('faq.formulas.q')}</dt>
        <dd>{t('faq.formulas.a')}</dd>
        <dt>{t('faq.share.q')}</dt>
        <dd>{t('faq.share.a')}</dd>
        <dt>{t('faq.opensource.q')}</dt>
        <dd>
          {t('faq.opensource.a')}{' '}
          <a href={SITE.repositoryUrl} rel="noopener noreferrer" target="_blank">
            {t('faq.opensource.linkText')}
          </a>
        </dd>
      </dl>

      <h2>{t('linksHeading')}</h2>
      <ul>
        <li>
          <Link href="/explore">{t('links.explore')}</Link>
        </li>
        <li>
          <Link href="/gallery">{t('links.gallery')}</Link>
        </li>
        <li>
          <Link href="/about">{t('links.about')}</Link>
        </li>
      </ul>
    </section>
  );
}
