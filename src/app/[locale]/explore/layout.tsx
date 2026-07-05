import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SITE, buildLocaleAlternates } from '@/lib/site';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata.explore' });
  const baseUrl = SITE.url;
  const image = `${SITE.url}${SITE.ogImage}`;

  return {
    title: t('title'),
    description: t('description'),
    keywords: locale === 'zh'
      ? ['\u5206\u5f62\u751f\u6210\u5668', '\u5206\u5f62\u63a2\u7d22\u5668', '\u66fc\u5fb7\u5e03\u7f57\u7279\u96c6', '\u6731\u5229\u4e9a\u96c6', '\u725b\u987f\u5206\u5f62', 'WebGL \u5206\u5f62', '\u6570\u5b57\u827a\u672f', '\u751f\u6210\u827a\u672f']
      : [
          'fractal generator',
          'fractal explorer',
          'mandelbrot set',
          'julia set',
          'newton fractal',
          'webgl fractal',
          'digital art',
          'generative art',
          'mathematical art',
        ],
    alternates: {
      canonical: `/${locale}/explore`,
      languages: buildLocaleAlternates('/explore'),
    },
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
      url: `${baseUrl}/${locale}/explore`,
      siteName: SITE.name,
      locale: locale === 'zh' ? 'zh_CN' : 'en_US',
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: `${SITE.name} Explore preview` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('ogTitle'),
      description: t('ogDescription'),
      images: [image],
    },
  };
}

export default async function ExploreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
