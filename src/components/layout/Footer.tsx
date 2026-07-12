import { useTranslations } from 'next-intl';

export default function Footer() {
  const t = useTranslations('common.footer');

  return (
    <footer className="border-t border-border bg-white py-6 text-center text-sm text-muted-foreground">
      <div className="container mx-auto px-4 space-y-1">
        <p>{t('copyright')}</p>
        <p>
          {t('contact')}{' '}
          <a href="mailto:contact@fractalpark.com" className="underline hover:text-foreground transition-colors">
            contact@fractalpark.com
          </a>
        </p>
      </div>
    </footer>
  );
}
