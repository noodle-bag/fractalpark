import { createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnalyticsConsent } from '@/components/analytics/AnalyticsConsent';
import { GoogleAnalyticsLoader } from '@/components/analytics/GoogleAnalyticsLoader';
import { trackEvent } from '@/components/analytics/PageViewTracker';
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  writeAnalyticsConsent,
} from '@/lib/analytics-consent';
import enMessages from '../../messages/en.json';

describe('analytics consent', () => {
  afterEach(() => {
    window.gtag = undefined;
    window.__fractalparkAnalyticsConsent = undefined;
    window.__fractalparkAnalyticsConfigured = undefined;
    window.__fractalparkConfigureAnalytics = undefined;
    window.localStorage.removeItem(ANALYTICS_CONSENT_STORAGE_KEY);
    document.getElementById('google-analytics-loader')?.remove();
  });

  it('does not emit an event without explicit consent', () => {
    window.gtag = vi.fn();
    window.__fractalparkAnalyticsConsent = false;

    expect(trackEvent('save_fractal', { formula_kind: 'builtin' })).toBe(false);
    expect(window.gtag).not.toHaveBeenCalled();
  });

  it('configures first, then emits consented events with traffic classification', () => {
    const configure = vi.fn();
    window.gtag = vi.fn();
    window.__fractalparkAnalyticsConsent = false;
    window.__fractalparkConfigureAnalytics = configure;

    writeAnalyticsConsent('granted');
    expect(configure).toHaveBeenCalledTimes(1);
    expect(trackEvent('save_fractal', { formula_kind: 'builtin' })).toBe(true);
    expect(window.gtag).toHaveBeenCalledWith('event', 'save_fractal', {
      formula_kind: 'builtin',
      traffic_class: 'development',
      traffic_type: 'internal',
    });
  });

  it('offers a localized decline choice without limiting the product', () => {
    render(createElement(
      NextIntlClientProvider,
      { locale: 'en', messages: enMessages },
      createElement(AnalyticsConsent, { enabled: true }),
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe('denied');
    expect(screen.getByRole('button', { name: 'Analytics settings' })).toBeVisible();
  });

  it('loads the Google script only after consent', async () => {
    window.__fractalparkAnalyticsConsent = false;
    render(createElement(GoogleAnalyticsLoader, { measurementId: 'G-TEST123' }));
    expect(document.getElementById('google-analytics-loader')).toBeNull();

    writeAnalyticsConsent('granted');

    await waitFor(() => expect(
      document.getElementById('google-analytics-loader'),
    ).not.toBeNull());
  });
});
