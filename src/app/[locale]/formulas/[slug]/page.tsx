import type { Metadata } from 'next';
import Image from 'next/image';
import {
  ArrowRight,
  BookOpen,
  ExternalLink,
  Palette,
  Sigma,
  SlidersHorizontal,
} from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import presetsFile from '../../../../../public/gallery-presets.json';
import { MathBlock } from '@/components/content/MathBlock';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  PUBLISHED_FORMULA_GUIDES,
  formulaGuideImagePath,
  formulaGuideOpenGraphImagePath,
  formulaGuidePath,
  getPublishedFormulaGuideBySlug,
  isPublishedFormulaGuideId,
} from '@/content/formula-guides';
import { getFormulaContentById } from '@/content/formula-manifest';
import { getFormulaMetadata } from '@/engine/plugins/formula-catalog';
import { Link } from '@/i18n/routing';
import { buildFormulaDefaultDocument } from '@/lib/formula-documents';
import {
  builtinPresetToGalleryHref,
  findBuiltinPresetConfigById,
  parseGalleryPresetsFile,
} from '@/lib/gallery-presets';
import { renderJsonLd } from '@/lib/json-ld';
import { SITE, buildLocaleAlternates } from '@/lib/site';
import { splitProseParagraphs } from '@/lib/content-text';
import { documentToExploreHref } from '@/lib/url-params';

interface FormulaGuidePageProps {
  params: Promise<{
    locale: string;
    slug: string;
  }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return PUBLISHED_FORMULA_GUIDES.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: FormulaGuidePageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const entry = getPublishedFormulaGuideBySlug(slug);

  if (!entry) {
    notFound();
  }

  const t = await getTranslations({
    locale,
    namespace: `formulas.entries.${entry.slug}`,
  });
  const path = formulaGuidePath(entry);
  const image = `${SITE.url}${formulaGuideOpenGraphImagePath(entry)}`;

  return {
    title: t('title'),
    description: t('summary'),
    alternates: {
      canonical: `/${locale}${path}`,
      languages: buildLocaleAlternates(path),
    },
    openGraph: {
      title: t('title'),
      description: t('summary'),
      url: `${SITE.url}/${locale}${path}`,
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
      description: t('summary'),
      images: [image],
    },
  };
}

export default async function FormulaGuidePage({
  params,
}: FormulaGuidePageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const entry = getPublishedFormulaGuideBySlug(slug);
  if (!entry) {
    notFound();
  }

  const metadata = getFormulaMetadata(entry.formulaId);
  if (!metadata) {
    notFound();
  }

  const t = await getTranslations({
    locale,
    namespace: `formulas.entries.${entry.slug}`,
  });
  const guideT = await getTranslations({
    locale,
    namespace: 'formulas.guide',
  });
  const formulaT = await getTranslations({
    locale,
    namespace: 'explore.controls.formula',
  });
  const familyT = await getTranslations({
    locale,
    namespace: 'explore.formula.family',
  });
  const canonicalDocument = buildFormulaDefaultDocument(entry.formulaId);
  const exploreHref = documentToExploreHref(canonicalDocument, locale);
  const path = formulaGuidePath(entry);
  const imagePath = formulaGuideImagePath(entry);
  const pageUrl = `${SITE.url}/${locale}${path}`;
  const parsedPresets = parseGalleryPresetsFile(presetsFile);
  const artworks = entry.artworkIds.map((artworkId) => {
    const preset = findBuiltinPresetConfigById(parsedPresets, artworkId);
    if (!preset) {
      throw new Error(`Missing artwork preset for formula guide: ${artworkId}`);
    }

    return preset;
  });
  const related = entry.relatedFormulaIds.map((formulaId) => {
    const relatedMetadata = getFormulaMetadata(formulaId);
    if (!relatedMetadata) {
      throw new Error(`Missing related formula metadata: ${formulaId}`);
    }

    const relatedContent = getFormulaContentById(formulaId);
    const href =
      relatedContent && isPublishedFormulaGuideId(formulaId)
        ? `/${locale}${formulaGuidePath(relatedContent)}`
        : documentToExploreHref(
            buildFormulaDefaultDocument(formulaId),
            locale
          );

    return {
      metadata: relatedMetadata,
      href,
    };
  });
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: t('title'),
    description: t('summary'),
    url: pageUrl,
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: `${SITE.url}${imagePath}`,
      width: 1200,
      height: 750,
    },
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
          item: pageUrl,
        },
      ],
    },
  };

  return (
    <main className="pb-24">
      <script
        dangerouslySetInnerHTML={{ __html: renderJsonLd(jsonLd) }}
        type="application/ld+json"
      />

      <header className="border-b bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16 lg:py-20">
          <nav
            aria-label={guideT('breadcrumbLabel')}
            className="mb-8 text-sm text-muted-foreground"
          >
            <Link className="hover:text-foreground" href="/explore">
              {guideT('breadcrumbHome')}
            </Link>
            <span className="mx-2">/</span>
            <Link className="hover:text-foreground" href="/formulas">
              {guideT('breadcrumbFormulas')}
            </Link>
            <span className="mx-2">/</span>
            <span>{t('title')}</span>
          </nav>

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)] lg:items-center">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{familyT(metadata.family)}</Badge>
                <Badge variant="secondary">
                  {guideT(`difficulty.${metadata.difficulty}`)}
                </Badge>
              </div>
              <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                {t('title')}
              </h1>
              <p className="mt-6 max-w-3xl text-pretty text-lg leading-8 text-muted-foreground sm:text-xl">
                {t('summary')}
              </p>
              <Button asChild className="mt-8" size="lg">
                <a href={exploreHref}>
                  {guideT('openExplorer')}
                  <ArrowRight aria-hidden />
                </a>
              </Button>
            </div>

            <figure className="overflow-hidden rounded-2xl border bg-muted shadow-sm">
              <Image
                alt={t('imageAlt')}
                className="h-auto w-full"
                data-testid="formula-guide-hero-image"
                height={750}
                priority
                sizes="(min-width: 1024px) 42vw, 100vw"
                src={imagePath}
                width={1200}
              />
              <figcaption className="border-t px-4 py-3 text-sm text-muted-foreground">
                {t('imageCaption')}
              </figcaption>
            </figure>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-24 px-5 pt-20 sm:px-8">
        <GuideSection
          icon={<BookOpen aria-hidden />}
          id="overview"
          title={guideT('sections.overview')}
        >
          <ProseParagraphs
            className="max-w-4xl space-y-4 text-lg leading-8 text-muted-foreground"
            text={t('overview')}
          />
        </GuideSection>

        <GuideSection
          icon={<Sigma aria-hidden />}
          id="mathematics"
          title={guideT('sections.mathematics')}
        >
          <div className="space-y-6">
            {entry.math.map((item) => (
              <article
                className="rounded-xl border bg-card p-5 sm:p-6"
                key={item.id}
              >
                <h3 className="font-semibold">
                  {t(`math.${item.id}.label`)}
                </h3>
                <MathBlock
                  className="my-4 text-lg sm:text-xl"
                  plainText={item.plainText}
                  tex={item.tex}
                />
                <ProseParagraphs
                  className="space-y-3 leading-7 text-muted-foreground"
                  text={t(`math.${item.id}.explanation`)}
                />
              </article>
            ))}
          </div>
        </GuideSection>

        {entry.history ? (
          <GuideSection
            icon={<BookOpen aria-hidden />}
            id="history"
            title={guideT('sections.history')}
          >
            <ProseParagraphs
              className="max-w-4xl space-y-4 text-lg leading-8 text-muted-foreground"
              text={t('history')}
            />
          </GuideSection>
        ) : null}

        <GuideSection
          icon={<Palette aria-hidden />}
          id="visual-characteristics"
          title={guideT('sections.visualCharacteristics')}
        >
          <ProseParagraphs
            className="max-w-4xl space-y-4 text-lg leading-8 text-muted-foreground"
            text={t('visualCharacteristics')}
          />
        </GuideSection>

        {entry.parameters?.length ? (
          <GuideSection
            icon={<SlidersHorizontal aria-hidden />}
            id="parameters"
            title={guideT('sections.parameters')}
          >
            <dl className="grid gap-4 sm:grid-cols-2">
              {entry.parameters.map((parameter) => (
                <div className="rounded-xl border bg-card p-5" key={parameter.id}>
                  <dt className="font-semibold">
                    {guideT(`parameterLabels.${parameter.id}`)}
                  </dt>
                  <dd className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t(`parameters.${parameter.id}`)}
                  </dd>
                </div>
              ))}
            </dl>
          </GuideSection>
        ) : null}

        <GuideSection
          icon={<Palette aria-hidden />}
          id="remix"
          title={guideT('sections.remix')}
        >
          <div className="rounded-2xl border bg-muted/20 p-6 sm:p-8">
            <h3 className="text-xl font-semibold">{guideT('remix.title')}</h3>
            <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
              {guideT('remix.description')}
            </p>
            <Button asChild className="mt-5">
              <a href={exploreHref}>
                {guideT('remix.cta')}
                <ArrowRight aria-hidden />
              </a>
            </Button>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {artworks.map((artwork) => (
              <article
                className="overflow-hidden rounded-xl border bg-card"
                key={artwork.id}
              >
                {artwork.thumbnail ? (
                  <Image
                    alt=""
                    className="aspect-[16/10] h-auto w-full object-cover"
                    height={400}
                    sizes="(min-width: 1024px) 30vw, (min-width: 768px) 45vw, 100vw"
                    src={artwork.thumbnail}
                    width={640}
                  />
                ) : null}
                <div className="p-5">
                  <h3 className="font-semibold">
                    {locale === 'zh' && artwork.nameZh
                      ? artwork.nameZh
                      : artwork.name}
                  </h3>
                  <Link
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    href={builtinPresetToGalleryHref(artwork.id)}
                  >
                    {guideT('viewArtwork')}
                    <ArrowRight aria-hidden className="size-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </GuideSection>

        <GuideSection
          icon={<BookOpen aria-hidden />}
          id="related"
          title={guideT('sections.related')}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((item) => (
              <a
                className="group flex items-center justify-between gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-foreground/30 hover:bg-muted/20"
                href={item.href}
                key={item.metadata.id}
              >
                <span className="font-semibold">
                  {formulaT(item.metadata.id)}
                </span>
                <ArrowRight
                  aria-hidden
                  className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                />
              </a>
            ))}
          </div>
        </GuideSection>

        <GuideSection
          icon={<BookOpen aria-hidden />}
          id="faq"
          title={guideT('sections.faq')}
        >
          <div className="space-y-4">
            {entry.faqIds.map((faqId) => (
              <article className="rounded-xl border bg-card p-5 sm:p-6" key={faqId}>
                <h3 className="font-semibold">
                  {t(`faq.${faqId}.question`)}
                </h3>
                <ProseParagraphs
                  className="mt-3 space-y-3 leading-7 text-muted-foreground"
                  text={t(`faq.${faqId}.answer`)}
                />
              </article>
            ))}
          </div>
        </GuideSection>

        {entry.references?.length ? (
          <GuideSection
            icon={<ExternalLink aria-hidden />}
            id="references"
            title={guideT('sections.references')}
          >
            <ul className="space-y-3">
              {entry.references.map((reference) => (
                <li key={reference.id}>
                  <a
                    className="inline-flex items-center gap-2 font-medium text-primary hover:underline"
                    href={reference.url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {reference.title}
                    <ExternalLink aria-hidden className="size-4" />
                  </a>
                </li>
              ))}
            </ul>
          </GuideSection>
        ) : null}
      </div>
    </main>
  );
}

function ProseParagraphs({
  className,
  text,
}: {
  className: string;
  text: string;
}) {
  return (
    <div className={className}>
      {splitProseParagraphs(text).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

function GuideSection({
  children,
  icon,
  id,
  title,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  id: string;
  title: string;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} id={id}>
      <div className="mb-8 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-primary [&>svg]:size-5">
          {icon}
        </span>
        <h2
          className="text-3xl font-semibold tracking-tight"
          id={`${id}-heading`}
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}
