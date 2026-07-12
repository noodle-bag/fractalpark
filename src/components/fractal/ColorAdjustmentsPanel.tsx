'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { createDefaultColorAdjustments } from '@/engine/document';
import type { ColorAdjustmentsConfig } from '@/engine/types';
import { RgbCurveEditor } from './RgbCurveEditor';

interface Props { value: ColorAdjustmentsConfig; onChange: (value: ColorAdjustmentsConfig) => void; }
interface SliderProps { id: string; label: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void; }
function AdjustmentSlider({ id, label, value, min, max, step, display, onChange }: SliderProps) {
  return <div className="space-y-1.5"><div className="flex items-center justify-between gap-3"><Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label><span className="min-w-12 text-right text-xs tabular-nums text-muted-foreground">{display}</span></div><Slider id={id} aria-label={label} value={[value]} min={min} max={max} step={step} onValueChange={(next) => onChange(next[0])} /></div>;
}
const signed = (value: number, digits = 0) => `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;

export function ColorAdjustmentsPanel({ value, onChange }: Props) {
  const t = useTranslations('explore.controls.adjustments');
  const defaults = createDefaultColorAdjustments();
  const update = <K extends keyof ColorAdjustmentsConfig>(key: K, next: ColorAdjustmentsConfig[K]) => onChange({ ...value, [key]: next });
  return <div className="space-y-4 rounded-lg border bg-muted/30 p-3">
    <div className="flex items-center justify-between gap-2"><label className="text-sm font-medium leading-none">{t('title')}</label><Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={JSON.stringify(value) === JSON.stringify(defaults)} onClick={() => onChange(defaults)}>{t('reset')}</Button></div>
    <div className="space-y-3">
      <AdjustmentSlider id="adjust-exposure" label={t('exposure')} value={value.exposure} min={-3} max={3} step={0.05} display={`${signed(value.exposure, 2)} EV`} onChange={(next) => update('exposure', next)} />
      <AdjustmentSlider id="adjust-contrast" label={t('contrast')} value={value.contrast} min={-100} max={100} step={1} display={signed(value.contrast)} onChange={(next) => update('contrast', next)} />
      <AdjustmentSlider id="adjust-brightness" label={t('brightness')} value={value.brightness} min={-100} max={100} step={1} display={signed(value.brightness)} onChange={(next) => update('brightness', next)} />
      <AdjustmentSlider id="adjust-gamma" label={t('gamma')} value={value.gamma} min={0.25} max={4} step={0.01} display={value.gamma.toFixed(2)} onChange={(next) => update('gamma', next)} />
      <AdjustmentSlider id="adjust-saturation" label={t('saturation')} value={value.saturation} min={-100} max={100} step={1} display={signed(value.saturation)} onChange={(next) => update('saturation', next)} />
      <AdjustmentSlider id="adjust-vibrance" label={t('vibrance')} value={value.vibrance} min={-100} max={100} step={1} display={signed(value.vibrance)} onChange={(next) => update('vibrance', next)} />
      <AdjustmentSlider id="adjust-hue" label={t('hue')} value={value.hue} min={-180} max={180} step={1} display={`${signed(value.hue)}°`} onChange={(next) => update('hue', next)} />
    </div>
    <details className="rounded-md border bg-background/60 p-2"><summary className="cursor-pointer select-none text-xs font-medium">{t('curves')}</summary><div className="pt-3"><RgbCurveEditor value={value.curves} onChange={(curves) => update('curves', curves)} labels={{ red: t('red'), green: t('green'), blue: t('blue'), resetChannel: t('resetChannel'), point: t('point') }} /></div></details>
    <div className="flex items-center justify-between rounded-md border bg-background/60 p-2"><Label htmlFor="adjust-invert" className="text-xs">{t('invert')}</Label><Switch id="adjust-invert" checked={value.invert} onCheckedChange={(next) => update('invert', next)} /></div>
  </div>;
}
