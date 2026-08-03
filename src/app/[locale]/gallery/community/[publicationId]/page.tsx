import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { CommunityArtworkActions } from '@/components/gallery/CommunityArtworkActions';
import { getCommunityPublication, type CommunityDetailDto } from '@/lib/cloud/community';
import { isCreationCloudEnabled } from '@/lib/cloud/config';
import { DraftServiceError } from '@/lib/cloud/drafts';
import { Link } from '@/i18n/routing';
import { renderJsonLd } from '@/lib/json-ld';
import { SITE } from '@/lib/site';
import { FORMULA_PUBLICATION_LICENSE } from '@/lib/cloud/publications';
import { validateFormulaPublication } from '@/lib/cloud/formula-publish';
import { MIT_LICENSE_URL } from '@/lib/mit-license';
import { cache } from 'react';

export const dynamic = 'force-dynamic';

const CC_BY_URL = 'https://creativecommons.org/licenses/by/4.0/';

interface PageProps {
  params: Promise<{ locale: string; publicationId: string }>;
}
async function loadPublication(publicationId: string): Promise<CommunityDetailDto | null> {
  if (!isCreationCloudEnabled()) return null;
  try {
    return await getCommunityPublication(publicationId);
  } catch (error) {
    if (error instanceof DraftServiceError && error.code === 'not_found') return null;
    throw error;
  }
}

/** generateMetadata and the page share one PostgREST read per render. */
const loadPublicationCached = cache(loadPublication);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { publicationId } = await params;
  const publication = await loadPublicationCached(publicationId);
  if (!publication) return {};
  return {
    title: publication.title,
    description: publication.description ?? undefined,
    // v0.4.15 community pages stay out of the index but remain crawlable.
    robots: { index: false, follow: true },
  };
}

export default async function CommunityArtworkPage({ params }: PageProps) {
  const { locale, publicationId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('cloud.community');
  const publication = await loadPublicationCached(publicationId);
  if (!publication) notFound();

  const pageUrl = `${SITE.url}/${locale}/gallery/community/${publication.id}`;
  const creditText = `${publication.title} — ${publication.authorDisplayName} — CC BY 4.0`;

  // Formula publications (spec §17.2): MIT-licensed, with a public source
  // download whose display name comes from the compiled formula metadata.
  let formulaInfo: { name: string } | null = null;
  if (publication.license === FORMULA_PUBLICATION_LICENSE) {
    const verdict = validateFormulaPublication(publication.envelope);
    if (verdict.ok) formulaInfo = { name: verdict.formulaName };
  }
  const publishedAt = new Date(publication.publishedAt).toLocaleDateString(
    locale === 'zh' ? 'zh-CN' : 'en-US',
    { year: 'numeric', month: 'long', day: 'numeric' },
  );

  const imageObject = {
    '@type': 'ImageObject',
    '@id': `${pageUrl}#image`,
    contentUrl: `${SITE.url}/images/community-placeholder.svg`,
    creator: { '@type': 'Person', name: publication.authorDisplayName },
    creditText,
    license: CC_BY_URL,
  };
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: publication.title,
    description: publication.description ?? undefined,
    url: pageUrl,
    primaryImageOfPage: imageObject,
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <script type="application/ld+json">{renderJsonLd(jsonLd)}</script>
      <nav className="text-sm text-muted-foreground">
        <Link href="/gallery?view=community" className="hover:underline">
          {t('backToCommunity')}
        </Link>
      </nav>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{publication.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t('byline', { author: publication.authorDisplayName, date: publishedAt })}
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border bg-muted/30">
        {/* Public thumbnails are the fixed placeholder until the controlled
            server render path lands (spec 4.7); the artwork itself opens in
            the Explorer via Remix. The same placeholder is the ImageObject
            contentUrl so structured data matches visible content. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/community-placeholder.svg"
          alt={t('thumbnailPending')}
          className="aspect-[4/3] w-full object-cover"
        />
      </div>

      {publication.description && (
        <p className="mt-6 whitespace-pre-wrap text-base leading-relaxed">{publication.description}</p>
      )}

      <dl className="mt-6 space-y-1 text-sm text-muted-foreground">
        <div className="flex gap-2">
          <dt className="font-medium text-foreground">{t('licenseLabel')}</dt>
          <dd>
            {formulaInfo ? (
              <>
                {t('licenseFormulaValue')}{' '}
                <a href={MIT_LICENSE_URL} target="_blank" rel="noreferrer" className="underline">
                  MIT
                </a>
              </>
            ) : (
              <>
                {t('licenseValue')}{' '}
                <a href={CC_BY_URL} target="_blank" rel="noreferrer" className="underline">
                  CC BY 4.0
                </a>
              </>
            )}
          </dd>
        </div>
        {formulaInfo && (
          <div className="flex flex-wrap items-center gap-2">
            <dt className="font-medium text-foreground">{t('formulaSourceLabel')}</dt>
            <dd>
              {t('formulaSourceValue', { name: formulaInfo.name })}{' '}
              <a
                href={`/api/creation/publications/${publication.id}/formula-source`}
                className="underline"
              >
                {t('formulaSourceDownload')}
              </a>
            </dd>
          </div>
        )}
        {publication.remixSource && (
          <div className="flex gap-2">
            <dt className="font-medium text-foreground">{t('sourceLabel')}</dt>
            <dd>
              {publication.remixSource.type === 'publication' ? (
                <Link
                  href={`/gallery/community/${publication.remixSource.id}`}
                  className="underline"
                >
                  {t('sourcePublication')}
                </Link>
              ) : (
                <span>
                  {publication.remixSource.type === 'preset'
                    ? t('sourcePreset', { id: publication.remixSource.id })
                    : t('sourceFormula', { id: publication.remixSource.id })}
                </span>
              )}
            </dd>
          </div>
        )}
      </dl>

      <CommunityArtworkActions
        publicationId={publication.id}
        title={publication.title}
        pageUrl={pageUrl}
      />

      <p className="mt-10 border-t pt-4 text-xs text-muted-foreground">
        {t('reportPrefix')}{' '}
        <a
          href={`mailto:contact@fractalpark.com?subject=${encodeURIComponent(
            `[Takedown] ${publication.title} (${publication.id})`,
          )}`}
          className="underline"
        >
          contact@fractalpark.com
        </a>
      </p>
    </main>
  );
}
