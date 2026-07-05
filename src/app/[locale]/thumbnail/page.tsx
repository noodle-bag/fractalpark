import type { Metadata } from 'next';
import { ThumbnailRenderer } from '@/components/gallery/ThumbnailRenderer';
import { buildFractalParamsFromPresetQuery } from '@/lib/gallery-presets';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ThumbnailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(resolved)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }

  const { params: fractalParams } = buildFractalParamsFromPresetQuery(`?${params.toString()}`);

  return (
    <main className="min-h-[100dvh] bg-black flex items-center justify-center p-8">
      <ThumbnailRenderer params={fractalParams} />
    </main>
  );
}
