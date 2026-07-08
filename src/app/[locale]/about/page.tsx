import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SITE, buildLocaleAlternates } from '@/lib/site';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata.about' });
  const baseUrl = SITE.url;
  const image = `${SITE.url}${SITE.ogImage}`;

  return {
    title: t('title'),
    description: t('description'),
    keywords: locale === 'zh'
      ? ['\u5206\u5f62\u827a\u672f', '\u6570\u5b57\u827a\u672f', 'WebGL', 'Next.js', '\u751f\u6210\u827a\u672f', '\u6570\u5b66\u827a\u672f', '\u66fc\u5fb7\u5e03\u7f57\u7279', '\u6731\u5229\u4e9a\u96c6']
      : ['fractal art', 'digital art', 'webgl', 'next.js', 'generative art', 'mathematical art', 'mandelbrot', 'julia'],
    alternates: {
      canonical: `/${locale}/about`,
      languages: buildLocaleAlternates('/about'),
    },
    openGraph: {
      title: t('title'),
      description: t('description'),
      url: `${baseUrl}/${locale}/about`,
      siteName: SITE.name,
      locale: locale === 'zh' ? 'zh_CN' : 'en_US',
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: `${SITE.name} About preview` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('description'),
      images: [image],
    },
  };
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'about' });

  // JSON-LD structured data for SoftwareApplication
  const softwareApplicationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.name,
    applicationCategory: 'GraphicsApplication',
    operatingSystem: 'Any modern web browser',
    url: SITE.url,
    description: t('aiDescription'),
    license: 'https://opensource.org/license/mit',
    codeRepository: SITE.repositoryUrl,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: [
      'Open-source MIT-licensed browser application',
      '94 built-in fractal formulas (Mandelbrot, Julia, Newton, Phoenix, Magnet, McMullen, transcendental families)',
      'Real-time WebGL GPU rendering',
      'Custom formula editor with Fractint-style .frm compatibility and FractalPark native directives',
      '7 transform plugins (Kaleidoscope, Möbius, Inversion, Polar, etc.)',
      '9 coloring modes with orbit channel support',
      'High-resolution PNG export up to 4x',
      'Personal gallery with localStorage persistence',
      'Bilingual support (English/Chinese)',
    ],
    softwareRequirements: 'WebGL 1.0 enabled browser',
    programmingLanguage: ['TypeScript', 'GLSL'],
    author: {
      '@type': 'Organization',
      name: `${SITE.name} Project`,
    },
    datePublished: '2026-02-15',
    softwareVersion: SITE.version,
  };

  return (
    <div className="container mx-auto py-24 px-6 max-w-3xl">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
      />

      <div className="space-y-16">
        <div className="space-y-6 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{t('title')}</h1>
          <p className="text-xl text-muted-foreground leading-relaxed">
            {t('intro')}
          </p>
        </div>

        {/* Machine-readable technical description (also human-friendly) */}
        <div className="space-y-6 bg-muted/30 rounded-lg p-6">
          <h2 className="text-2xl font-semibold tracking-tight">{t('aiFriendly.title')}</h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {t('aiFriendly.description')}
          </p>
          <div className="flex gap-4 text-sm">
            <a 
              href="/llms.txt" 
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              llms.txt →
            </a>
            <a 
              href="/llms-full.txt" 
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              llms-full.txt →
            </a>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-semibold tracking-tight">{t('techStack.title')}</h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {t('techStack.description')}
          </p>
          <ul className="space-y-3 text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              {t('techStack.frontend')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              {t('techStack.rendering')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              {t('techStack.formula')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              {t('techStack.deployment')}
            </li>
          </ul>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-semibold tracking-tight">{t('openSource.title')}</h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {t('openSource.description')}
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <a
              href={SITE.repositoryUrl}
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('openSource.github')} →
            </a>
            <a
              href="https://opensource.org/license/mit"
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('openSource.license')} →
            </a>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-semibold tracking-tight">{t('vision.title')}</h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {t('vision.description')}
          </p>
        </div>
      </div>
    </div>
  );
}
