'use client';

import { useTranslations } from 'next-intl';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { LightingConfig } from '@/engine/types';

interface RenderPanelProps {
  maxIterations: number;
  useSSAA: boolean;
  adaptiveIterations: boolean;
  lighting: LightingConfig;
  onIterationsChange: (value: number) => void;
  onUseSSAAChange: (enabled: boolean) => void;
  onAdaptiveIterationsChange: (enabled: boolean) => void;
  onLightingChange: (lighting: LightingConfig) => void;
}

export function RenderPanel({
  maxIterations,
  useSSAA,
  adaptiveIterations,
  lighting,
  onIterationsChange,
  onUseSSAAChange,
  onAdaptiveIterationsChange,
  onLightingChange,
}: RenderPanelProps) {
  const t = useTranslations('explore.controls');

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

    </div>
  );
}
