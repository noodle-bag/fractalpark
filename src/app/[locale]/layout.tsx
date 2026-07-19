import type { Metadata } from 'next';
import Script from 'next/script';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { LayoutProvider } from '@/components/layout/LayoutContext';
import LayoutShell from '@/components/layout/LayoutShell';
import { routing } from '@/i18n/routing';
import { SITE, buildLocaleAlternates } from '@/lib/site';
import { websiteJsonLd, renderJsonLd } from '@/lib/json-ld';

export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata.home' });
  const baseUrl = SITE.url;
  const image = `${SITE.url}${SITE.ogImage}`;

  return {
    title: t('title'),
    description: t('description'),
    keywords: locale === 'zh'
      ? ['\u5206\u5f62', '\u5206\u5f62\u827a\u672f', '\u6570\u5b57\u827a\u672f', '\u66fc\u5fb7\u5e03\u7f57\u7279', '\u6731\u5229\u4e9a\u96c6', 'WebGL', '\u751f\u6210\u827a\u672f', '\u6570\u5b66\u827a\u672f']
      : ['fractal', 'fractal art', 'digital art', 'mandelbrot', 'julia', 'webgl', 'generative art', 'mathematical art'],
    authors: [{ name: SITE.name }],
    metadataBase: new URL(baseUrl),
    alternates: {
      canonical: `/${locale}`,
      languages: buildLocaleAlternates(),
    },
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
      url: `${baseUrl}/${locale}`,
      siteName: SITE.name,
      locale: locale === 'zh' ? 'zh_CN' : 'en_US',
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: `${SITE.name} fractal art preview` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('ogTitle'),
      description: t('ogDescription'),
      images: [image],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <>
      {/* WebSite JSON-LD — site-wide entity declaration for AI crawlers & Google KG */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: renderJsonLd(websiteJsonLd) }}
      />
      <Script id="microsoft-clarity" strategy="afterInteractive">
        {`(function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "xewn83hqvo");`}
      </Script>
      <NextIntlClientProvider messages={messages}>
        <LayoutProvider>
          <LayoutShell>{children}</LayoutShell>
        </LayoutProvider>
      </NextIntlClientProvider>
    </>
  );
}
