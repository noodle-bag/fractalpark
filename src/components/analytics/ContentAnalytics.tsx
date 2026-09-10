'use client';

import {
  forwardRef,
  useEffect,
  useRef,
  type AnchorHTMLAttributes,
} from 'react';
import { trackEvent } from './PageViewTracker';
import { ANALYTICS_CONSENT_EVENT } from '@/lib/analytics-consent';

type AnalyticsParams = Record<string, string | number | boolean>;

interface ContentViewTrackerProps {
  eventName:
    | 'view_formula'
    | 'view_frm_guide'
    | 'view_artwork'
    | 'community_artwork_viewed';
  eventParams: AnalyticsParams;
}

export function ContentViewTracker({
  eventName,
  eventParams,
}: ContentViewTrackerProps) {
  const identity = `${eventName}:${JSON.stringify(eventParams)}`;
  const lastSentIdentityRef = useRef<string | null>(null);

  useEffect(() => {
    const send = () => {
      if (lastSentIdentityRef.current === identity) return;
      if (trackEvent(eventName, eventParams)) {
        lastSentIdentityRef.current = identity;
      }
    };
    send();
    window.addEventListener(ANALYTICS_CONSENT_EVENT, send);
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, send);
  }, [eventName, eventParams, identity]);

  return null;
}

interface TrackedContentLinkProps
  extends AnchorHTMLAttributes<HTMLAnchorElement> {
  eventName:
    | 'start_remix'
    | 'open_formula_editor'
    | 'open_example';
  eventParams: AnalyticsParams;
  href: string;
}

export const TrackedContentLink = forwardRef<
  HTMLAnchorElement,
  TrackedContentLinkProps
>(function TrackedContentLink(
  { eventName, eventParams, onClick, ...props },
  ref
) {
  return (
    <a
      {...props}
      ref={ref}
      onClick={(event) => {
        trackEvent(eventName, eventParams);
        onClick?.(event);
      }}
    />
  );
});
