'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ChevronDown, Plus, X, Play, Square } from 'lucide-react';
import type { ViewBounds, Keyframe } from '@/engine/types';
import { buildTimeline, totalDuration } from '@/engine/animation/interpolate';

interface KeyframeManagerProps {
  keyframes: Keyframe[];
  currentBounds: ViewBounds;
  onKeyframesChange: (keyframes: Keyframe[]) => void;
  onPreviewToggle: (playing: boolean) => void;
  isPreviewPlaying: boolean;
  onBoundsChange?: (bounds: ViewBounds) => void;
}

/**
 * Format zoom level for display
 * 1.5 → "1.5x"
 * 1500 → "1.5K"
 * 1500000 → "1.5M"
 */
function formatZoom(zoom: number): string {
  if (zoom >= 1_000_000) {
    return `${(zoom / 1_000_000).toFixed(1)}M`;
  }
  if (zoom >= 1_000) {
    return `${(zoom / 1_000).toFixed(1)}K`;
  }
  return `${zoom.toFixed(1)}x`;
}

/**
 * Keyframe animation management UI
 */
export default function KeyframeManager({
  keyframes,
  currentBounds,
  onKeyframesChange,
  onPreviewToggle,
  isPreviewPlaying,
  onBoundsChange,
}: KeyframeManagerProps) {
  const t = useTranslations('explore.controls.animation');
  const [isOpen, setIsOpen] = useState(true);

  const canAddMore = keyframes.length < 5;
  const canPreview = keyframes.length >= 2;

  // Calculate total loop duration
  const loopDuration = useMemo(() => {
    if (keyframes.length < 2) return 0;
    const timeline = buildTimeline(keyframes);
    return Math.round(totalDuration(timeline));
  }, [keyframes]);

  const handleAddKeyframe = () => {
    if (!canAddMore) return;
    const newKeyframe: Keyframe = {
      id: crypto.randomUUID(),
      bounds: { ...currentBounds },
    };
    onKeyframesChange([...keyframes, newKeyframe]);
  };

  const handleRemoveKeyframe = (index: number) => {
    const newKeyframes = keyframes.filter((_, i) => i !== index);
    onKeyframesChange(newKeyframes);
    
    // Auto-stop preview if less than 2 keyframes
    if (newKeyframes.length < 2 && isPreviewPlaying) {
      onPreviewToggle(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between py-2 text-sm font-medium"
      >
        {t('title')}
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="space-y-3 pt-1">
        {/* Header: Add button + Duration */}
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddKeyframe}
            disabled={!canAddMore}
            className="h-8"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t('addKeyframe')}
          </Button>
          {loopDuration > 0 && (
            <span className="text-xs text-muted-foreground">
              {t('duration', { seconds: loopDuration })}
            </span>
          )}
        </div>

        {/* Max keyframes hint */}
        {!canAddMore && (
          <p className="text-xs text-muted-foreground">
            {t('maxReached')}
          </p>
        )}

        {/* No keyframes hint */}
        {keyframes.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t('noKeyframes')}
          </p>
        )}

        {/* Keyframe list */}
        {keyframes.length > 0 && (
          <div className="space-y-1.5">
            {keyframes.map((kf, index) => (
              <div
                key={kf.id}
                className="flex items-center justify-between rounded bg-muted/50 px-2.5 py-1.5 text-sm"
              >
                <button
                  onClick={() => onBoundsChange?.(kf.bounds)}
                  className="flex-1 text-left text-sm hover:text-primary transition-colors cursor-pointer"
                >
                  {t('keyframeLabel', {
                    number: index + 1,
                    zoom: formatZoom(kf.bounds.zoom),
                  })}
                </button>
                <button
                  onClick={() => handleRemoveKeyframe(index)}
                  className="text-muted-foreground transition-colors hover:text-destructive ml-2"
                  aria-label={t('removeKeyframe')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Preview button */}
        <Button
          size="sm"
          variant={isPreviewPlaying ? 'secondary' : 'default'}
          onClick={() => onPreviewToggle(!isPreviewPlaying)}
          disabled={!canPreview}
          className="w-full"
        >
          {isPreviewPlaying ? (
            <>
              <Square className="mr-1.5 h-3.5 w-3.5" />
              {t('stopPreview')}
            </>
          ) : (
            <>
              <Play className="mr-1.5 h-3.5 w-3.5" />
              {t('preview')}
            </>
          )}
        </Button>
      </div>}
    </div>
  );
}
