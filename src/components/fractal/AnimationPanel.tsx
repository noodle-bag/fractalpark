'use client';

import KeyframeManager from './KeyframeManager';
import type { Keyframe, ViewBounds } from '@/engine/types';

interface AnimationPanelProps {
  keyframes: Keyframe[];
  bounds: ViewBounds;
  onKeyframesChange: (keyframes: Keyframe[]) => void;
  onPreviewToggle: (playing: boolean) => void;
  isPreviewPlaying: boolean;
  onBoundsChange?: (bounds: ViewBounds) => void;
}

export function AnimationPanel({
  keyframes,
  bounds,
  onKeyframesChange,
  onPreviewToggle,
  isPreviewPlaying,
  onBoundsChange,
}: AnimationPanelProps) {
  return (
    <div className="space-y-3">
      <KeyframeManager
        keyframes={keyframes}
        onKeyframesChange={onKeyframesChange}
        currentBounds={bounds}
        onPreviewToggle={onPreviewToggle}
        isPreviewPlaying={isPreviewPlaying}
        onBoundsChange={onBoundsChange}
      />
    </div>
  );
}
