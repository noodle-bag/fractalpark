import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SITE, buildLocaleAlternates } from '@/lib/site';
import {
  galleryPresetConfigToPreset,
  parseGalleryPresetsFile,
  presetToSavedFractal,
} from '@/lib/gallery-presets';
import presetsFile from '../../../../public/gallery-presets.json';
import DriftClient from './DriftClient';

/**
 * Drift — immersive, hands-free playback of the published preset collection.
 *
 * Migrated from the legacy homepage slideshow when Explore became the default
 * landing (Slice 2.1). This is an experiential tool page: it keeps its own
 * bilingual title/description/OG and canonical/hreflang, but is deliberately
 * `noindex, follow` and never appears in the sitemap.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata.drift' });
  const baseUrl = SITE.url;
  const image = `${SITE.url}${SITE.ogImage}`;

  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `/${locale}/drift`,
      languages: buildLocaleAlternates('/drift'),
    },
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
      url: `${baseUrl}/${locale}/drift`,
      siteName: SITE.name,
      locale: locale === 'zh' ? 'zh_CN' : 'en_US',
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: `${SITE.name} Drift preview` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('ogTitle'),
      description: t('ogDescription'),
      images: [image],
    },
    robots: {
      index: false,
      follow: true,
      googleBot: {
        index: false,
        follow: true,
      },
    },
  };
}

export default async function DriftPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const firstPresetConfig = parseGalleryPresetsFile(presetsFile).presets[0];
  const initialFractal = firstPresetConfig
    ? presetToSavedFractal(galleryPresetConfigToPreset(firstPresetConfig, locale))
    : null;

  return <DriftClient initialFractal={initialFractal} />;
}
