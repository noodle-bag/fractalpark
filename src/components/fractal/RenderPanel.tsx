'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface RenderPanelProps {
  maxIterations: number;
  useSSAA: boolean;
  adaptiveIterations: boolean;
  copied: boolean;
  savedCount: number;
  onIterationsChange: (value: number) => void;
  onUseSSAAChange: (enabled: boolean) => void;
  onAdaptiveIterationsChange: (enabled: boolean) => void;
  onResetView: () => void;
  onShare: () => void;
  onExport: (scale: number, ssaaLevel: number) => Promise<void>;
  onSave?: (name: string) => void;
}

export function RenderPanel({
  maxIterations,
  useSSAA,
  adaptiveIterations,
  copied,
  savedCount,
  onIterationsChange,
  onUseSSAAChange,
  onAdaptiveIterationsChange,
  onResetView,
  onShare,
  onExport,
  onSave,
}: RenderPanelProps) {
  const t = useTranslations('explore.controls');
  const [exportScale, setExportScale] = useState(2);
  const [exportQuality, setExportQuality] = useState<number>(9); // ssaaLevel: 0/4/9/16
  const [exporting, setExporting] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
        <div className="flex items-center justify-between">
          <Label htmlFor="ssaa-toggle" className="text-sm font-medium leading-none">{t('quality.ssaa')}</Label>
          <Switch id="ssaa-toggle" checked={useSSAA} onCheckedChange={onUseSSAAChange} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="adaptive-toggle" className="text-sm font-medium leading-none">{t('quality.adaptive')}</Label>
          <Switch
            id="adaptive-toggle"
            checked={adaptiveIterations}
            onCheckedChange={onAdaptiveIterationsChange}
          />
        </div>
      </div>

      <div className="space-y-4 rounded-lg border p-3 bg-muted/30">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium leading-none">
            {t('iterations')}
          </label>
          <span className="text-sm font-mono text-muted-foreground">{maxIterations}</span>
        </div>
        <Slider
          value={[maxIterations]}
          onValueChange={(v) => onIterationsChange(v[0])}
          min={50}
          max={1000}
          step={50}
          className="w-full"
        />
      </div>

      <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
        <label className="text-sm font-medium leading-none">
          {t('export.label')}
        </label>
        <div className="flex gap-2">
          <div className="flex rounded-md border overflow-hidden flex-1">
            {[1, 2, 3, 4].map((s) => (
              <button
                key={s}
                onClick={() => setExportScale(s)}
                className={`flex-1 py-1.5 text-xs font-mono transition-colors ${
                  exportScale === s
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('export.quality')}</Label>
          <div className="flex rounded-md border overflow-hidden">
            {([
              { level: 0, label: t('export.qualityFast') },
              { level: 4, label: t('export.qualityStandard') },
              { level: 9, label: t('export.qualityHigh') },
              { level: 16, label: t('export.qualityUltra') },
            ] as const).map(({ level, label }) => (
              <button
                key={level}
                onClick={() => setExportQuality(level)}
                className={`flex-1 py-1.5 text-xs transition-colors ${
                  exportQuality === level
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Button
          variant="default"
          size="sm"
          disabled={exporting}
          className="w-full"
          onClick={async () => {
            setExporting(true);
            try {
              await onExport(exportScale, exportQuality);
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? t('export.rendering') : t('export.button')}
        </Button>
      </div>

      <div className="pt-2 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onResetView}>
          {t('resetView')}
        </Button>
        <Button variant="outline" className="flex-1" onClick={onShare}>
          {copied ? t('share.copied') : t('share.label')}
        </Button>
      </div>

      <div className="pt-0">
        <Button
          className="w-full"
          onClick={() => {
            setSaveName(`Fractal #${savedCount + 1}`);
            setSaveDialogOpen(true);
            setSaveSuccess(false);
          }}
        >
          {saveSuccess ? t('save.success') : t('save.button')}
        </Button>
      </div>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('save.dialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="fractal-name">{t('save.dialog.name')}</Label>
            <Input
              id="fractal-name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder={t('save.dialog.placeholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && saveName.trim()) {
                  onSave?.(saveName.trim());
                  setSaveDialogOpen(false);
                  setSaveSuccess(true);
                  setTimeout(() => setSaveSuccess(false), 2000);
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveDialogOpen(false)}
            >
              {t('save.dialog.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (saveName.trim()) {
                  onSave?.(saveName.trim());
                  setSaveDialogOpen(false);
                  setSaveSuccess(true);
                  setTimeout(() => setSaveSuccess(false), 2000);
                }
              }}
            >
              {t('save.dialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
