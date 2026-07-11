'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ColorSchemeSelector } from './ColorSchemeSelector';
import { GradientEditor } from './GradientEditor';
import type {
  GradientStop,
  InsideColoringMode,
  LightingConfig,
  OrbitTrapConfig,
  OutsideColoringMode,
  ShaderStyleState,
} from '@/engine/types';

interface ColoringPanelProps {
  pipelineVersion: 1 | 2;
  modernStyle?: ShaderStyleState;
  paletteIndex: number;
  outsideColoring: OutsideColoringMode;
  insideColoring: InsideColoringMode;
  orbitTrap: OrbitTrapConfig;
  customGradient: GradientStop[] | null;
  lighting: LightingConfig;
  onPipelineVersionChange: (version: 1 | 2) => void;
  onModernStyleChange: (style: ShaderStyleState) => void;
  onPaletteChange: (index: number) => void;
  onOutsideColoringChange: (mode: OutsideColoringMode) => void;
  onInsideColoringChange: (mode: InsideColoringMode) => void;
  onOrbitTrapChange: (trap: OrbitTrapConfig) => void;
  onGradientChange: (gradient: GradientStop[] | null) => void;
  onLightingChange: (lighting: LightingConfig) => void;
}

export function ColoringPanel({
  pipelineVersion,
  modernStyle,
  paletteIndex,
  outsideColoring,
  insideColoring,
  orbitTrap,
  customGradient,
  lighting,
  onPipelineVersionChange,
  onModernStyleChange,
  onPaletteChange,
  onOutsideColoringChange,
  onInsideColoringChange,
  onOrbitTrapChange,
  onGradientChange,
  onLightingChange,
}: ColoringPanelProps) {
  const t = useTranslations('explore.controls');
  const useCustomGradient = customGradient !== null;
  const post = modernStyle?.post;

  const updatePost = (patch: Partial<ShaderStyleState['post']>) => {
    if (!modernStyle) return;
    onModernStyleChange({
      ...modernStyle,
      post: { ...modernStyle.post, ...patch },
    });
  };

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
        <label className="text-sm font-medium leading-none">{t('coloring.style')}</label>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant={pipelineVersion === 1 ? 'default' : 'outline'} onClick={() => onPipelineVersionChange(1)}>
            {t('coloring.legacySmooth')}
          </Button>
          <Button size="sm" variant={pipelineVersion === 2 && modernStyle?.styleId === 'modernSmooth' ? 'default' : 'outline'} onClick={() => {
            onPipelineVersionChange(2);
            if (modernStyle) onModernStyleChange({ ...modernStyle, styleId: 'modernSmooth' });
          }}>
            {t('coloring.modernSmooth')}
          </Button>
          <Button size="sm" variant={pipelineVersion === 2 && modernStyle?.styleId === 'layeredOrbit' ? 'default' : 'outline'} onClick={() => {
            onPipelineVersionChange(2);
            onModernStyleChange({ ...(modernStyle ?? { styleId: 'modernSmooth', post: { toneMapping: 'soft', exposure: 0, contrast: 1, saturation: 1, temperature: 0, tint: 0, vignette: 0, dither: true } }), styleId: 'layeredOrbit' });
          }}>
            {t('coloring.layeredOrbit')}
          </Button>
          <Button size="sm" variant={pipelineVersion === 2 && modernStyle?.styleId === 'orbitNebula' ? 'default' : 'outline'} onClick={() => {
            onPipelineVersionChange(2);
            onModernStyleChange({ ...(modernStyle ?? { styleId: 'modernSmooth', post: { toneMapping: 'soft', exposure: 0, contrast: 1, saturation: 1, temperature: 0, tint: 0, vignette: 0, dither: true } }), styleId: 'orbitNebula' });
          }}>
            {t('coloring.orbitNebula')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {pipelineVersion === 1 ? t('coloring.legacyDescription') : t('coloring.modernDescription')}
        </p>
      </div>

      {pipelineVersion === 1 && <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
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
      </div>}

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

      <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
        <div className="flex items-center justify-between">
          <Label htmlFor="lighting-toggle" className="text-sm font-medium leading-none">{t('quality.lighting')}</Label>
          <Switch id="lighting-toggle" checked={lighting.enabled} onCheckedChange={(enabled) => onLightingChange({ ...lighting, enabled })} />
        </div>
        {lighting.enabled && <>
          <Select value={lighting.mode} onValueChange={(mode) => onLightingChange({ ...lighting, mode: mode as LightingConfig['mode'] })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="normalMap">{t('quality.lightingModeNormalMap')}</SelectItem>
              <SelectItem value="dem">{t('quality.lightingModeDem')}</SelectItem>
            </SelectContent>
          </Select>
          {lighting.mode === 'normalMap' && <>
            <div className="space-y-1"><Label htmlFor="light-azimuth" className="text-xs text-muted-foreground">{t('quality.azimuth')}</Label><Slider id="light-azimuth" value={[lighting.azimuth]} onValueChange={(v) => onLightingChange({ ...lighting, azimuth: v[0] })} min={0} max={360} step={1} /></div>
            <div className="space-y-1"><Label htmlFor="light-elevation" className="text-xs text-muted-foreground">{t('quality.elevation')}</Label><Slider id="light-elevation" value={[lighting.elevation]} onValueChange={(v) => onLightingChange({ ...lighting, elevation: v[0] })} min={5} max={85} step={1} /></div>
          </>}
          <div className="space-y-1"><Label htmlFor="light-intensity" className="text-xs text-muted-foreground">{t('quality.intensity')}</Label><Slider id="light-intensity" value={[lighting.intensity]} onValueChange={(v) => onLightingChange({ ...lighting, intensity: v[0] })} min={0} max={1} step={0.01} /></div>
        </>}
      </div>

      {pipelineVersion === 2 && post && (
        <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
          <label className="text-sm font-medium leading-none">{t('coloring.finish')}</label>
          <div className="space-y-1">
            <Label htmlFor="color-exposure" className="text-xs text-muted-foreground">{t('coloring.exposure')}</Label>
            <Slider id="color-exposure" value={[post.exposure]} onValueChange={(v) => updatePost({ exposure: v[0] })} min={-3} max={3} step={0.05} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="color-contrast" className="text-xs text-muted-foreground">{t('coloring.contrast')}</Label>
            <Slider id="color-contrast" value={[post.contrast]} onValueChange={(v) => updatePost({ contrast: v[0] })} min={0} max={2} step={0.05} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="color-saturation" className="text-xs text-muted-foreground">{t('coloring.saturation')}</Label>
            <Slider id="color-saturation" value={[post.saturation]} onValueChange={(v) => updatePost({ saturation: v[0] })} min={0} max={2} step={0.05} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t('coloring.toneMapping')}</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['none', 'soft', 'filmic'] as const).map((toneMapping) => (
                <Button key={toneMapping} size="sm" variant={post.toneMapping === toneMapping ? 'default' : 'outline'} onClick={() => updatePost({ toneMapping })}>
                  {t(`coloring.toneMapping${toneMapping[0].toUpperCase()}${toneMapping.slice(1)}`)}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="color-dither" className="text-xs text-muted-foreground">{t('coloring.dither')}</Label>
            <Switch id="color-dither" checked={post.dither} onCheckedChange={(dither) => updatePost({ dither })} />
          </div>
        </div>
      )}
    </div>
  );
}
