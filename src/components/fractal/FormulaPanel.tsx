'use client';

import { useEffect, useRef, useState } from 'react';
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
import { FormulaNumberDraftInput } from './FormulaNumberDraftInput';
import { JuliaPicker } from './JuliaPicker';
import type { FormulaSelectionRequest } from '@/engine/frm/authoring';
import type {
  PublishedFormulaDescriptorV1,
  PublishedFormulaParameterDescriptorV1,
} from '@/engine/formulas/v1';
import type { PluginParamRecord, PluginParamValue, ViewBounds } from '@/engine/types';
import type {
  PublishedFormulaBeforeApply,
  PublishedFormulaSelectionResult,
} from '@/lib/published-formula-selection';

interface FormulaPanelProps {
  isJulia: boolean;
  juliaC: [number, number];
  onJuliaModeChange: (enabled: boolean) => void;
  onJuliaCChange: (value: [number, number]) => void;
  currentFormula: string;
  currentBounds: ViewBounds;
  pluginParams?: PluginParamRecord;
  publishedDescriptor?: PublishedFormulaDescriptorV1 | null;
  onFormulaChange: (formula: string) => void;
  onPublishedFormulaSelect?: (
    formulaId: string,
    beforeApply?: PublishedFormulaBeforeApply,
  ) => Promise<PublishedFormulaSelectionResult>;
  onPublishedFormulaCancel?: () => void;
  onFeelingLucky?: () => Promise<PublishedFormulaSelectionResult>;
  onPublishedProfileReset?: () => Promise<PublishedFormulaSelectionResult>;
  canResetPublishedProfile?: boolean;
  canUndoPublishedFormulaSelection?: boolean;
  onUndoPublishedFormulaSelection?: () => void;
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
  publishedDescriptor,
  onFormulaChange,
  onPublishedFormulaSelect = async () => ({ ok: false, code: 'formula-not-published' }),
  onPublishedFormulaCancel,
  onFeelingLucky,
  onPublishedProfileReset,
  canResetPublishedProfile = false,
  canUndoPublishedFormulaSelection = false,
  onUndoPublishedFormulaSelection,
  onFormulaParamChange,
  onCustomFormulaSelect,
}: FormulaPanelProps) {
  const t = useTranslations('explore');
  const formulaPlugin = pluginRegistry.getFormula(currentFormula);
  const editableUniforms = (formulaPlugin?.uniforms ?? []).filter(
    (descriptor) => descriptor.type === 'float' || descriptor.type === 'int' || descriptor.type === 'vec2'
  );
  const activePublishedDescriptor = publishedDescriptor?.formulaId === currentFormula
    ? publishedDescriptor
    : null;

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
        <div className="flex items-center justify-between">
          <Label htmlFor="julia-mode" className="text-sm font-medium leading-none">
            {t('controls.mode.label')}
          </Label>
          <div className="flex items-center gap-2">
            <span className="rainbow-text text-xs font-semibold">
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
        onPublishedFormulaSelect={onPublishedFormulaSelect}
        onPublishedFormulaCancel={onPublishedFormulaCancel}
        onFeelingLucky={onFeelingLucky}
        onPublishedProfileReset={onPublishedProfileReset}
        canResetPublishedProfile={canResetPublishedProfile}
        canUndoPublishedFormulaSelection={canUndoPublishedFormulaSelection}
        onUndoPublishedFormulaSelection={onUndoPublishedFormulaSelection}
        onCustomFormulaSelect={onCustomFormulaSelect}
      />

      <div className="space-y-4 rounded-lg border p-3 bg-muted/30">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium leading-none">
            {t('controls.formulaParameters')}
          </label>
        </div>

        {activePublishedDescriptor ? (
          activePublishedDescriptor.parameters.length > 0 ? (
            <div className="space-y-4">
              {activePublishedDescriptor.parameters.map((parameter) => (
                <PublishedFormulaParameterControl
                  key={parameter.uniformName}
                  parameter={parameter}
                  value={pluginParams?.[parameter.uniformName]}
                  onChange={onFormulaParamChange}
                  t={t}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('controls.formulaNoParameters')}
            </p>
          )
        ) : editableUniforms.length > 0 ? (
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

interface FormulaComplexDraftInputsProps {
  value: [number, number];
  slotName: string;
  realId?: string;
  imaginaryId?: string;
  min?: number;
  max?: number;
  showCoordinateLabels?: boolean;
  onCommit: (value: [number, number]) => void;
  t: ReturnType<typeof useTranslations>;
}

function formulaComplexValuesEqual(
  left: readonly [number, number],
  right: readonly [number, number],
): boolean {
  return Object.is(left[0], right[0]) && Object.is(left[1], right[1]);
}

interface FormulaComplexDraftState {
  externalValue: [number, number];
  acknowledgedValue: [number, number];
  pendingValues: Array<[number, number]>;
  displayValue: [number, number];
}

function reconcileFormulaComplexDraftState(
  state: FormulaComplexDraftState,
  incoming: [number, number],
): FormulaComplexDraftState {
  const pendingIndex = state.pendingValues.findIndex((pending) =>
    formulaComplexValuesEqual(pending, incoming),
  );

  if (pendingIndex >= 0) {
    const pendingValues = state.pendingValues.slice(pendingIndex + 1);
    return {
      externalValue: incoming,
      acknowledgedValue: incoming,
      pendingValues,
      displayValue: pendingValues.at(-1) ?? incoming,
    };
  }

  if (formulaComplexValuesEqual(state.acknowledgedValue, incoming)) {
    return { ...state, externalValue: incoming };
  }

  return {
    externalValue: incoming,
    acknowledgedValue: incoming,
    pendingValues: [],
    displayValue: incoming,
  };
}

function FormulaComplexDraftInputs({
  value,
  slotName,
  realId,
  imaginaryId,
  min,
  max,
  showCoordinateLabels = false,
  onCommit,
  t,
}: FormulaComplexDraftInputsProps) {
  const externalReal = value[0];
  const externalImaginary = value[1];
  const incoming: [number, number] = [externalReal, externalImaginary];
  const [draftState, setDraftState] = useState<FormulaComplexDraftState>(() => ({
    externalValue: incoming,
    acknowledgedValue: incoming,
    pendingValues: [],
    displayValue: incoming,
  }));
  const latestValue = useRef<[number, number]>(draftState.displayValue);

  if (!formulaComplexValuesEqual(draftState.externalValue, incoming)) {
    setDraftState(reconcileFormulaComplexDraftState(draftState, incoming));
  }

  useEffect(() => {
    latestValue.current = draftState.displayValue;
  }, [draftState.displayValue]);

  const commitCoordinate = (index: 0 | 1, next: number) => {
    const current = latestValue.current;
    const committed: [number, number] =
      index === 0 ? [next, current[1]] : [current[0], next];
    latestValue.current = committed;
    setDraftState((currentState) => ({
      ...currentState,
      pendingValues: [...currentState.pendingValues, committed],
      displayValue: committed,
    }));
    onCommit(committed);
  };

  const realInput = (
    <FormulaNumberDraftInput
      id={realId}
      ariaLabel={`${slotName} ${t('controls.complexReal')}`}
      value={draftState.displayValue[0]}
      min={min}
      max={max}
      onCommit={(next) => commitCoordinate(0, next)}
      invalidMessage={t('controls.invalidNumber')}
      increaseLabel={t('controls.increase')}
      decreaseLabel={t('controls.decrease')}
      className="h-8"
    />
  );
  const imaginaryInput = (
    <FormulaNumberDraftInput
      id={imaginaryId}
      ariaLabel={`${slotName} ${t('controls.complexImaginary')}`}
      value={draftState.displayValue[1]}
      min={min}
      max={max}
      onCommit={(next) => commitCoordinate(1, next)}
      invalidMessage={t('controls.invalidNumber')}
      increaseLabel={t('controls.increase')}
      decreaseLabel={t('controls.decrease')}
      className="h-8"
    />
  );

  if (!showCoordinateLabels) return <>{realInput}{imaginaryInput}</>;

  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={realId} className="text-xs text-muted-foreground">
          {t('controls.complexReal')}
        </Label>
        {realInput}
      </div>
      <div className="space-y-1">
        <Label htmlFor={imaginaryId} className="text-xs text-muted-foreground">
          {t('controls.complexImaginary')}
        </Label>
        {imaginaryInput}
      </div>
    </>
  );
}

interface PublishedFormulaParameterControlProps {
  parameter: PublishedFormulaParameterDescriptorV1;
  value?: PluginParamValue;
  onChange: (name: string, value: PluginParamValue) => void;
  t: ReturnType<typeof useTranslations>;
}

function PublishedFormulaParameterControl({
  parameter,
  value,
  onChange,
  t,
}: PublishedFormulaParameterControlProps) {
  if (parameter.type === 'function') {
    const options = parameter.options ?? [];
    const fallbackIndex = Math.max(0, options.indexOf(String(parameter.default)));
    const selectedIndex = typeof value === 'number' ? Math.round(value) : fallbackIndex;
    return (
      <div className="space-y-2">
        <Label htmlFor={`published-${parameter.uniformName}`} className="text-sm font-medium leading-none">
          {parameter.slotName}
        </Label>
        <Select
          value={String(selectedIndex)}
          onValueChange={(next) => onChange(parameter.uniformName, parseInt(next, 10))}
        >
          <SelectTrigger
            id={`published-${parameter.uniformName}`}
            aria-label={parameter.slotName}
            className="h-9 text-sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option, index) => (
              <SelectItem key={option} value={String(index)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (parameter.type === 'complex') {
    const fallback = Array.isArray(parameter.default)
      ? [Number(parameter.default[0] ?? 0), Number(parameter.default[1] ?? 0)] as [number, number]
      : [0, 0] as [number, number];
    const resolved = Array.isArray(value)
      ? [Number(value[0] ?? 0), Number(value[1] ?? 0)] as [number, number]
      : fallback;
    return (
      <div className="space-y-2">
        <span className="text-sm font-medium leading-none">{parameter.slotName}</span>
        <div className="grid grid-cols-2 gap-2">
          <FormulaComplexDraftInputs
            value={resolved}
            slotName={parameter.slotName}
            realId={`published-${parameter.uniformName}-re`}
            imaginaryId={`published-${parameter.uniformName}-im`}
            min={parameter.hardDomain?.[0]}
            max={parameter.hardDomain?.[1]}
            onCommit={(next) => onChange(parameter.uniformName, next)}
            t={t}
          />
        </div>
      </div>
    );
  }

  const fallback = typeof parameter.default === 'number' ? parameter.default : 0;
  const resolved = Array.isArray(value)
    ? Number(value[0] ?? fallback)
    : typeof value === 'number'
      ? value
      : fallback;
  return (
    <div className="space-y-2">
      <Label htmlFor={`published-${parameter.uniformName}`} className="text-sm font-medium leading-none">
        {parameter.slotName}
      </Label>
      <FormulaNumberDraftInput
        id={`published-${parameter.uniformName}`}
        min={parameter.hardDomain?.[0]}
        max={parameter.hardDomain?.[1]}
        value={resolved}
        ariaLabel={parameter.slotName}
        onCommit={(next) => onChange(parameter.uniformName, [next, 0])}
        invalidMessage={t('controls.invalidNumber')}
        increaseLabel={t('controls.increase')}
        decreaseLabel={t('controls.decrease')}
        className="h-8"
      />
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
        <FormulaComplexDraftInputs
          value={resolvedValue}
          slotName={getFormulaUniformLabel(descriptor, t)}
          realId={`${descriptor.name}-re`}
          imaginaryId={`${descriptor.name}-im`}
          min={descriptor.min}
          max={descriptor.max}
          showCoordinateLabels
          onCommit={(next) => onChange(descriptor.name, next)}
          t={t}
        />
      </div>
    </div>
  );
}
