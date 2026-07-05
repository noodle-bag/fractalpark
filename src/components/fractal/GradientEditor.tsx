'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import type { GradientStop } from '@/engine/types';

const MAX_STOPS = 5;
const MIN_STOPS = 2;

export const GRADIENT_PRESETS: { key: string; stops: GradientStop[] }[] = [
  {
    key: 'inferno',
    stops: [
      { position: 0, color: '#000004' },
      { position: 0.33, color: '#b73779' },
      { position: 0.66, color: '#fc8961' },
      { position: 1, color: '#fcfdbf' },
    ],
  },
  {
    key: 'ocean',
    stops: [
      { position: 0, color: '#0a1628' },
      { position: 0.4, color: '#1565c0' },
      { position: 0.7, color: '#4dd0e1' },
      { position: 1, color: '#e0f7fa' },
    ],
  },
  {
    key: 'spectrum',
    stops: [
      { position: 0, color: '#ff0000' },
      { position: 0.25, color: '#ffff00' },
      { position: 0.5, color: '#00ff00' },
      { position: 0.75, color: '#0000ff' },
      { position: 1, color: '#ff00ff' },
    ],
  },
  {
    key: 'sakura',
    stops: [
      { position: 0, color: '#f8bbd0' },
      { position: 0.5, color: '#ffffff' },
      { position: 1, color: '#ce93d8' },
    ],
  },
  {
    key: 'moonlight',
    stops: [
      { position: 0, color: '#0f172a' },
      { position: 0.5, color: '#93c5fd' },
      { position: 1, color: '#f8fafc' },
    ],
  },
];

interface GradientEditorProps {
  value: GradientStop[];
  onChange: (stops: GradientStop[]) => void;
}

function stopsToCSS(stops: GradientStop[]): string {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const parts = sorted.map((s) => `${s.color} ${(s.position * 100).toFixed(0)}%`);
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

export function GradientEditor({ value, onChange }: GradientEditorProps) {
  const t = useTranslations('explore.controls.gradient');

  const sortedStops = [...value].sort((a, b) => a.position - b.position);

  const handleColorChange = (index: number, color: string) => {
    const sorted = [...value].sort((a, b) => a.position - b.position);
    const updated = sorted.map((s, i) => (i === index ? { ...s, color } : s));
    onChange(updated);
  };

  const handlePositionChange = (index: number, position: number) => {
    const sorted = [...value].sort((a, b) => a.position - b.position);
    const updated = sorted.map((s, i) =>
      i === index ? { ...s, position: Math.max(0, Math.min(1, position)) } : s
    );
    onChange(updated);
  };

  const handleAdd = () => {
    if (value.length >= MAX_STOPS) return;
    const sorted = [...value].sort((a, b) => a.position - b.position);
    // Insert at midpoint of largest gap
    let maxGap = 0;
    let gapStart = 0;
    let gapEnd = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1].position - sorted[i].position;
      if (gap > maxGap) {
        maxGap = gap;
        gapStart = sorted[i].position;
        gapEnd = sorted[i + 1].position;
      }
    }
    const newPos = (gapStart + gapEnd) / 2;
    onChange([...value, { position: newPos, color: '#888888' }]);
  };

  const handleRemove = (index: number) => {
    if (value.length <= MIN_STOPS) return;
    const sorted = [...value].sort((a, b) => a.position - b.position);
    onChange(sorted.filter((_, i) => i !== index));
  };

  const handlePreset = (stops: GradientStop[]) => {
    onChange(stops.map((s) => ({ ...s })));
  };

  return (
    <div className="space-y-3">
      {/* Gradient preview bar */}
      <div
        className="h-8 w-full rounded-md border shadow-sm"
        style={{ background: stopsToCSS(sortedStops) }}
      />

      {/* Preset buttons */}
      <div className="flex gap-1.5 flex-wrap">
        {GRADIENT_PRESETS.map((preset) => (
          <button
            key={preset.key}
            onClick={() => handlePreset(preset.stops)}
            className="h-5 w-10 rounded border shadow-sm hover:ring-1 hover:ring-primary/50 transition-all"
            style={{ background: stopsToCSS(preset.stops) }}
            title={t(`presets.${preset.key}`)}
          />
        ))}
      </div>

      {/* Color stops */}
      <div className="space-y-2">
        {sortedStops.map((stop, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="color"
              value={stop.color}
              onChange={(e) => handleColorChange(index, e.target.value)}
              className="h-7 w-7 rounded border cursor-pointer bg-transparent p-0.5"
            />
            <Slider
              value={[stop.position * 100]}
              onValueChange={(v) => handlePositionChange(index, v[0] / 100)}
              min={0}
              max={100}
              step={1}
              className="flex-1"
            />
            <span className="text-xs font-mono text-muted-foreground w-8 text-right">
              {(stop.position * 100).toFixed(0)}%
            </span>
            <button
              onClick={() => handleRemove(index)}
              disabled={value.length <= MIN_STOPS}
              className="text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed text-sm px-1"
              title={t('removeStop')}
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {/* Add stop button */}
      {value.length < MAX_STOPS && (
        <Button variant="outline" size="sm" onClick={handleAdd} className="w-full text-xs">
          {t('addStop')}
        </Button>
      )}
    </div>
  );
}
