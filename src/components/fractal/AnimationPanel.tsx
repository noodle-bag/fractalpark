'use client';

import { useTranslations } from 'next-intl';

import KeyframeManager from './KeyframeManager';
import type { Keyframe, ViewBounds } from '@/engine/types';
import {
  ANIMATION_PLAYBACK_SPEEDS,
  type AnimationPlaybackSpeed,
} from '@/engine/animation/playback';
import { Label } from '@/components/ui/label';

interface AnimationPanelProps {
  keyframes: Keyframe[];
  bounds: ViewBounds;
  onKeyframesChange: (keyframes: Keyframe[]) => void;
  onPreviewToggle: (playing: boolean) => void;
  isPreviewPlaying: boolean;
  speed: AnimationPlaybackSpeed;
  onSpeedChange: (speed: AnimationPlaybackSpeed) => void;
  onBoundsChange?: (bounds: ViewBounds) => void;
}

export function AnimationPanel({
  keyframes,
  bounds,
  onKeyframesChange,
  onPreviewToggle,
  isPreviewPlaying,
  speed,
  onSpeedChange,
  onBoundsChange,
}: AnimationPanelProps) {
  const t = useTranslations('explore.controls.animation');
  const speedIndex = ANIMATION_PLAYBACK_SPEEDS.indexOf(speed);

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="animation-speed">{t('speed')}</Label>
          <output htmlFor="animation-speed" className="font-mono text-sm font-medium">{speed}×</output>
        </div>
        <input
          id="animation-speed"
          type="range"
          min={0}
          max={ANIMATION_PLAYBACK_SPEEDS.length - 1}
          step={1}
          value={speedIndex}
          aria-valuetext={`${speed}×`}
          onChange={event => onSpeedChange(ANIMATION_PLAYBACK_SPEEDS[Number(event.currentTarget.value)])}
          className="min-h-11 w-full accent-primary"
        />
        <div className="flex justify-between text-xs text-muted-foreground" aria-hidden="true">
          <span>0.25×</span><span>1×</span><span>4×</span>
        </div>
        <p className="text-xs text-muted-foreground">{t('speedHint')}</p>
      </div>
      <KeyframeManager
        keyframes={keyframes}
        onKeyframesChange={onKeyframesChange}
        currentBounds={bounds}
        onPreviewToggle={onPreviewToggle}
        isPreviewPlaying={isPreviewPlaying}
        speed={speed}
        onBoundsChange={onBoundsChange}
      />
    </div>
  );
}
