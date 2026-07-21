'use client';

import { useState, useEffect, lazy, Suspense } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { GalleryCard } from '@/components/gallery/GalleryCard';
import { useGalleryItems } from '@/hooks/useGalleryItems';
import type { GalleryItem } from '@/hooks/useGalleryItems';
import { builtinPresetToGalleryHref } from '@/lib/gallery-presets';
import { savedFractalToHref } from '@/lib/url-params';
import { trackEvent } from '@/components/analytics/PageViewTracker';

// Lazy load AnimatedFractalCanvas to avoid importing in main bundle
const AnimatedFractalCanvas = lazy(() => import('@/components/fractal/AnimatedFractalCanvas'));

export default function GalleryPageClient() {
  const locale = useLocale();
  const router = useRouter();
  const { items, isLoading, toggleStar, remove, rename } = useGalleryItems({ locale });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [fullscreenFractal, setFullscreenFractal] = useState<GalleryItem | null>(null);
  const t = useTranslations('gallery');

  // Wrapped handlers with analytics
  const handleToggleStar = (id: string) => {
    toggleStar(id);
    trackEvent('star_fractal', { source: 'gallery' });
  };

  const handleOpenFractal = (item: GalleryItem) => {
    trackEvent('open_from_gallery', { is_builtin: item.isBuiltin ?? false });
  };

  const handleFullscreen = (item: GalleryItem) => {
    setFullscreenFractal(item);
    trackEvent('fullscreen_toggle', { page: 'gallery', action: 'open' });
  };

  // Empty state - no items at all (builtin or user)
  if (!isLoading && items.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <button
          onClick={() => router.push(`/${locale}/explore`)}
          className="aspect-square w-48 bg-muted/50 flex items-center justify-center
                     hover:bg-muted transition-colors cursor-pointer"
        >
          <Plus className="h-12 w-12 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Page header */}
      <div className="px-4 pt-6 pb-4 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('description')}</p>
      </div>

      {/* Grid with responsive columns */}
      <div
        className="grid gap-2 px-4 pb-8 max-w-7xl mx-auto"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        }}
      >
        {items.map((item) => (
          <GalleryCard
            key={item.id}
            fractal={item}
            href={item.isBuiltin
              ? builtinPresetToGalleryHref(item.id, locale)
              : savedFractalToHref(item, locale)}
            isHovered={hoveredId === item.id}
            onHoverChange={(isHovered) => setHoveredId(isHovered ? item.id : null)}
            onToggleStar={() => handleToggleStar(item.id)}
            onDelete={remove}
            onRename={rename}
            onFullscreen={() => handleFullscreen(item)}
            onOpen={() => handleOpenFractal(item)}
            isBuiltin={item.isBuiltin}
            featured={item.featured}
          />
        ))}

        {/* Add new fractal tile */}
        <button
          onClick={() => router.push(`/${locale}/explore`)}
          className="aspect-square bg-muted/50 flex items-center justify-center
                     hover:bg-muted transition-colors cursor-pointer"
        >
          <Plus className="h-8 w-8 text-muted-foreground" />
        </button>
      </div>

      {/* Fullscreen overlay */}
      {fullscreenFractal && (
        <FullscreenOverlay
          fractal={fullscreenFractal}
          onClose={() => setFullscreenFractal(null)}
        />
      )}
    </>
  );
}

interface FullscreenOverlayProps {
  fractal: GalleryItem;
  onClose: () => void;
}

function FullscreenOverlay({ fractal, onClose }: FullscreenOverlayProps) {
  const t = useTranslations('gallery');

  // Handle Esc key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Simple rule: if preset has keyframes, animate in fullscreen; otherwise show static
  const shouldAutoplay = (fractal.animation?.keyframes.length ?? 0) >= 2;

  // Lower dprScale on mobile to reduce GPU load (high-DPR screens at dprScale=1 is very expensive)
  const dprScale = typeof window !== 'undefined' && window.innerWidth < 768 ? 0.5 : 1.0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black cursor-pointer"
      onClick={onClose}
    >
      <Suspense fallback={
        <div className="w-full h-full flex items-center justify-center text-white/50">
          Loading...
        </div>
      }>
        <AnimatedFractalCanvas
          params={fractal.params}
          keyframes={shouldAutoplay ? fractal.animation!.keyframes : undefined}
          dprScale={dprScale}
          active={true}
          className="w-full h-full"
        />
      </Suspense>

      {/* Hint text */}
      <div className="absolute bottom-4 left-0 right-0 text-center text-white/50 text-sm pointer-events-none">
        {t('fullscreenHint')}
      </div>
    </div>
  );
}
