'use client';

import { useTranslations } from 'next-intl';
import { pluginRegistry } from '@/engine/plugins/registry';
import type { PluginUniformDescriptor } from '@/engine/plugins/types';
import { Slider } from '@/components/ui/slider';
import { TransformSelector } from './TransformSelector';
import { TransformPointPicker } from './TransformPointPicker';
import type { PluginParamRecord, PluginParamValue, ViewBounds } from '@/engine/types';

interface TransformPanelProps {
  transformId?: string;
  bounds: ViewBounds;
  pluginParams?: PluginParamRecord;
  onTransformChange: (transform: string) => void;
  onRotationChange: (rotation: number) => void;
  onTransformParamChange: (name: string, value: number) => void;
  onTransformParamsChange?: (params: PluginParamRecord) => void;
}

export function TransformPanel({
  transformId,
  bounds,
  pluginParams,
  onTransformChange,
  onRotationChange,
  onTransformParamChange,
  onTransformParamsChange,
}: TransformPanelProps) {
  const t = useTranslations();
  const transformPlugin = pluginRegistry.getTransform(transformId ?? 'none');
  const allTransformUniforms = (transformPlugin?.uniforms ?? []).filter(
    (descriptor) => descriptor.type === 'float' || descriptor.type === 'int'
  );

  // Group uniforms by group field
  const centerGroup = allTransformUniforms.filter((u) => u.group === 'center');
  const otherUniforms = allTransformUniforms.filter((u) => u.group !== 'center');

  // Check if center group has exactly X and Y parameters
  const hasCenterPicker =
    centerGroup.length === 2 &&
    centerGroup.some((u) => u.name.toLowerCase().endsWith('x')) &&
    centerGroup.some((u) => u.name.toLowerCase().endsWith('y'));

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
        <TransformSelector
          currentTransform={transformId ?? 'none'}
          onTransformChange={onTransformChange}
        />
      </div>

      <div className="space-y-4 rounded-lg border p-3 bg-muted/30">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium leading-none">
            {t('explore.controls.rotation.label')}
          </label>
          <span className="text-sm font-mono text-muted-foreground">
            {Math.round(((bounds.rotation ?? 0) * 180) / Math.PI)}°
          </span>
        </div>
        <Slider
          value={[bounds.rotation ?? 0]}
          onValueChange={(v) => onRotationChange(v[0])}
          min={-Math.PI}
          max={Math.PI}
          step={0.01}
          className="w-full"
        />
      </div>

      {transformId && transformId !== 'none' && (
        <div className="space-y-4 rounded-lg border p-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium leading-none">
              {t('explore.controls.transformParameters')}
            </label>
          </div>

          {allTransformUniforms.length > 0 ? (
            <div className="space-y-4">
              {/* 2D Center Picker */}
              {hasCenterPicker && (
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">
                    {t('explore.controls.transformCenter')}
                  </label>
                  <TransformCenterPicker
                    centerGroup={centerGroup}
                    pluginParams={pluginParams}
                    onChange={onTransformParamChange}
                    onBatchChange={onTransformParamsChange}
                    t={t}
                  />
                </div>
              )}

              {/* Other sliders */}
              {otherUniforms.map((descriptor) => (
                <TransformUniformSlider
                  key={descriptor.name}
                  descriptor={descriptor}
                  value={pluginParams?.[descriptor.name]}
                  onChange={onTransformParamChange}
                  t={t}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('explore.controls.transformNoParameters')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface TransformUniformSliderProps {
  descriptor: PluginUniformDescriptor;
  value?: PluginParamValue;
  onChange: (name: string, value: number) => void;
  t: ReturnType<typeof useTranslations>;
}

function TransformUniformSlider({
  descriptor,
  value,
  onChange,
  t,
}: TransformUniformSliderProps) {
  const resolvedValue = typeof value === 'number' ? value : Number(descriptor.default);
  const min = descriptor.min ?? 0;
  const max = descriptor.max ?? 1;
  const step = descriptor.step ?? 0.01;
  const isInteger = descriptor.type === 'int';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <label className="text-sm font-medium leading-none">
          {descriptor.label ? t(descriptor.label) : descriptor.name}
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

interface TransformCenterPickerProps {
  centerGroup: PluginUniformDescriptor[];
  pluginParams?: PluginParamRecord;
  onChange: (name: string, value: number) => void;
  onBatchChange?: (params: PluginParamRecord) => void;
  t: ReturnType<typeof useTranslations>;
}

function TransformCenterPicker({
  centerGroup,
  pluginParams,
  onChange,
  onBatchChange,
  t,
}: TransformCenterPickerProps) {
  const xDescriptor = centerGroup.find((u) => u.name.toLowerCase().endsWith('x'))!;
  const yDescriptor = centerGroup.find((u) => u.name.toLowerCase().endsWith('y'))!;
  const xCurrentValue = pluginParams?.[xDescriptor.name];
  const yCurrentValue = pluginParams?.[yDescriptor.name];

  const xValue = typeof xCurrentValue === 'number'
    ? xCurrentValue
    : Number(xDescriptor.default);
  const yValue = typeof yCurrentValue === 'number'
    ? yCurrentValue
    : Number(yDescriptor.default);

  return (
    <TransformPointPicker
      valueX={xValue}
      valueY={yValue}
      onChange={(x, y) => {
        // Use batch update if available, otherwise fall back to sequential updates
        if (onBatchChange) {
          onBatchChange({
            [xDescriptor.name]: x,
            [yDescriptor.name]: y,
          });
        } else {
          onChange(xDescriptor.name, x);
          onChange(yDescriptor.name, y);
        }
      }}
      minX={xDescriptor.min ?? -2}
      maxX={xDescriptor.max ?? 2}
      minY={yDescriptor.min ?? -2}
      maxY={yDescriptor.max ?? 2}
      labelX={xDescriptor.label ? t(xDescriptor.label) : 'X'}
      labelY={yDescriptor.label ? t(yDescriptor.label) : 'Y'}
      size={200}
    />
  );
}
