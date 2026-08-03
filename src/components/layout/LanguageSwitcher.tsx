'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Check, Languages } from 'lucide-react';

import { usePathname, useRouter } from '@/i18n/routing';
import { LOCALES } from '@/i18n/locales';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Data-driven language dropdown (v0.4.16): the locale list comes from
 * routing.locales via LOCALES, the current selection is visible, and
 * switching preserves the full path + query + hash (including `?draft=`).
 * Query and hash are read from window.location at click time — never via
 * useSearchParams, which would force every prerendered page into a CSR
 * bailout (ADR 0006 first-frame contract).
 */
export default function LanguageSwitcher() {
  const t = useTranslations('common.language');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const current = LOCALES.find((meta) => meta.code === locale) ?? LOCALES[0];

  const switchLocale = (newLocale: string) => {
    if (newLocale === locale) return;
    const query = typeof window === 'undefined' ? '' : window.location.search.replace(/^\?/, '');
    const hash = typeof window === 'undefined' ? '' : window.location.hash;
    const href = `${pathname}${query ? `?${query}` : ''}${hash}`;
    router.replace(href, { locale: newLocale });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('label')}
          className="min-h-11 min-w-11 gap-1 px-2"
        >
          <Languages className="h-4 w-4" />
          <span aria-hidden="true">{current.shortLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map((meta) => (
          <DropdownMenuItem
            key={meta.code}
            onSelect={() => switchLocale(meta.code)}
            aria-current={meta.code === locale ? 'true' : undefined}
          >
            <span className="flex-1">{meta.label}</span>
            {meta.code === locale ? <Check className="h-4 w-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
