import { useTranslations } from 'next-intl';

interface LegalPageProps {
  /** next-intl namespace, e.g. 'legal.privacy' — expects title, updated, intro, s1h/s1b … */
  namespace: string;
  sectionCount: number;
}

/**
 * Shared renderer for the legal pages (Privacy, Terms, Community Rules).
 * Copy lives in messages/*.json so both locales stay structurally aligned;
 * each section is a heading + one or more paragraphs separated by blank
 * lines.
 */
export default function LegalPage({ namespace, sectionCount }: LegalPageProps) {
  const t = useTranslations(namespace);
  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('updated')}</p>
      <p className="mt-6 whitespace-pre-line text-muted-foreground">{t('intro')}</p>
      {Array.from({ length: sectionCount }, (_, index) => {
        const key = `s${index + 1}`;
        return (
          <section key={key} className="mt-8">
            <h2 className="text-xl font-semibold">{t(`${key}h`)}</h2>
            <p className="mt-2 whitespace-pre-line text-muted-foreground">{t(`${key}b`)}</p>
          </section>
        );
      })}
    </main>
  );
}
