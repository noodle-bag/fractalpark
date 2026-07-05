import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SITE, buildLocaleAlternates } from '@/lib/site';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata.gallery' });
  const baseUrl = SITE.url;
  const image = `${SITE.url}${SITE.ogImage}`;

  return {
    title: t('title'),
    description: t('description'),
    keywords: locale === 'zh'
      ? ['\u5206\u5f62\u753b\u5eca', '\u5206\u5f62\u827a\u672f', '\u6570\u5b57\u827a\u672f\u6536\u85cf', '\u7cbe\u9009\u5206\u5f62']
      : ['fractal gallery', 'fractal art', 'digital art collection', 'featured fractals'],
    alternates: {
      canonical: `/${locale}/gallery`,
      languages: buildLocaleAlternates('/gallery'),
    },
    openGraph: {
      title: t('title'),
      description: t('description'),
      url: `${baseUrl}/${locale}/gallery`,
      siteName: SITE.name,
      locale: locale === 'zh' ? 'zh_CN' : 'en_US',
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: `${SITE.name} Gallery preview` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('description'),
      images: [image],
    },
  };
}

export default async function GalleryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
