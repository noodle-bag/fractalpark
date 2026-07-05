'use client';

import { useTranslations } from 'next-intl';
import { pluginRegistry } from '@/engine/plugins/registry';
import { FN_SLOT_OPTIONS, isFnSlotName } from '@/engine/frm/builtins';
import type { PluginUniformDescriptor } from '@/engine/plugins/types';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormulaTab } from './FormulaTab';
import { JuliaPicker } from './JuliaPicker';
import type { FormulaSelectionRequest } from '@/engine/frm/authoring';
import type { PluginParamRecord, PluginParamValue, ViewBounds } from '@/engine/types';

interface FormulaPanelProps {
  isJulia: boolean;
  juliaC: [number, number];
  onJuliaModeChange: (enabled: boolean) => void;
  onJuliaCChange: (value: [number, number]) => void;
  currentFormula: string;
  currentBounds: ViewBounds;
  pluginParams?: PluginParamRecord;
  onFormulaChange: (formula: string) => void;
  onFormulaParamChange: (name: string, value: PluginParamValue) => void;
  onCustomFormulaSelect?: (selection: FormulaSelectionRequest) => void;
}

export function FormulaPanel({
  isJulia,
  juliaC,
  onJuliaModeChange,
  onJuliaCChange,
  currentFormula,
  currentBounds,
  pluginParams,
  onFormulaChange,
  onFormulaParamChange,
  onCustomFormulaSelect,
}: FormulaPanelProps) {
  const t = useTranslations('explore');
  const formulaPlugin = pluginRegistry.getFormula(currentFormula);
  const editableUniforms = (formulaPlugin?.uniforms ?? []).filter(
    (descriptor) => descriptor.type === 'float' || descriptor.type === 'int' || descriptor.type === 'vec2'
  );

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
        <div className="flex items-center justify-between">
          <Label htmlFor="julia-mode" className="text-sm font-medium leading-none">
            {t('controls.mode.label')}
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {isJulia ? t('controls.mode.julia') : t('controls.mode.mandelbrot')}
            </span>
            <Switch id="julia-mode" checked={isJulia} onCheckedChange={onJuliaModeChange} />
          </div>
        </div>

        {!isJulia && (
          <p className="text-xs text-muted-foreground">
            {t('controls.juliaC.pickHint')}
          </p>
        )}

        {isJulia && (
          <div className="space-y-3 pt-2">
            <span className="text-xs font-medium uppercase tracking-wider opacity-70">
              {t('controls.juliaC.label')}
            </span>

            <JuliaPicker value={juliaC} onChange={onJuliaCChange} size={160} />

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="julia-re" className="text-xs text-muted-foreground">Re</Label>
                <Input
                  id="julia-re"
                  type="number"
                  step="0.01"
                  min="-2"
                  max="2"
                  value={juliaC[0]}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!Number.isNaN(val)) onJuliaCChange([val, juliaC[1]]);
                  }}
                  className="h-8 font-mono text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="julia-im" className="text-xs text-muted-foreground">Im</Label>
                <Input
                  id="julia-im"
                  type="number"
                  step="0.01"
                  min="-2"
                  max="2"
                  value={juliaC[1]}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!Number.isNaN(val)) onJuliaCChange([juliaC[0], val]);
                  }}
                  className="h-8 font-mono text-sm"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <FormulaTab
        currentFormula={currentFormula}
        currentBounds={currentBounds}
        onFormulaChange={onFormulaChange}
        onCustomFormulaSelect={onCustomFormulaSelect}
      />

      <div className="space-y-4 rounded-lg border p-3 bg-muted/30">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium leading-none">
            {t('controls.formulaParameters')}
          </label>
        </div>

        {editableUniforms.length > 0 ? (
          <div className="space-y-4">
            {editableUniforms.map((descriptor) => {
              const uniformKey = descriptor.name.startsWith('u_') ? descriptor.name.slice(2) : descriptor.name;
              if (descriptor.type === 'vec2') {
                return (
                  <FormulaComplexInput
                    key={descriptor.name}
                    descriptor={descriptor}
                    value={pluginParams?.[descriptor.name]}
                    onChange={onFormulaParamChange}
                    t={t}
                  />
                );
              }

              if (descriptor.type === 'int' && isFnSlotName(uniformKey)) {
                return (
                  <FormulaFnSlotSelect
                    key={descriptor.name}
                    descriptor={descriptor}
                    value={pluginParams?.[descriptor.name]}
                    onChange={onFormulaParamChange}
                    t={t}
                  />
                );
              }

              return (
                <FormulaUniformSlider
                  key={descriptor.name}
                  descriptor={descriptor}
                  value={pluginParams?.[descriptor.name]}
                  onChange={onFormulaParamChange}
                  t={t}
                />
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('controls.formulaNoParameters')}
          </p>
        )}
      </div>
    </div>
  );
}

interface FormulaUniformControlProps {
  descriptor: PluginUniformDescriptor;
  value?: PluginParamValue;
  onChange: (name: string, value: PluginParamValue) => void;
  t: ReturnType<typeof useTranslations>;
}

function getFormulaUniformLabel(descriptor: PluginUniformDescriptor, t: ReturnType<typeof useTranslations>): string {
  if (descriptor.label) {
    return t(descriptor.label);
  }

  return descriptor.name.startsWith('u_') ? descriptor.name.slice(2) : descriptor.name;
}

function FormulaUniformSlider({
  descriptor,
  value,
  onChange,
  t,
}: FormulaUniformControlProps) {
  const resolvedValue = typeof value === 'number' ? value : Number(descriptor.default);
  const min = descriptor.min ?? 0;
  const max = descriptor.max ?? 1;
  const step = descriptor.step ?? 0.01;
  const isInteger = descriptor.type === 'int';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <label className="text-sm font-medium leading-none">
          {getFormulaUniformLabel(descriptor, t)}
        </label>
        <span className="text-sm font-mono text-muted-foreground">
          {isInteger ? Math.round(resolvedValue) : resolvedValue.toFixed(step >= 1 ? 0 : 2)}
        </span>
      </div>
      <Slider
        value={[resolvedValue]}
        onValueChange={(next) => onChange(descriptor.name, isInteger ? Math.round(next[0]) : next[0])}
        min={min}
        max={max}
        step={step}
        className="w-full"
      />
    </div>
  );
}

function FormulaFnSlotSelect({
  descriptor,
  value,
  onChange,
  t,
}: FormulaUniformControlProps) {
  const resolvedValue = typeof value === 'number' ? String(Math.round(value)) : String(descriptor.default);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium leading-none">
        {getFormulaUniformLabel(descriptor, t)}
      </label>
      <Select
        value={resolvedValue}
        onValueChange={(next) => onChange(descriptor.name, parseInt(next, 10))}
      >
        <SelectTrigger className="h-9 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FN_SLOT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={String(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FormulaComplexInput({
  descriptor,
  value,
  onChange,
  t,
}: FormulaUniformControlProps) {
  const fallback = Array.isArray(descriptor.default) && descriptor.default.length >= 2
    ? [Number(descriptor.default[0] ?? 0), Number(descriptor.default[1] ?? 0)] as [number, number]
    : [0, 0] as [number, number];
  const resolvedValue = Array.isArray(value) && value.length >= 2
    ? [Number(value[0] ?? 0), Number(value[1] ?? 0)] as [number, number]
    : typeof value === 'number'
      ? [value, 0] as [number, number]
      : fallback;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium leading-none">
        {getFormulaUniformLabel(descriptor, t)}
      </label>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${descriptor.name}-re`} className="text-xs text-muted-foreground">
            {t('controls.complexReal')}
          </Label>
          <Input
            id={`${descriptor.name}-re`}
            type="number"
            step="0.01"
            value={resolvedValue[0]}
            onChange={(event) => {
              const next = parseFloat(event.target.value);
              if (!Number.isNaN(next)) {
                onChange(descriptor.name, [next, resolvedValue[1]]);
              }
            }}
            className="h-8 font-mono text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${descriptor.name}-im`} className="text-xs text-muted-foreground">
            {t('controls.complexImaginary')}
          </Label>
          <Input
            id={`${descriptor.name}-im`}
            type="number"
            step="0.01"
            value={resolvedValue[1]}
            onChange={(event) => {
              const next = parseFloat(event.target.value);
              if (!Number.isNaN(next)) {
                onChange(descriptor.name, [resolvedValue[0], next]);
              }
            }}
            className="h-8 font-mono text-sm"
          />
        </div>
      </div>
    </div>
  );
}
