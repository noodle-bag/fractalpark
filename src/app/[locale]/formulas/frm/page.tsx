import type { Metadata } from 'next';
import { ArrowRight, CircleAlert, GitBranch, TerminalSquare } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { FrmCodeBlock } from '@/components/content/FrmCodeBlock';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FRM_COMPATIBILITY_GROUPS,
  FRM_GUIDE_REFERENCES,
  FRM_GUIDE_SECTION_IDS,
  FRM_GUIDE_TUTORIALS,
  FRM_PIPELINE_STEP_IDS,
  FRM_SYNTAX_TOPIC_IDS,
} from '@/content/frm-guide';
import { Link } from '@/i18n/routing';
import { renderJsonLd } from '@/lib/json-ld';
import { SITE, buildLocaleAlternates } from '@/lib/site';

const GUIDE_PATH = '/formulas/frm';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata.frmGuide' });
  const image = `${SITE.url}${SITE.ogImage}`;

  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `/${locale}${GUIDE_PATH}`,
      languages: buildLocaleAlternates(GUIDE_PATH),
    },
    openGraph: {
      title: t('title'),
      description: t('description'),
      url: `${SITE.url}/${locale}${GUIDE_PATH}`,
      siteName: SITE.name,
      locale: locale === 'zh' ? 'zh_CN' : 'en_US',
      type: 'article',
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
      description: t('description'),
      images: [image],
    },
  };
}

export default async function FrmGuidePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({
    locale,
    namespace: 'formulas.frmGuide',
  });
  const exampleT = await getTranslations({
    locale,
    namespace: 'explore',
  });
  const guideT = await getTranslations({
    locale,
    namespace: 'formulas.guide',
  });
  const guideUrl = `${SITE.url}/${locale}${GUIDE_PATH}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: t('title'),
    description: t('intro'),
    url: guideUrl,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: guideT('breadcrumbHome'),
          item: `${SITE.url}/${locale}/explore`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: guideT('breadcrumbFormulas'),
          item: `${SITE.url}/${locale}/formulas`,
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: t('title'),
          item: guideUrl,
        },
      ],
    },
  };
  const copyLabels = {
    copy: t('copy.copy'),
    copied: t('copy.copied'),
    error: t('copy.error'),
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
      <script
        dangerouslySetInnerHTML={{ __html: renderJsonLd(jsonLd) }}
        type="application/ld+json"
      />
      <header className="mx-auto max-w-4xl space-y-6 text-center">
        <Badge variant="outline">{t('eyebrow')}</Badge>
        <div className="space-y-4">
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            {t('title')}
          </h1>
          <p className="mx-auto max-w-3xl text-pretty text-lg leading-8 text-muted-foreground sm:text-xl">
            {t('intro')}
          </p>
        </div>
      </header>

      <nav
        aria-label={t('contentsLabel')}
        className="mx-auto mt-12 max-w-4xl rounded-xl border bg-muted/20 p-5 sm:p-6"
      >
        <p className="mb-4 text-sm font-semibold">{t('contentsLabel')}</p>
        <ol className="grid gap-x-8 gap-y-2 text-sm text-muted-foreground sm:grid-cols-2">
          {FRM_GUIDE_SECTION_IDS.map((sectionId, index) => (
            <li key={sectionId}>
              <a
                className="group flex gap-3 rounded-md py-1 transition-colors hover:text-foreground"
                href={`#${sectionId}`}
              >
                <span className="font-mono text-xs text-primary">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="group-hover:underline">
                  {t(`sections.${sectionId}.title`)}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mx-auto mt-20 max-w-4xl space-y-24">
        <GuideSection
          id="what-is-frm"
          number="01"
          title={t('sections.what-is-frm.title')}
        >
          <div className="space-y-5 text-base leading-8 text-muted-foreground sm:text-lg">
            <p>{t('sections.what-is-frm.body.0')}</p>
            <p>{t('sections.what-is-frm.body.1')}</p>
            <p>
              {t('sections.what-is-frm.historyPrefix')}{' '}
              <a
                className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                href="https://fractint.org/"
                rel="noopener noreferrer"
                target="_blank"
              >
                {t('sections.what-is-frm.historyLink')}
              </a>
              .
            </p>
          </div>
        </GuideSection>

        <GuideSection
          id="support"
          number="02"
          title={t('sections.support.title')}
        >
          <p className="text-base leading-8 text-muted-foreground sm:text-lg">
            {t('sections.support.intro')}
          </p>

          <div className="mt-8 overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="w-36 px-5 py-4 font-semibold">
                    {t('sections.support.table.level')}
                  </th>
                  <th className="w-64 px-5 py-4 font-semibold">
                    {t('sections.support.table.meaning')}
                  </th>
                  <th className="px-5 py-4 font-semibold">
                    {t('sections.support.table.scope')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {FRM_COMPATIBILITY_GROUPS.map((group) => (
                  <tr className="border-t align-top" key={group.level}>
                    <th className="px-5 py-5">
                      <CompatibilityBadge level={group.level}>
                        {t(`sections.support.levels.${group.level}.label`)}
                      </CompatibilityBadge>
                    </th>
                    <td className="px-5 py-5 leading-6 text-muted-foreground">
                      {t(`sections.support.levels.${group.level}.meaning`)}
                    </td>
                    <td className="px-5 py-5">
                      <ul className="space-y-2 leading-6 text-muted-foreground">
                        {group.itemIds.map((itemId) => (
                          <li className="flex gap-2" key={itemId}>
                            <span aria-hidden="true" className="text-primary">
                              •
                            </span>
                            <span>
                              {t(`sections.support.items.${itemId}`)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm leading-6 text-muted-foreground">
            <CircleAlert
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
            />
            <p>{t('sections.support.disclaimer')}</p>
          </div>
        </GuideSection>

        <GuideSection
          id="anatomy"
          number="03"
          title={t('sections.anatomy.title')}
        >
          <p className="text-base leading-8 text-muted-foreground sm:text-lg">
            {t('sections.anatomy.intro')}
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {(['init', 'loop', 'bailout'] as const).map((part, index) => (
              <article className="rounded-xl border bg-card p-5" key={part}>
                <span className="font-mono text-xs text-primary">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-3 font-mono text-lg font-semibold">
                  {part}:
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {t(`sections.anatomy.parts.${part}`)}
                </p>
              </article>
            ))}
          </div>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            {t('sections.anatomy.note')}
          </p>
        </GuideSection>

        <GuideSection
          id="syntax"
          number="04"
          title={t('sections.syntax.title')}
        >
          <p className="text-base leading-8 text-muted-foreground sm:text-lg">
            {t('sections.syntax.intro')}
          </p>
          <dl className="mt-8 divide-y rounded-xl border">
            {FRM_SYNTAX_TOPIC_IDS.map((topicId) => (
              <div
                className="grid gap-2 px-5 py-5 sm:grid-cols-[12rem_1fr] sm:gap-6"
                key={topicId}
              >
                <dt className="font-semibold">
                  {t(`sections.syntax.topics.${topicId}.title`)}
                </dt>
                <dd className="leading-7 text-muted-foreground">
                  {t(`sections.syntax.topics.${topicId}.body`)}
                </dd>
              </div>
            ))}
          </dl>
        </GuideSection>

        <GuideSection
          id="pipeline"
          number="05"
          title={t('sections.pipeline.title')}
        >
          <p className="text-base leading-8 text-muted-foreground sm:text-lg">
            {t('sections.pipeline.intro')}
          </p>
          <ol className="mt-8 grid gap-4 md:grid-cols-2">
            {FRM_PIPELINE_STEP_IDS.map((stepId, index) => (
              <li
                className="relative overflow-hidden rounded-xl border bg-card p-5"
                key={stepId}
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <h3 className="font-semibold">
                    {t(`sections.pipeline.steps.${stepId}.title`)}
                  </h3>
                </div>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {t(`sections.pipeline.steps.${stepId}.body`)}
                </p>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex gap-3 rounded-lg border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
            <GitBranch
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-primary"
            />
            <p>{t('sections.pipeline.note')}</p>
          </div>
        </GuideSection>

        <GuideSection
          id="tutorials"
          number="06"
          title={t('sections.tutorials.title')}
        >
          <p className="text-base leading-8 text-muted-foreground sm:text-lg">
            {t('sections.tutorials.intro')}
          </p>
          <div className="mt-10 space-y-12">
            {FRM_GUIDE_TUTORIALS.map((tutorial, index) => (
              <article
                aria-labelledby={`tutorial-${tutorial.id}`}
                className="space-y-5"
                key={tutorial.id}
              >
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                  <div>
                    <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">
                      {t('sections.tutorials.lesson', {
                        number: index + 1,
                      })}
                    </p>
                    <h3
                      className="mt-2 text-2xl font-semibold tracking-tight"
                      id={`tutorial-${tutorial.id}`}
                    >
                      {exampleT(`${tutorial.example.nameKey}`)}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{tutorial.id}</Badge>
                    <Button asChild size="sm" variant="outline">
                      <Link href={tutorial.editorPath}>
                        {t('sections.tutorials.openInEditor')}
                        <ArrowRight className="ml-1 size-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
                <p className="leading-7 text-muted-foreground">
                  {exampleT(`${tutorial.example.descriptionKey}`)}
                </p>
                <p className="rounded-lg border-l-2 border-primary bg-muted/20 px-4 py-3 text-sm leading-6 text-muted-foreground">
                  {t(`sections.tutorials.goals.${tutorial.id}`)}
                </p>
                <FrmCodeBlock
                  copyLabels={copyLabels}
                  label={`${tutorial.id}.frm`}
                  source={tutorial.example.source}
                />
              </article>
            ))}
          </div>
          <p className="mt-8 text-sm leading-6 text-muted-foreground">
            {t('sections.tutorials.editorNote')}
          </p>
        </GuideSection>

        <GuideSection
          id="diagnostics"
          number="07"
          title={t('sections.diagnostics.title')}
        >
          <p className="text-base leading-8 text-muted-foreground sm:text-lg">
            {t('sections.diagnostics.intro')}
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {(['lexer', 'parser', 'validator', 'source-map'] as const).map(
              (diagnosticId) => (
                <article className="rounded-xl border bg-card p-5" key={diagnosticId}>
                  <TerminalSquare
                    aria-hidden="true"
                    className="size-5 text-primary"
                  />
                  <h3 className="mt-4 font-semibold">
                    {t(
                      `sections.diagnostics.items.${diagnosticId}.title`
                    )}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t(`sections.diagnostics.items.${diagnosticId}.body`)}
                  </p>
                </article>
              )
            )}
          </div>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            {t('sections.diagnostics.note')}
          </p>
        </GuideSection>

        <GuideSection
          id="next-steps"
          number="08"
          title={t('sections.next-steps.title')}
        >
          <div className="rounded-xl border bg-muted/20 p-6 sm:p-8">
            <h3 className="text-xl font-semibold">
              {t('sections.next-steps.exploreTitle')}
            </h3>
            <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
              {t('sections.next-steps.exploreBody')}
            </p>
            <Button asChild className="mt-5">
              <Link href="/explore">
                {t('sections.next-steps.exploreCta')}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <p className="mt-5 text-sm leading-6 text-muted-foreground">
              {t('sections.next-steps.editorNote')}
            </p>
          </div>

          <div className="mt-10">
            <h3 className="text-xl font-semibold">
              {t('sections.next-steps.referencesTitle')}
            </h3>
            <p className="mt-3 leading-7 text-muted-foreground">
              {t('sections.next-steps.referencesIntro')}
            </p>
            <ul className="mt-5 space-y-3">
              {FRM_GUIDE_REFERENCES.map((reference) => (
                <li key={reference.id}>
                  <a
                    className="inline-flex items-center gap-2 font-medium text-primary underline-offset-4 hover:underline"
                    href={reference.url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {t(`sections.next-steps.references.${reference.id}`)}
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </GuideSection>
      </div>
    </main>
  );
}

function GuideSection({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="scroll-mt-24" id={id}>
      <div className="mb-7 flex items-baseline gap-3">
        <span className="font-mono text-sm font-medium text-primary">
          {number}
        </span>
        <h2
          className="text-3xl font-semibold tracking-tight sm:text-4xl"
          id={`${id}-title`}
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function CompatibilityBadge({
  level,
  children,
}: {
  level: 'supported' | 'adapted' | 'unsupported';
  children: React.ReactNode;
}) {
  const className =
    level === 'supported'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : level === 'adapted'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300';

  return (
    <Badge className={className} variant="outline">
      {children}
    </Badge>
  );
}
