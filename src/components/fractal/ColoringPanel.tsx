'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ColorSchemeSelector } from './ColorSchemeSelector';
import { GradientEditor } from './GradientEditor';
import { ColorAdjustmentsPanel } from './ColorAdjustmentsPanel';
import type {
  ColorAdjustmentsConfig,
  GradientStop,
  InsideColoringMode,
  OrbitTrapConfig,
  OutsideColoringMode,
} from '@/engine/types';

interface ColoringPanelProps {
  paletteIndex: number;
  outsideColoring: OutsideColoringMode;
  insideColoring: InsideColoringMode;
  orbitTrap: OrbitTrapConfig;
  customGradient: GradientStop[] | null;
  colorAdjustments: ColorAdjustmentsConfig;
  onPaletteChange: (index: number) => void;
  onOutsideColoringChange: (mode: OutsideColoringMode) => void;
  onInsideColoringChange: (mode: InsideColoringMode) => void;
  onOrbitTrapChange: (trap: OrbitTrapConfig) => void;
  onGradientChange: (gradient: GradientStop[] | null) => void;
  onColorAdjustmentsChange: (adjustments: ColorAdjustmentsConfig) => void;
}

export function ColoringPanel({
  paletteIndex,
  outsideColoring,
  insideColoring,
  orbitTrap,
  customGradient,
  colorAdjustments,
  onPaletteChange,
  onOutsideColoringChange,
  onInsideColoringChange,
  onOrbitTrapChange,
  onGradientChange,
  onColorAdjustmentsChange,
}: ColoringPanelProps) {
  const t = useTranslations('explore.controls');
  const useCustomGradient = customGradient !== null;

  const handleToggleGradient = (enabled: boolean) => {
    if (enabled) {
      onGradientChange([
        { position: 0, color: '#000004' },
        { position: 0.33, color: '#b73779' },
        { position: 0.66, color: '#fc8961' },
        { position: 1, color: '#fcfdbf' },
      ]);
      return;
    }

    onGradientChange(null);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
        <label className="text-sm font-medium leading-none">{t('coloring.outside')}</label>
        <div className="grid grid-cols-2 gap-2">
          {([
            ['smooth', t('coloring.smooth')],
            ['orbitTrap', t('coloring.orbitTrap')],
            ['orbitEcho', t('coloring.orbitEcho')],
            ['stripe', t('coloring.stripe')],
            ['binary', t('coloring.binary')],
            ['tia', t('coloring.tia')],
          ] as const).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={outsideColoring === value ? 'default' : 'outline'}
              onClick={() => onOutsideColoringChange(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        <label className="text-sm font-medium leading-none">{t('coloring.inside')}</label>
        <div className="grid grid-cols-3 gap-2">
          {([
            ['black', t('coloring.black')],
            ['finalOrbit', t('coloring.finalOrbit')],
            ['atomDomain', t('coloring.atomDomain')],
          ] as const).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={insideColoring === value ? 'default' : 'outline'}
              onClick={() => onInsideColoringChange(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        {outsideColoring === 'orbitTrap' && (
          <div className="space-y-3 pt-1">
            <label className="text-xs font-medium uppercase tracking-wider opacity-70">{t('orbitTrap.label')}</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                ['point', t('orbitTrap.point')],
                ['cross', t('orbitTrap.cross')],
                ['circle', t('orbitTrap.circle')],
              ] as const).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={orbitTrap.shape === value ? 'default' : 'outline'}
                  onClick={() => onOrbitTrapChange({ ...orbitTrap, shape: value })}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="space-y-1">
              <Label htmlFor="orbit-radius" className="text-xs text-muted-foreground">{t('orbitTrap.radius')}</Label>
              <Slider
                id="orbit-radius"
                value={[orbitTrap.radius]}
                onValueChange={(v) => onOrbitTrapChange({ ...orbitTrap, radius: v[0] })}
                min={0.05}
                max={1.2}
                step={0.01}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="orbit-width" className="text-xs text-muted-foreground">{t('orbitTrap.width')}</Label>
              <Slider
                id="orbit-width"
                value={[orbitTrap.width]}
                onValueChange={(v) => onOrbitTrapChange({ ...orbitTrap, width: v[0] })}
                min={0.005}
                max={0.2}
                step={0.005}
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium leading-none">
            {t('colorScheme')}
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {useCustomGradient ? t('gradient.custom') : t('gradient.preset')}
            </span>
            <Switch
              id="gradient-mode"
              checked={useCustomGradient}
              onCheckedChange={handleToggleGradient}
            />
          </div>
        </div>

        {useCustomGradient ? (
          <GradientEditor value={customGradient} onChange={onGradientChange} />
        ) : (
          <ColorSchemeSelector value={paletteIndex} onChange={onPaletteChange} />
        )}
      </div>

      <ColorAdjustmentsPanel value={colorAdjustments} onChange={onColorAdjustmentsChange} />
    </div>
  );
}
