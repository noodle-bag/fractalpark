import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics';
import { trackEvent } from '@/components/analytics/PageViewTracker';

vi.mock('next/script', () => ({
  default: ({ src, children }: { src?: string; children?: React.ReactNode }) => (
    <div data-testid="analytics-script" data-src={src}>{children}</div>
  ),
}));

afterEach(() => {
  window.gtag = undefined;
  window.localStorage.removeItem('fractalpark.analytics.consent.v1');
});

describe('analytics integration', () => {
  it('does not load Google Analytics without a measurement ID', () => {
    render(<GoogleAnalytics measurementId="" />);
    expect(screen.queryByTestId('analytics-script')).toBeNull();
  });

  it('loads configured analytics without requiring a stored choice', () => {
    render(<GoogleAnalytics measurementId="G-TEST123" />);
    const scripts = screen.getAllByTestId('analytics-script');
    expect(scripts[0]).toHaveAttribute('data-src', 'https://www.googletagmanager.com/gtag/js?id=G-TEST123');
    expect(scripts[1]).toHaveTextContent('send_page_view: false');
    expect(scripts[1]).toHaveTextContent('allow_google_signals: false');
  });

  it('does not let the removed preference gate current events', () => {
    window.localStorage.setItem('fractalpark.analytics.consent.v1', 'denied');
    window.gtag = vi.fn();
    expect(trackEvent('save_fractal', { formula_kind: 'builtin' })).toBe(true);
    expect(window.gtag).toHaveBeenCalledWith('event', 'save_fractal', expect.objectContaining({
      formula_kind: 'builtin', traffic_type: 'internal',
    }));
  });

  it('does not affect product actions when analytics is unavailable', () => {
    expect(trackEvent('save_fractal')).toBe(false);
  });
});
