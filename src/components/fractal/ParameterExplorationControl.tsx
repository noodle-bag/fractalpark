'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ComplexPlanePicker } from './ComplexPlanePicker';
import { explorationWindow, fromPolar, type ExplorationWindow } from '@/lib/parameter-exploration';
import type { ParameterInteractionHint, ParameterInteractionKind } from '@/lib/published-parameter-interactions';

const buttonClass = 'rounded border px-2 py-1 text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const format = (value: number) => Number(value.toPrecision(5)).toString();

export function ParameterRangeControl({
  value, onChange, label, integer = false, domain, nonNegative = false,
}: {
  value: number;
  onChange: (next: number) => void;
  label: string;
  integer?: boolean;
  domain?: readonly [number, number];
  nonNegative?: boolean;
}) {
  const t = useTranslations('explore.controls.parameterInteraction');
  const id = useId();
  const [window, setWindow] = useState(() => explorationWindow(value, integer ? 8 : 2));
  const range = domain ? { min: domain[0], max: domain[1] } : window
    ? { min: nonNegative ? Math.max(0, window.min) : window.min, max: window.max }
    : null;
  if (!range || !Number.isFinite(value)) return null;
  const outside = value < range.min || value > range.max;
  const span = range.max - range.min;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex justify-between gap-2 text-xs">
        <span>{label}</span><span className="font-mono">{format(value)}</span>
      </label>
      {outside ? (
        <button type="button" className={buttonClass}
          onClick={() => setWindow(explorationWindow(value, span / 2))}>
          {t('showCurrent')}
        </button>
      ) : (
        <input id={id} type="range" aria-label={label} className="w-full accent-primary"
          min={range.min} max={range.max} step="any" value={value}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(integer ? Math.round(next) : next);
          }}
          onKeyDown={(event) => {
            const direction = ['ArrowRight', 'ArrowUp'].includes(event.key) ? 1
              : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 0;
            if (!direction) return;
            event.preventDefault();
            const step = integer ? 1 : span / 200;
            const next = value + direction * step * (event.shiftKey ? 10 : 1);
            onChange(Math.min(range.max, Math.max(range.min, integer ? Math.round(next) : next)));
          }} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
        <span>{format(range.min)} … {format(range.max)}</span>
        {!domain && <div className="flex gap-1">
          <button type="button" className={buttonClass} aria-label={`${label} ${t('narrow')}`}
            onClick={() => setWindow(explorationWindow(value, Math.max(integer ? 1 : 1e-9, span / 4)))}>{t('narrow')}</button>
          <button type="button" className={buttonClass} aria-label={`${label} ${t('widen')}`}
            onClick={() => setWindow(explorationWindow(value, span))}>{t('widen')}</button>
        </div>}
      </div>
    </div>
  );
}

export function ParameterExplorationControl({
  value, onChange, kind, hint, label, initiallyOpen = false, integer = false,
}: {
  value: [number, number];
  onChange: (next: [number, number]) => void;
  kind: ParameterInteractionKind;
  hint?: ParameterInteractionHint;
  label: string;
  initiallyOpen?: boolean;
  integer?: boolean;
}) {
  const t = useTranslations('explore.controls.parameterInteraction');
  const tc = useTranslations('explore.controls');
  const [real, setReal] = useState<ExplorationWindow | null>(() => explorationWindow(
    Math.abs(value[0]) <= 2 ? 0 : value[0],
  ));
  const [imaginary, setImaginary] = useState<ExplorationWindow | null>(() => explorationWindow(
    Math.abs(value[1]) <= 2 ? 0 : value[1],
  ));
  const [angleAtZero, setAngleAtZero] = useState(0);
  const magnitude = Math.hypot(...value);
  const angle = magnitude === 0 ? angleAtZero : Math.atan2(value[1], value[0]) * 180 / Math.PI;
  const emit = (next: [number, number] | null) => {
    if (next && next.every(Number.isFinite) && (next[0] !== value[0] || next[1] !== value[1])) onChange(next);
  };
  const resize = (factor: number) => {
    const halfSpan = Math.max(1e-9, ((real?.max ?? 2) - (real?.min ?? -2)) * factor / 2);
    setReal(explorationWindow(value[0], halfSpan));
    setImaginary(explorationWindow(value[1], halfSpan));
  };
  const realLabel = hint === 'feedback' ? t('constant') : kind === 'times' ? t('firstTrigger') : tc('complexReal');
  const imaginaryLabel = hint === 'feedback' ? t('feedback') : kind === 'times' ? t('secondTrigger') : tc('complexImaginary');
  const scalar = kind === 'real';
  const content = (
    <div className="space-y-3 pt-2">
      {hint && <p className="text-xs text-muted-foreground">{t(`hints.${hint}`)}</p>}
      {scalar && <p className="text-xs text-muted-foreground">{t('realOnly')}</p>}
      {kind === 'plane' && real && imaginary && (
        <>
          <ComplexPlanePicker value={value} onChange={emit}
            realAxis={real} imaginaryAxis={imaginary}
            keyboardStep={(real.max - real.min) / 400}
            pointerStep={(real.max - real.min) / 400}
            constrainKeyboardToAxes={false}
            realLabel={tc('complexReal')} imaginaryLabel={tc('complexImaginary')}
            ariaLabel={`${label} ${tc('complexPlane')}`}
            resetLabel={`${label} ${tc('resetComplex')}`} size={160} />
          <div className="text-center font-mono text-xs text-muted-foreground">
            Re {format(real.min)} … {format(real.max)}<br />
            Im {format(imaginary.min)} … {format(imaginary.max)}
          </div>
          <div className="flex flex-wrap justify-center gap-1">
            <button type="button" className={buttonClass} onClick={() => resize(0.5)}>{t('narrow')}</button>
            <button type="button" className={buttonClass} onClick={() => resize(2)}>{t('widen')}</button>
            <button type="button" className={buttonClass} onClick={() => resize(1)}>{t('showCurrent')}</button>
          </div>
        </>
      )}
      {kind === 'polar' && (
        <>
          <ParameterRangeControl label={`${label} ${t('magnitude')}`} value={magnitude} nonNegative
            onChange={(next) => emit(fromPolar(Math.max(0, next), angle))} />
          <ParameterRangeControl label={`${label} ${t('angle')}`} value={angle} domain={[-180, 180]}
            onChange={(next) => {
              setAngleAtZero(next);
              if (magnitude !== 0) emit(fromPolar(magnitude, next));
            }} />
        </>
      )}
      {(scalar || kind === 'pair' || kind === 'times') && (
        <>
          <ParameterRangeControl label={`${label} ${realLabel}`} value={value[0]} integer={integer || kind === 'times'}
            onChange={(next) => emit([next, value[1]])} />
          {!scalar && <ParameterRangeControl label={`${label} ${imaginaryLabel}`} value={value[1]} integer={kind === 'times'}
            onChange={(next) => emit([value[0], next])} />}
        </>
      )}
      <p className="text-xs text-muted-foreground">{t('windowHint')}</p>
    </div>
  );
  return (
    <details open={initiallyOpen || undefined} className="rounded-md border p-2">
      <summary className="cursor-pointer text-xs font-medium">{t(kind)}</summary>
      {content}
    </details>
  );
}
