'use client';

import { useTranslations } from 'next-intl';
import type { ViewBounds } from '@/engine/types';

interface PositionSummaryPanelProps {
  bounds: ViewBounds;
}

export function PositionSummaryPanel({ bounds }: PositionSummaryPanelProps) {
  const t = useTranslations('explore.controls');
  const center = `${bounds.centerX.toFixed(4)}, ${bounds.centerY.toFixed(4)}`;
  const zoom = `${bounds.zoom.toFixed(2)}x`;

  return (
    <div
      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2 overflow-hidden whitespace-nowrap rounded-lg border bg-muted/30 p-3"
      data-testid="position-summary"
    >
      <div className="shrink-0 text-xs font-medium leading-none sm:text-sm">
        {t('position')}
      </div>
      <div
        className="min-w-0 truncate font-mono text-[10px] tabular-nums text-muted-foreground sm:text-xs"
        aria-label={`${t('center')}: ${center}`}
        title={`${t('center')}: ${center}`}
      >
        <span className="hidden font-sans min-[390px]:inline">{t('center')} </span>
        {center}
      </div>
      <div
        className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground sm:text-xs"
        aria-label={`${t('zoom')}: ${zoom}`}
        title={`${t('zoom')}: ${zoom}`}
      >
        <span className="hidden font-sans min-[390px]:inline">{t('zoom')} </span>
        {zoom}
      </div>
    </div>
  );
}
