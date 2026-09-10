export const ANALYTICS_TRAFFIC_CLASS_STORAGE_KEY =
  'fractalpark.analytics.traffic-class';

export type AnalyticsTrafficClass =
  | 'external'
  | 'internal'
  | 'automation'
  | 'development';

const PRODUCTION_HOSTNAMES = new Set([
  'fractalpark.com',
  'www.fractalpark.com',
]);

export function resolveAnalyticsTrafficClass(): AnalyticsTrafficClass {
  if (typeof window === 'undefined') return 'development';
  if (window.navigator.webdriver) return 'automation';
  if (!PRODUCTION_HOSTNAMES.has(window.location.hostname)) return 'development';

  try {
    if (
      window.localStorage.getItem(ANALYTICS_TRAFFIC_CLASS_STORAGE_KEY) ===
      'internal'
    ) {
      return 'internal';
    }
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }

  return 'external';
}

export function getAnalyticsTrafficParams() {
  const trafficClass = resolveAnalyticsTrafficClass();
  return {
    traffic_type: trafficClass === 'external' ? 'external' : 'internal',
    traffic_class: trafficClass,
  } as const;
}
