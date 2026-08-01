'use client';

import {
  forwardRef,
  useEffect,
  useRef,
  type AnchorHTMLAttributes,
} from 'react';
import { trackEvent } from './PageViewTracker';

type AnalyticsParams = Record<string, string | number | boolean>;

interface ContentViewTrackerProps {
  eventName: 'view_formula' | 'view_frm_guide' | 'view_artwork';
  eventParams: AnalyticsParams;
}

export function ContentViewTracker({
  eventName,
  eventParams,
}: ContentViewTrackerProps) {
  const identity = `${eventName}:${JSON.stringify(eventParams)}`;
  const lastSentIdentityRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastSentIdentityRef.current === identity) return;
    lastSentIdentityRef.current = identity;
    trackEvent(eventName, eventParams);
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
