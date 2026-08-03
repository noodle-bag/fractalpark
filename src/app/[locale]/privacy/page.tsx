import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import LegalPage from '@/components/legal/LegalPage';
import { SITE, buildLocaleAlternates } from '@/lib/site';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.privacy' });
  return {
    title: t('title'),
    description: t('intro').slice(0, 160),
    alternates: {
      canonical: `/${locale}/privacy`,
      languages: buildLocaleAlternates('/privacy'),
    },
    openGraph: {
      title: t('title'),
      url: `${SITE.url}/${locale}/privacy`,
      siteName: SITE.name,
      locale: locale === 'zh' ? 'zh_CN' : 'en_US',
      type: 'article',
    },
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage namespace="legal.privacy" sectionCount={9} />;
}
