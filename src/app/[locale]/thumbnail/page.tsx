import type { Metadata } from 'next';
import { ThumbnailRenderer } from '@/components/gallery/ThumbnailRenderer';
import { buildFractalParamsFromPresetQuery } from '@/lib/gallery-presets';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

const DEFAULT_RENDER_SIZE = 600;
const MAX_RENDER_SIZE = 2400;

function parseRenderDimension(
  value: string | string[] | undefined
): number {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number(rawValue);

  return Number.isInteger(parsed) &&
    parsed > 0 &&
    parsed <= MAX_RENDER_SIZE
    ? parsed
    : DEFAULT_RENDER_SIZE;
}

export default async function ThumbnailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const params = new URLSearchParams();
  const renderWidth = parseRenderDimension(resolved.renderWidth);
  const renderHeight = parseRenderDimension(resolved.renderHeight);

  for (const [key, value] of Object.entries(resolved)) {
    if (key === 'renderWidth' || key === 'renderHeight') {
      continue;
    }

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
      <ThumbnailRenderer
        height={renderHeight}
        params={fractalParams}
        width={renderWidth}
      />
    </main>
  );
}
