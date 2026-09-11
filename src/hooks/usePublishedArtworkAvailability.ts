'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PublishedArtworkRuntimeAvailability,
  PublishedArtworkRuntimeFailure,
  PublishedArtworkRuntimeInput,
} from '@/lib/published-artwork-runtime';

/** UI state only; qualification remains owned by the shared runtime resolver. */
export function usePublishedArtworkAvailability(artwork: PublishedArtworkRuntimeInput) {
  const activeArtwork = useRef<PublishedArtworkRuntimeInput | null>(null);
  const [state, setState] = useState<{
    artwork: PublishedArtworkRuntimeInput;
    availability: PublishedArtworkRuntimeAvailability;
  } | null>(null);

  useEffect(() => {
    let active = true;
    activeArtwork.current = artwork;
    void import('@/lib/published-artwork-runtime')
      .then(({ resolvePublishedArtworkRuntimeAvailability }) => resolvePublishedArtworkRuntimeAvailability(artwork))
      .then(availability => {
      if (!active) return;
      setState(current => current?.artwork === artwork && !current.availability.available
        ? current : { artwork, availability });
    }, () => {
      if (active) setState({ artwork, availability: { available: false, reason: 'library-unavailable' } });
    });
    return () => { active = false; if (activeArtwork.current === artwork) activeArtwork.current = null; };
  }, [artwork]);

  const onUnavailable = useCallback((reason: PublishedArtworkRuntimeFailure) => {
    if (activeArtwork.current !== artwork) return;
    setState({ artwork, availability: { available: false, reason } });
  }, [artwork]);

  return { availability: state?.artwork === artwork ? state.availability : null, onUnavailable };
}
