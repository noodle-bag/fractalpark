'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { LightingConfig } from '@/engine/types';

interface RenderPanelProps {
  maxIterations: number;
  useSSAA: boolean;
  adaptiveIterations: boolean;
  lighting: LightingConfig;
  copied: boolean;
  savedCount: number;
  onIterationsChange: (value: number) => void;
  onUseSSAAChange: (enabled: boolean) => void;
  onAdaptiveIterationsChange: (enabled: boolean) => void;
  onLightingChange: (lighting: LightingConfig) => void;
  onResetView: () => void;
  onShare: () => void;
  onExport: (scale: number, ssaaLevel: number) => Promise<void>;
  onSave?: (name: string) => void;
}

export function RenderPanel({
  maxIterations,
  useSSAA,
  adaptiveIterations,
  lighting,
  copied,
  savedCount,
  onIterationsChange,
  onUseSSAAChange,
  onAdaptiveIterationsChange,
  onLightingChange,
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
        <div className="flex items-center justify-between">
          <Label htmlFor="lighting-toggle" className="text-sm font-medium leading-none">{t('quality.lighting')}</Label>
          <Switch
            id="lighting-toggle"
            checked={lighting.enabled}
            onCheckedChange={(enabled) => onLightingChange({ ...lighting, enabled })}
          />
        </div>
        {lighting.enabled && (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('quality.lightingMode')}</Label>
              <Select
                value={lighting.mode ?? 'normalMap'}
                onValueChange={(v) => onLightingChange({ ...lighting, mode: v as 'normalMap' | 'dem' })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normalMap">{t('quality.lightingModeNormalMap')}</SelectItem>
                  <SelectItem value="dem">{t('quality.lightingModeDem')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(lighting.mode ?? 'normalMap') === 'normalMap' && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="light-azimuth" className="text-xs text-muted-foreground">{t('quality.azimuth')}</Label>
                  <Slider
                    id="light-azimuth"
                    value={[lighting.azimuth]}
                    onValueChange={(v) => onLightingChange({ ...lighting, azimuth: v[0] })}
                    min={0}
                    max={360}
                    step={1}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="light-elevation" className="text-xs text-muted-foreground">{t('quality.elevation')}</Label>
                  <Slider
                    id="light-elevation"
                    value={[lighting.elevation]}
                    onValueChange={(v) => onLightingChange({ ...lighting, elevation: v[0] })}
                    min={5}
                    max={85}
                    step={1}
                  />
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label htmlFor="light-intensity" className="text-xs text-muted-foreground">{t('quality.intensity')}</Label>
              <Slider
                id="light-intensity"
                value={[lighting.intensity]}
                onValueChange={(v) => onLightingChange({ ...lighting, intensity: v[0] })}
                min={0}
                max={1}
                step={0.01}
              />
            </div>
          </>
        )}
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
