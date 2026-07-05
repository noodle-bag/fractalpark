'use client';

import { useEffect } from 'react';

export default function ExploreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Explore error:', error);
  }, [error]);

  return (
    <div className="flex h-[calc(100vh-4rem)] items-center justify-center p-8">
      <div className="text-center space-y-4 max-w-md">
        <h2 className="text-xl font-semibold">Failed to load explorer</h2>
        <p className="text-muted-foreground text-sm">{error.message}</p>
        <button
          onClick={reset}
          className="px-4 py-2 border rounded-md hover:bg-muted transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
