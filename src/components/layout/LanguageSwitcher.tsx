'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';

export default function LanguageSwitcher() {
  const t = useTranslations('common.language');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = (newLocale: string) => {
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => switchLocale('en')}
        className={locale === 'en' ? 'font-bold' : 'text-muted-foreground'}
      >
        {t('en')}
      </Button>
      <span className="text-muted-foreground">/</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => switchLocale('zh')}
        className={locale === 'zh' ? 'font-bold' : 'text-muted-foreground'}
      >
        {t('zh')}
      </Button>
    </div>
  );
}
