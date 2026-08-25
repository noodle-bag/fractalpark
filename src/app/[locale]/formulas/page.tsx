import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  BookOpen,
  Code2,
  Compass,
  Layers3,
  Sparkles,
} from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TrackedContentLink } from '@/components/analytics/ContentAnalytics';
import {
  buildFormulaAtlas,
  type FormulaAtlasGuideEntry,
} from '@/content/formula-atlas';
import {
  PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1,
  PUBLISHED_FORMULA_DIRECTORY_COUNT_V1,
  PUBLISHED_FORMULA_DIRECTORY_FAMILIES_V1,
  PUBLISHED_FORMULA_GUIDE_COUNT_V1,
  PUBLISHED_FORMULA_DIRECTORY_V1,
} from '@/content/published-formula-directory';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { renderJsonLd } from '@/lib/json-ld';
import { SITE, buildLocaleAlternates } from '@/lib/site';
import { OG_LOCALE, type SupportedLocale } from '@/i18n/supported-locales';

const ATLAS_PATH = '/formulas';
const FRM_GUIDE_PATH = '/formulas/frm';
const FRM_EDITOR_PATH = '/formulas/editor';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: 'metadata.formulaAtlas',
  });
  const image = `${SITE.url}${SITE.ogImage}`;

  return {
    title: t('title'),
    description: t('publishedDescription'),
    alternates: {
      canonical: `/${locale}${ATLAS_PATH}`,
      languages: buildLocaleAlternates(ATLAS_PATH),
    },
    openGraph: {
      title: t('title'),
      description: t('publishedDescription'),
      url: `${SITE.url}/${locale}${ATLAS_PATH}`,
      siteName: SITE.name,
      locale: OG_LOCALE[locale as SupportedLocale] ?? OG_LOCALE.en,
      type: 'website',
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: t('imageAlt'),
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('publishedDescription'),
      images: [image],
    },
  };
}

export default async function FormulaAtlasPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const guideEntries = buildFormulaAtlas(locale).guides;
  const t = await getTranslations({ locale, namespace: 'formulas.index' });
  const directoryT = await getTranslations({
    locale,
    namespace: 'formulas.directory',
  });
  const formulaT = await getTranslations({
    locale,
    namespace: 'explore.controls.formula',
  });
  const entryT = await getTranslations({
    locale,
    namespace: 'formulas.entries',
  });
  const atlasUrl = `${SITE.url}/${locale}${ATLAS_PATH}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t('title'),
    description: t('publishedIntro'),
    url: atlasUrl,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: t('breadcrumbHome'),
          item: `${SITE.url}/${locale}/explore`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: t('breadcrumb'),
          item: atlasUrl,
        },
      ],
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: PUBLISHED_FORMULA_DIRECTORY_COUNT_V1,
      url: `${SITE.url}/${locale}/formulas/directory`,
    },
  };

  return (
    <main className="pb-24">
      <script
        dangerouslySetInnerHTML={{ __html: renderJsonLd(jsonLd) }}
        type="application/ld+json"
      />

      <header className="border-b bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
          <nav
            aria-label={t('breadcrumbLabel')}
            className="mb-8 text-sm text-muted-foreground"
          >
            <Link className="hover:text-foreground" href="/explore">
              {t('breadcrumbHome')}
            </Link>
            <span className="mx-2">/</span>
            <span>{t('breadcrumb')}</span>
          </nav>

          <div className="max-w-4xl">
            <Badge variant="outline">{t('eyebrow')}</Badge>
            <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              {t('title')}
            </h1>
            <p className="mt-6 max-w-3xl text-pretty text-lg leading-8 text-muted-foreground sm:text-xl">
              {t('publishedIntro')}
            </p>
          </div>

          <dl className="mt-10 grid max-w-3xl grid-cols-3 gap-4">
            <Stat
              value={PUBLISHED_FORMULA_DIRECTORY_COUNT_V1}
              label={t('stats.formulas')}
            />
            <Stat
              value={PUBLISHED_FORMULA_DIRECTORY_FAMILIES_V1.length}
              label={t('stats.families')}
            />
            <Stat
              value={PUBLISHED_FORMULA_GUIDE_COUNT_V1}
              label={t('stats.guides')}
            />
          </dl>

          <div className="mt-8">
            <Button asChild variant="outline">
              <Link href="/formulas/directory">
                {t('standardDirectory.cta')}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t('standardDirectory.hint')}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-24 px-5 pt-20 sm:px-8">
        <section aria-labelledby="capabilities-heading">
          <SectionHeading
            eyebrow={t('capabilities.eyebrow')}
            id="capabilities-heading"
            intro={t('capabilities.intro')}
            title={t('capabilities.title')}
          />
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            <CapabilityCard
              icon={<Sparkles aria-hidden className="size-5" />}
              text={t('capabilities.items.realtime.description')}
              title={t('capabilities.items.realtime.title')}
            />
            <CapabilityCard
              icon={<Compass aria-hidden className="size-5" />}
              text={t('capabilities.items.canonical.description')}
              title={t('capabilities.items.canonical.title')}
            />
            <CapabilityCard
              icon={<Layers3 aria-hidden className="size-5" />}
              text={t('capabilities.items.server.description')}
              title={t('capabilities.items.server.title')}
            />
          </div>
        </section>

        <section aria-labelledby="families-heading">
          <SectionHeading
            eyebrow={t('families.eyebrow')}
            id="families-heading"
            intro={t('families.intro')}
            title={t('families.title')}
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1.map((category) => (
              <Link
                className="group rounded-xl border bg-card p-5 transition-colors hover:border-foreground/30 hover:bg-muted/20"
                data-formula-category={category}
                href={`/formulas/directory?category=${category}`}
                key={category}
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-semibold">
                    {category === 'classic'
                      ? directoryT('category.classic')
                      : directoryT(`family.${category}`)}
                  </h3>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs tabular-nums text-muted-foreground">
                    {PUBLISHED_FORMULA_DIRECTORY_V1.categoryCounts[category]}
                  </span>
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-sm text-muted-foreground group-hover:text-foreground">
                  {t('families.browse')}
                  <ArrowRight aria-hidden className="size-4" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="frm-heading"
          className="overflow-hidden rounded-2xl border bg-foreground p-7 text-background sm:p-10"
        >
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-sm font-medium text-background/70">
                <Code2 aria-hidden className="size-4" />
                {t('frm.eyebrow')}
              </div>
              <h2
                className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl"
                id="frm-heading"
              >
                {t('frm.title')}
              </h2>
              <p className="mt-4 text-base leading-7 text-background/70 sm:text-lg">
                {t('frm.description')}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="secondary">
                <Link href={FRM_GUIDE_PATH}>
                  {t('frm.learn')}
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button
                asChild
                className="border-background/30 bg-transparent text-background hover:bg-background/10 hover:text-background"
                variant="outline"
              >
                <TrackedContentLink
                  eventName="open_formula_editor"
                  eventParams={{ source_page: 'atlas', locale }}
                  href={`/${locale}${FRM_EDITOR_PATH}`}
                >
                  {t('frm.openEditor')}
                </TrackedContentLink>
              </Button>
            </div>
          </div>
        </section>

        <section aria-labelledby="guides-heading">
          <SectionHeading
            eyebrow={t('guides.eyebrow')}
            id="guides-heading"
            intro={t('guides.intro')}
            title={t('guides.title')}
          />
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {guideEntries.map((entry) => (
              <GuideCard
                entry={entry}
                key={entry.metadata.id}
                name={formulaT(entry.metadata.id)}
                openLabel={
                  entry.guideHref ? t('guides.read') : t('guides.explore')
                }
                summary={entryT(`${entry.guide.slug}.summary`)}
              />
            ))}
          </div>
        </section>

        <section
          aria-labelledby="atlas-cta-heading"
          className="rounded-2xl border bg-muted/20 p-8 text-center sm:p-12"
        >
          <BookOpen aria-hidden className="mx-auto size-7 text-primary" />
          <h2
            className="mt-4 text-3xl font-semibold tracking-tight"
            id="atlas-cta-heading"
          >
            {t('cta.title')}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            {t('cta.description')}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href="/explore">{t('cta.explore')}</Link>
            </Button>
            <Button asChild variant="outline">
              <TrackedContentLink
                eventName="open_formula_editor"
                eventParams={{ source_page: 'atlas', locale }}
                href={`/${locale}${FRM_EDITOR_PATH}`}
              >
                {t('cta.editor')}
              </TrackedContentLink>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-3xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  id,
  intro,
  title,
}: {
  eyebrow: string;
  id: string;
  intro: string;
  title: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-medium text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight" id={id}>
        {title}
      </h2>
      <p className="mt-3 text-base leading-7 text-muted-foreground">{intro}</p>
    </div>
  );
}

function CapabilityCard({
  icon,
  text,
  title,
}: {
  icon: ReactNode;
  text: string;
  title: string;
}) {
  return (
    <article className="rounded-xl border bg-card p-6">
      <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-primary">
        {icon}
      </div>
      <h3 className="mt-5 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </article>
  );
}

function GuideCard({
  entry,
  name,
  openLabel,
  summary,
}: {
  entry: FormulaAtlasGuideEntry;
  name: string;
  openLabel: string;
  summary: string;
}) {
  return (
    <article
      className="flex h-full flex-col rounded-xl border bg-card p-5"
      data-guide-formula-id={entry.metadata.id}
    >
      <div className="flex items-start justify-between gap-4">
        <h4 className="font-semibold">{name}</h4>
        <Badge variant="outline">{entry.metadata.difficulty}</Badge>
      </div>
      <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">
        {summary}
      </p>
      <Button asChild className="mt-5 w-fit px-0" variant="link">
        <a href={entry.destinationHref}>
          {openLabel}
          <ArrowRight aria-hidden />
        </a>
      </Button>
    </article>
  );
}
