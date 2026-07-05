'use client';

import { useTranslations } from 'next-intl';
import type { ViewBounds } from '@/engine/types';

interface PositionSummaryPanelProps {
  bounds: ViewBounds;
}

export function PositionSummaryPanel({ bounds }: PositionSummaryPanelProps) {
  const t = useTranslations('explore.controls');

  return (
    <div className="rounded-lg border p-3 bg-muted/30">
      <div className="text-sm font-medium leading-none">{t('position')}</div>
      <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground mt-3">
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wider opacity-70">{t('center')}</span>
          <span className="font-mono">{bounds.centerX.toFixed(4)}, {bounds.centerY.toFixed(4)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wider opacity-70">{t('zoom')}</span>
          <span className="font-mono">{bounds.zoom.toFixed(2)}x</span>
        </div>
      </div>
    </div>
  );
}
