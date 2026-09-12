'use client';

import { useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';

import {
  readAnalyticsConsent,
  writeAnalyticsConsent,
  type AnalyticsConsent as AnalyticsConsentValue,
} from '@/lib/analytics-consent';

type ConsentSnapshot = AnalyticsConsentValue | null | 'loading';

function subscribe(onStoreChange: () => void): () => void {
  const listener = () => onStoreChange();
  window.addEventListener('fractalpark:analytics-consent-changed', listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener('fractalpark:analytics-consent-changed', listener);
    window.removeEventListener('storage', listener);
  };
}

function getSnapshot(): ConsentSnapshot {
  return readAnalyticsConsent();
}

function getServerSnapshot(): ConsentSnapshot {
  return 'loading';
}

export function AnalyticsConsent({ enabled }: { enabled: boolean }) {
  const t = useTranslations('analyticsConsent');
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!enabled) return null;

  const choose = (next: AnalyticsConsentValue) => {
    const shouldReload = consent === 'granted' && next === 'denied';
    writeAnalyticsConsent(next);
    setSettingsOpen(false);
    if (shouldReload) window.location.reload();
  };

  if (consent === 'loading') return null;
  const open = consent === null || settingsOpen;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        className="fixed bottom-3 left-3 z-50 rounded-md border bg-background/95 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur hover:text-foreground"
      >
        {t('settings')}
      </button>
    );
  }

  return (
    <aside
      aria-label={t('title')}
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur"
    >
      <p className="font-medium">{t('title')}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => choose('granted')}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          {t('accept')}
        </button>
        <button
          type="button"
          onClick={() => choose('denied')}
          className="rounded-md border px-3 py-1.5 text-sm font-medium"
        >
          {t('decline')}
        </button>
      </div>
    </aside>
  );
}
