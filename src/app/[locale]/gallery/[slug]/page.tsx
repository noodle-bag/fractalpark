import type { Metadata } from 'next';
import Image from 'next/image';
import { ArrowRight, Brush, Compass, Gauge, IterationCw } from 'lucide-react';
import { notFound, permanentRedirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import presetsFile from '../../../../../public/gallery-presets.json';
import { ArtworkViewer } from '@/components/artwork/ArtworkViewer';
import { CopyPageLinkButton } from '@/components/artwork/CopyPageLinkButton';
import { Button } from '@/components/ui/button';
import {
  PUBLISHED_ARTWORK_PAGES,
  artworkPagePath,
  getPublishedArtworkPageBySlug,
  isPublishedArtworkPagePresetId,
} from '@/content/artwork-pages';
import { getArtworkContentByPresetId } from '@/content/artwork-manifest';
import { getFormulaContentById } from '@/content/formula-manifest';
import { formulaGuidePath } from '@/content/formula-guides';
import { documentToRuntimeParams } from '@/engine/document-adapter';
import { PALETTES } from '@/engine/palettes';
import { registerBuiltins } from '@/engine/plugins/builtins';
import { Link } from '@/i18n/routing';
import {
  builtinPresetConfigToExploreHref,
  builtinPresetToGalleryHref,
  findBuiltinPresetConfigById,
  parseGalleryPresetsFile,
} from '@/lib/gallery-presets';
import { renderJsonLd } from '@/lib/json-ld';
import {
  buildPublishedArtworkBySlug,
  buildPublishedArtworkCollection,
  buildPublishedArtworkPlayback,
} from '@/lib/published-artworks';
import { SITE, buildLocaleAlternates } from '@/lib/site';
import { documentToExploreHref } from '@/lib/url-params';

const ARTWORK_CREATOR = 'FractalPark';
const ARTWORK_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';
const ARTWORK_IMAGE_WIDTH = 1920;
const ARTWORK_IMAGE_HEIGHT = 1200;

interface ArtworkPageProps {
  params: Promise<{
    locale: string;
    slug: string;
  }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return [
    ...PUBLISHED_ARTWORK_PAGES.map(({ slug }) => ({ slug })),
    ...parseGalleryPresetsFile(presetsFile).presets.map(({ id }) => ({
      slug: id,
    })),
  ];
}

export async function generateMetadata({
  params,
}: ArtworkPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const entry = getPublishedArtworkPageBySlug(slug);
  if (!entry) return { robots: { index: false, follow: true } };

  registerBuiltins({ quiet: true });
  const artwork = buildPublishedArtworkBySlug(presetsFile, slug, locale);
  if (!artwork || !artwork.thumbnail) notFound();

  const t = await getTranslations({
    locale,
    namespace: `artworks.entries.${artwork.presetId}`,
  });
  const pageT = await getTranslations({ locale, namespace: 'artworks.page' });
  const path = artworkPagePath(entry);
  const image = `${SITE.url}${artwork.thumbnail}`;

  return {
    title: pageT('metadataTitle', { title: artwork.name }),
    description: t('summary'),
    alternates: {
      canonical: `/${locale}${path}`,
      languages: buildLocaleAlternates(path),
    },
    openGraph: {
      title: artwork.name,
      description: t('summary'),
      url: `${SITE.url}/${locale}${path}`,
      siteName: SITE.name,
      locale: locale === 'zh' ? 'zh_CN' : 'en_US',
      type: 'article',
      images: [{
        url: image,
        width: ARTWORK_IMAGE_WIDTH,
        height: ARTWORK_IMAGE_HEIGHT,
        alt: pageT('imageAlt', { title: artwork.name }),
      }],
    },
    twitter: {
      card: 'summary_large_image',
      title: artwork.name,
      description: t('summary'),
      images: [image],
    },
  };
}

export default async function ArtworkPage({ params }: ArtworkPageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  registerBuiltins({ quiet: true });

  const publishedEntry = getPublishedArtworkPageBySlug(slug);
  if (!publishedEntry) {
    const preset = findBuiltinPresetConfigById(
      parseGalleryPresetsFile(presetsFile),
      slug
    );
    if (!preset) notFound();

    if (isPublishedArtworkPagePresetId(preset.id)) {
      const content = getArtworkContentByPresetId(preset.id);
      if (!content) notFound();
      permanentRedirect(`/${locale}${artworkPagePath(content)}`);
    }

    permanentRedirect(builtinPresetConfigToExploreHref(preset, locale));
  }

  const artwork = buildPublishedArtworkBySlug(presetsFile, slug, locale);
  if (!artwork || !artwork.thumbnail) notFound();

  const t = await getTranslations({
    locale,
    namespace: `artworks.entries.${artwork.presetId}`,
  });
  const pageT = await getTranslations({ locale, namespace: 'artworks.page' });
  const formulaT = await getTranslations({
    locale,
    namespace: 'explore.controls.formula',
  });
  const coloringT = await getTranslations({
    locale,
    namespace: 'explore.controls.coloring',
  });
  const transformT = await getTranslations({
    locale,
    namespace: 'explore.controls.transform',
  });
  const paletteT = await getTranslations({ locale, namespace: 'explore.palettes' });

  const path = artworkPagePath(publishedEntry);
  const pageUrl = `${SITE.url}/${locale}${path}`;
  const imageUrl = `${SITE.url}${artwork.thumbnail}`;
  const runtime = documentToRuntimeParams(artwork.document);
  const formulaContent = getFormulaContentById(artwork.formulaId);
  const formulaHref = formulaContent
    ? formulaGuidePath(formulaContent)
    : undefined;
  const formulaName = formulaT(artwork.formulaId);
  const palette = PALETTES.find(
    (candidate) => candidate.index === artwork.document.coloring.paletteIndex
  );
  const paletteKey = palette?.key.split('.').at(-1);
  const paletteName = paletteKey ? paletteT(paletteKey) : pageT('customGradient');
  const exploreHref = documentToExploreHref(artwork.document, locale);
  const collection = buildPublishedArtworkCollection(presetsFile, locale);
  const related = artwork.content.relatedPresetIds.map((presetId) => {
    const relatedArtwork = collection.find((item) => item.presetId === presetId);
    if (!relatedArtwork) {
      throw new Error(`Missing related published artwork: ${presetId}`);
    }
    return relatedArtwork;
  });
  const imageObject = {
    '@type': 'ImageObject',
    '@id': `${pageUrl}#image`,
    contentUrl: imageUrl,
    width: ARTWORK_IMAGE_WIDTH,
    height: ARTWORK_IMAGE_HEIGHT,
    creator: {
      '@type': 'Organization',
      name: ARTWORK_CREATOR,
      url: SITE.url,
    },
    creditText: ARTWORK_CREATOR,
    license: ARTWORK_LICENSE_URL,
  };
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: artwork.name,
    description: t('summary'),
    url: pageUrl,
    primaryImageOfPage: imageObject,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: pageT('breadcrumbHome'),
          item: `${SITE.url}/${locale}/explore`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: pageT('breadcrumbGallery'),
          item: `${SITE.url}/${locale}/gallery`,
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: artwork.name,
          item: pageUrl,
        },
      ],
    },
  };

  return (
    <main className="pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: renderJsonLd(jsonLd) }}
      />

      <header className="border-b bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
          <nav
            aria-label={pageT('breadcrumbLabel')}
            className="mb-8 text-sm text-muted-foreground"
          >
            <Link className="hover:text-foreground" href="/explore">
              {pageT('breadcrumbHome')}
            </Link>
            <span className="mx-2">/</span>
            <Link className="hover:text-foreground" href="/gallery">
              {pageT('breadcrumbGallery')}
            </Link>
            <span className="mx-2">/</span>
            <span>{artwork.name}</span>
          </nav>

          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {pageT('eyebrow')}
          </p>
          <h1 className="mt-4 max-w-5xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            {artwork.name}
          </h1>
          <p className="mt-6 max-w-3xl text-pretty text-lg leading-8 text-muted-foreground sm:text-xl">
            {t('summary')}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span>{pageT('createdBy', { creator: ARTWORK_CREATOR })}</span>
            <a
              className="font-medium text-foreground hover:underline"
              href={ARTWORK_LICENSE_URL}
              rel="license noopener noreferrer"
              target="_blank"
            >
              {pageT('license')}
            </a>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href={exploreHref}>
                {pageT('remix')}
                <ArrowRight aria-hidden />
              </a>
            </Button>
            <CopyPageLinkButton
              labels={{
                copy: pageT('copy'),
                copied: pageT('copied'),
                error: pageT('copyError'),
              }}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-20 px-5 pt-12 sm:px-8 sm:pt-16">
        <ArtworkViewer
          artwork={buildPublishedArtworkPlayback(artwork)}
          imagePath={artwork.thumbnail}
          labels={{
            viewFullscreen: pageT('viewer.viewFullscreen'),
            resume: pageT('viewer.resume'),
            pause: pageT('viewer.pause'),
            minimize: pageT('viewer.minimize'),
            closeHint: pageT('viewer.closeHint'),
          }}
        />

        <section aria-labelledby="visual-note-heading" className="max-w-4xl">
          <h2 id="visual-note-heading" className="text-3xl font-semibold tracking-tight">
            {pageT('visualNote')}
          </h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            {t('visualNote')}
          </p>
        </section>

        <section aria-labelledby="state-heading">
          <h2 id="state-heading" className="text-3xl font-semibold tracking-tight">
            {pageT('state.title')}
          </h2>
          <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StateItem
              icon={<Compass aria-hidden />}
              label={pageT('state.formula')}
              value={formulaName}
              href={formulaHref}
            />
            <StateItem
              icon={<Gauge aria-hidden />}
              label={pageT('state.zoom')}
              value={`${runtime.bounds.zoom.toLocaleString(locale, { maximumFractionDigits: 2 })}×`}
            />
            <StateItem
              icon={<IterationCw aria-hidden />}
              label={pageT('state.iterations')}
              value={String(artwork.document.render.maxIterations)}
            />
            <StateItem
              icon={<Brush aria-hidden />}
              label={pageT('state.coloring')}
              value={pageT('state.coloringValue', {
                palette: paletteName,
                outside: coloringT(artwork.document.coloring.outsideColoringId),
                inside: coloringT(artwork.document.coloring.insideColoringId),
                transform: transformT(artwork.document.transform.transformId),
              })}
            />
          </dl>
        </section>

        <section aria-labelledby="related-heading">
          <h2 id="related-heading" className="text-3xl font-semibold tracking-tight">
            {pageT('related')}
          </h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {related.map((item) => {
              const href = isPublishedArtworkPagePresetId(item.presetId)
                ? artworkPagePath(item.content)
                : builtinPresetToGalleryHref(item.presetId);
              return (
                <Link
                  key={item.presetId}
                  href={href}
                  className="group overflow-hidden rounded-xl border bg-card shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {item.thumbnail ? (
                    <Image
                      src={item.thumbnail}
                      alt=""
                      width={640}
                      height={400}
                      className="aspect-[16/10] h-auto w-full object-cover"
                    />
                  ) : null}
                  <div className="flex items-center justify-between gap-4 p-5">
                    <span className="font-medium">{item.name}</span>
                    <ArrowRight aria-hidden className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <p className="text-sm leading-6 text-muted-foreground">
          {pageT('licenseScope')}
        </p>
      </div>
    </main>
  );
}

function StateItem({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-primary [&>svg]:size-4">
        {icon}
      </span>
      <dt className="mt-4 text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">
        {href ? (
          <Link className="hover:underline" href={href}>{value}</Link>
        ) : value}
      </dd>
    </div>
  );
}
