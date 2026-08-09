import type { Metadata } from 'next';
import Script from 'next/script';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics';
import { PageViewTracker } from '@/components/analytics/PageViewTracker';
import { CloudSessionProvider } from '@/components/cloud/CloudSessionProvider';
import { LayoutProvider } from '@/components/layout/LayoutContext';
import LayoutShell from '@/components/layout/LayoutShell';
import { HTML_LANG, OG_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from '@/i18n/supported-locales';
import { SITE } from '@/lib/site';
import { websiteJsonLd, renderJsonLd } from '@/lib/json-ld';

export const dynamicParams = false;

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

/**
 * Localized document language for the initial server HTML: every locale
 * renders its own BCP 47 tag (`en`, `zh-CN`, `pt-BR`, …). Never fix the root
 * document to a single language and never patch lang from client-side
 * scripts — crawlers (incl. Bingbot/Baiduspider) must see the correct value
 * without executing JavaScript.
 */
export function htmlLangForLocale(locale: string): string {
  return HTML_LANG[locale as SupportedLocale] ?? locale;
}

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
      ? ['分形', '分形艺术', '数字艺术', '曼德博罗特', '朱利亚集', 'WebGL', '生成艺术', '数学艺术']
      : ['fractal', 'fractal art', 'digital art', 'mandelbrot', 'julia', 'webgl', 'generative art', 'mathematical art'],
    authors: [{ name: SITE.name }],
    metadataBase: new URL(baseUrl),
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
      url: `${baseUrl}/${locale}/explore`,
      siteName: SITE.name,
      locale: OG_LOCALE[locale as SupportedLocale] ?? OG_LOCALE.en,
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: `${SITE.name} fractal art preview` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('ogTitle'),
      description: t('ogDescription'),
      images: [image],
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
    <html lang={htmlLangForLocale(locale)}>
      <body className="antialiased">
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
            <CloudSessionProvider>
              <LayoutShell>{children}</LayoutShell>
            </CloudSessionProvider>
          </LayoutProvider>
        </NextIntlClientProvider>
        <GoogleAnalytics />
        <PageViewTracker />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
