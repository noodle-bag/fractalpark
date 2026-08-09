import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { PUBLIC_PROJECT } from '@/content/public-project';
import { buildSoftwareApplicationJsonLd, renderJsonLd } from '@/lib/json-ld';
import { SITE, buildLocaleAlternates } from '@/lib/site';
import { OG_LOCALE, type SupportedLocale } from '@/i18n/supported-locales';

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
      ? ['分形艺术', '数字艺术', 'WebGL', 'Next.js', '生成艺术', '数学艺术', '曼德博罗特', '朱利亚集']
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
      locale: OG_LOCALE[locale as SupportedLocale] ?? OG_LOCALE.en,
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

/**
 * About — driven by the public-project content contract
 * (src/content/public-project.ts + messages `publicProject.*`), the same
 * source that generates the GitHub README product block. Positioning,
 * the four current capabilities, Fractint boundaries/direction, numbers,
 * license, CTAs, and the hero image must not drift between the two surfaces;
 * README-only developer sections (Getting Started, scripts, layout) are
 * intentionally not duplicated here.
 */
export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'about' });
  const tp = await getTranslations({ locale, namespace: 'publicProject' });
  const facts = PUBLIC_PROJECT.facts;
  const hero = PUBLIC_PROJECT.heroImage;

  // Shared builder keeps the same stable @id and fact base as the Explore
  // landing; About only appends page-consistent extension fields.
  const softwareApplicationJsonLd = {
    ...buildSoftwareApplicationJsonLd({
      description: tp('aiDescription', { ...facts }),
    }),
    softwareRequirements: 'WebGL 1.0 enabled browser',
    programmingLanguage: ['TypeScript', 'GLSL'],
    datePublished: '2026-02-15',
  };

  return (
    <div className="container mx-auto max-w-3xl px-6 py-24">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: renderJsonLd(softwareApplicationJsonLd) }}
      />

      <div className="space-y-16">
        <div className="space-y-6">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{t('title')}</h1>
          <p className="text-xl leading-relaxed text-muted-foreground">
            {tp('tagline')}
          </p>
          {/* Real product render shared with the GitHub README hero */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero.src}
            width={hero.width}
            height={hero.height}
            alt={tp('heroAlt')}
            className="w-full rounded-lg border border-border"
          />
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-semibold tracking-tight">{tp('capabilitiesHeading')}</h2>
          <p className="text-lg leading-relaxed text-muted-foreground">
            {tp('definition', { ...facts })}
          </p>
          <ul className="space-y-6">
            {PUBLIC_PROJECT.capabilities.map((capability) => (
              <li key={capability.id} className="space-y-1">
                <Link
                  href={capability.href}
                  className="text-lg font-medium text-primary underline-offset-4 hover:underline"
                >
                  {tp(`capabilities.${capability.id}.title`)}
                </Link>
                <p className="text-muted-foreground leading-relaxed">
                  {tp(`capabilities.${capability.id}.summary`)}
                </p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-4 text-sm">
            {PUBLIC_PROJECT.ctas.map((cta) => (
              <Link
                key={cta.id}
                href={cta.href}
                className="text-primary underline-offset-4 hover:underline"
              >
                {tp(`cta.${cta.id}`)} →
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-semibold tracking-tight">{tp('boundariesHeading')}</h2>
          <div className="space-y-3">
            <h3 className="text-lg font-medium">{tp('currentHeading')}</h3>
            <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
              <li>{tp('boundaries.current.0')}</li>
              <li>{tp('boundaries.current.1')}</li>
              <li>{tp('boundaries.current.2')}</li>
            </ul>
          </div>
          <div className="space-y-3">
            <h3 className="text-lg font-medium">{tp('futureHeading')}</h3>
            <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
              <li>{tp('boundaries.future.0')}</li>
              <li>{tp('boundaries.future.1')}</li>
            </ul>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-semibold tracking-tight">{t('techStack.title')}</h2>
          <p className="text-lg leading-relaxed text-muted-foreground">
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
          </ul>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-semibold tracking-tight">{t('openSource.title')}</h2>
          <p className="text-lg leading-relaxed text-muted-foreground">
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
              href={PUBLIC_PROJECT.license.url}
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('openSource.license')} →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
