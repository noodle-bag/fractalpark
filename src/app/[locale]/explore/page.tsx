import { Suspense } from 'react';
import ExploreClient from './ExploreClient';

/**
 * Explore page — server component wrapper.
 *
 * Route metadata remains in layout.tsx. Long-form educational and SEO content belongs
 * on dedicated, user-facing content pages rather than above the creative workspace.
 */
export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="h-[calc(100dvh-4rem)] bg-black" />}>
      <ExploreClient />
    </Suspense>
  );
}
