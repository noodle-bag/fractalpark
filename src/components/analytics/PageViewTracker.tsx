'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getAnalyticsTrafficParams } from '@/lib/analytics-traffic';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Sends one manual page_view per pathname change. Explore query-state updates
 * are deliberately excluded because they are edits, not navigations.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    const path = pathname?.split('?')[0] ?? '';
    if (path && path !== lastPathRef.current) {
      const sent = trackEvent('page_view', {
        page_path: path,
        page_location: window.location.origin + path,
      });
      if (sent) lastPathRef.current = path;
    }
  }, [pathname]);

  return null;
}

/** Sends a custom event without affecting the product action. */
export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>,
): boolean {
  if (
    typeof window === 'undefined' ||
    typeof window.gtag !== 'function'
  ) return false;

  window.gtag('event', eventName, {
    ...params,
    ...getAnalyticsTrafficParams(),
  });
  return true;
}
