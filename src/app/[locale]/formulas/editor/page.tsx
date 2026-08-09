import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { FrmEditorClient } from '@/components/fractal/FrmEditorClient';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/i18n/routing';
import { renderJsonLd } from '@/lib/json-ld';
import { SITE, buildLocaleAlternates } from '@/lib/site';
import { OG_LOCALE, type SupportedLocale } from '@/i18n/supported-locales';

const EDITOR_PATH = '/formulas/editor';
const GUIDE_PATH = '/formulas/frm';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata.frmEditor' });
  const image = `${SITE.url}${SITE.ogImage}`;

  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `/${locale}${EDITOR_PATH}`,
      languages: buildLocaleAlternates(EDITOR_PATH),
    },
    openGraph: {
      title: t('title'),
      description: t('description'),
      url: `${SITE.url}/${locale}${EDITOR_PATH}`,
      siteName: SITE.name,
      locale: OG_LOCALE[locale as SupportedLocale] ?? OG_LOCALE.en,
      type: 'website',
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('description'),
      images: [image],
    },
  };
}

export default async function FrmEditorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'frmEditor' });
  const editorUrl = `${SITE.url}/${locale}${EDITOR_PATH}`;
  const guideUrl = `${SITE.url}/${locale}${GUIDE_PATH}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: t('title'),
    description: t('description'),
    url: editorUrl,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: t('crumbGuide'),
          item: guideUrl,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: t('title'),
          item: editorUrl,
        },
      ],
    },
  };

  return (
    <main>
      <script
        dangerouslySetInnerHTML={{ __html: renderJsonLd(jsonLd) }}
        type="application/ld+json"
      />
      <header className="mx-auto max-w-7xl px-4 pt-10 sm:px-6">
        <nav aria-label={t('breadcrumb')} className="text-sm text-muted-foreground">
          <Link href={GUIDE_PATH}>{t('crumbGuide')}</Link>
          <span className="mx-2">/</span>
          <span>{t('title')}</span>
        </nav>
        <div className="mt-5 flex items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('title')}
          </h1>
          <Badge className="text-muted-foreground" variant="outline">
            {t('beta')}
          </Badge>
        </div>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          {t('description')}
        </p>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          {t('localOnly')}{' '}
          <Link className="underline underline-offset-4" href={GUIDE_PATH}>
            {t('guide')}
          </Link>
        </p>
      </header>

      <noscript>
        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <h2 className="text-xl font-semibold">{t('noJsTitle')}</h2>
          <p className="mt-3 text-muted-foreground">{t('noJs')}</p>
          <p className="mt-3">
            <Link className="underline underline-offset-4" href={GUIDE_PATH}>
              {t('guide')}
            </Link>
          </p>
        </section>
      </noscript>

      <FrmEditorClient />
    </main>
  );
}
