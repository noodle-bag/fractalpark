export const ANALYTICS_CONSENT_STORAGE_KEY =
  'fractalpark.analytics.consent.v1';
export const ANALYTICS_CONSENT_EVENT =
  'fractalpark:analytics-consent-changed';

export type AnalyticsConsent = 'granted' | 'denied';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __fractalparkAnalyticsConsent?: boolean;
    __fractalparkAnalyticsConfigured?: boolean;
    __fractalparkConfigureAnalytics?: () => void;
  }
}

export function readAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

export function isAnalyticsConsentGranted(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.__fractalparkAnalyticsConsent !== undefined) {
    return window.__fractalparkAnalyticsConsent;
  }
  return readAnalyticsConsent() === 'granted';
}

function removeGoogleAnalyticsCookies(): void {
  const host = window.location.hostname;
  const parentDomain = host.split('.').length > 2
    ? `.${host.split('.').slice(-2).join('.')}`
    : `.${host}`;
  const domains = ['', host, `.${host}`, parentDomain];
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim();
    if (!name?.startsWith('_ga')) continue;
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${
        domain ? `; domain=${domain}` : ''
      }`;
    }
  }
}

export function writeAnalyticsConsent(consent: AnalyticsConsent): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, consent);
  } catch {
    // The in-memory choice still applies to the current page.
  }

  window.__fractalparkAnalyticsConsent = consent === 'granted';
  if (consent === 'granted') {
    window.__fractalparkConfigureAnalytics?.();
  } else {
    window.gtag?.('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    removeGoogleAnalyticsCookies();
  }

  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, {
    detail: { consent },
  }));
}
