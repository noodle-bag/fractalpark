'use client';

import { useEffect } from 'react';

import {
  ANALYTICS_CONSENT_EVENT,
  isAnalyticsConsentGranted,
} from '@/lib/analytics-consent';

export function GoogleAnalyticsLoader({ measurementId }: { measurementId: string }) {
  useEffect(() => {
    const load = () => {
      if (!isAnalyticsConsentGranted()) return;
      window.__fractalparkConfigureAnalytics?.();
      const id = 'google-analytics-loader';
      if (document.getElementById(id)) return;
      const script = document.createElement('script');
      script.id = id;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
        measurementId,
      )}`;
      document.head.appendChild(script);
    };

    const onConsent = () => load();
    load();
    window.addEventListener(ANALYTICS_CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, onConsent);
  }, [measurementId]);

  return null;
}
