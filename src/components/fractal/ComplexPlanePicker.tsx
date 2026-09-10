'use client';

import { useCallback, useId, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

export interface ComplexPlaneAxis {
  min: number;
  max: number;
}

interface ComplexPlanePickerProps {
  value: [number, number];
  onChange: (value: [number, number]) => void;
  realAxis: ComplexPlaneAxis;
  imaginaryAxis: ComplexPlaneAxis;
  realViewport?: ComplexPlaneAxis;
  imaginaryViewport?: ComplexPlaneAxis;
  pointerStep?: number;
  keyboardStep: number;
  constrainKeyboardToAxes?: boolean;
  displayPrecision?: number;
  realLabel: string;
  imaginaryLabel: string;
  ariaLabel: string;
  resetLabel?: string;
  magnitudeLabel?: string;
  showUnitCircles?: boolean;
  size?: number;
  className?: string;
}

function clamp(value: number, axis: ComplexPlaneAxis): number {
  return Math.max(axis.min, Math.min(axis.max, value));
}

function normalizedNumber(value: number): number {
  const normalized = Number(value.toFixed(12));
  return Object.is(normalized, -0) ? 0 : normalized;
}

function snap(value: number, axis: ComplexPlaneAxis, step?: number): number {
  const bounded = clamp(value, axis);
  if (!step) return normalizedNumber(bounded);
  const snapped = axis.min + Math.round((bounded - axis.min) / step) * step;
  return normalizedNumber(clamp(snapped, axis));
}

function axisToPixel(value: number, axis: ComplexPlaneAxis, size: number, invert = false): number {
  const ratio = (clamp(value, axis) - axis.min) / (axis.max - axis.min);
  return (invert ? 1 - ratio : ratio) * size;
}

function pixelToAxis(pixel: number, size: number, axis: ComplexPlaneAxis, invert = false): number {
  const ratio = invert ? 1 - pixel / size : pixel / size;
  return axis.min + ratio * (axis.max - axis.min);
}

export function ComplexPlanePicker({
  value,
  onChange,
  realAxis,
  imaginaryAxis,
  realViewport = realAxis,
  imaginaryViewport = imaginaryAxis,
  pointerStep,
  keyboardStep,
  constrainKeyboardToAxes = true,
  displayPrecision = 3,
  realLabel,
  imaginaryLabel,
  ariaLabel,
  resetLabel,
  magnitudeLabel,
  showUnitCircles = false,
  size = 200,
  className,
}: ComplexPlanePickerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverPos, setHoverPos] = useState<[number, number] | null>(null);

  const emitChange = useCallback((next: [number, number]) => {
    if (Object.is(next[0], value[0]) && Object.is(next[1], value[1])) return;
    onChange(next);
  }, [onChange, value]);

  const pointerToValue = useCallback((clientX: number, clientY: number): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const real = pixelToAxis(clientX - rect.left, rect.width, realViewport);
    const imaginary = pixelToAxis(clientY - rect.top, rect.height, imaginaryViewport, true);
    return [
      snap(real, realAxis, pointerStep),
      snap(imaginary, imaginaryAxis, pointerStep),
    ];
  }, [imaginaryAxis, imaginaryViewport, pointerStep, realAxis, realViewport]);

  const handlePointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const next = pointerToValue(event.clientX, event.clientY);
    if (!next) return;
    setHoverPos(next);
    if (isDragging) emitChange(next);
  }, [emitChange, isDragging, pointerToValue]);

  const handlePointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    event.preventDefault();
    event.currentTarget.parentElement?.focus({ preventScroll: true });
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const next = pointerToValue(event.clientX, event.clientY);
    if (next) emitChange(next);
  }, [emitChange, pointerToValue]);

  const finishPointer = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const multiplier = event.shiftKey ? 10 : 1;
    const step = keyboardStep * multiplier;
    const keyboardValue = (next: number, axis: ComplexPlaneAxis) =>
      constrainKeyboardToAxes ? snap(next, axis) : normalizedNumber(next);
    let next: [number, number] | null = null;

    if (event.key === 'ArrowLeft') {
      next = [keyboardValue(value[0] - step, realAxis), value[1]];
    } else if (event.key === 'ArrowRight') {
      next = [keyboardValue(value[0] + step, realAxis), value[1]];
    } else if (event.key === 'ArrowDown') {
      next = [value[0], keyboardValue(value[1] - step, imaginaryAxis)];
    } else if (event.key === 'ArrowUp') {
      next = [value[0], keyboardValue(value[1] + step, imaginaryAxis)];
    } else if (event.key === 'Home') {
      next = constrainKeyboardToAxes ? [clamp(0, realAxis), clamp(0, imaginaryAxis)] : [0, 0];
    }

    if (!next || !next.every(Number.isFinite)) return;
    event.preventDefault();
    emitChange(next);
  }, [constrainKeyboardToAxes, emitChange, imaginaryAxis, keyboardStep, realAxis, value]);

  const center = size / 2;
  const dotX = axisToPixel(value[0], realViewport, size);
  const dotY = axisToPixel(value[1], imaginaryViewport, size, true);
  const zeroX = realViewport.min <= 0 && realViewport.max >= 0
    ? axisToPixel(0, realViewport, size)
    : null;
  const zeroY = imaginaryViewport.min <= 0 && imaginaryViewport.max >= 0
    ? axisToPixel(0, imaginaryViewport, size, true)
    : null;
  const unitRadius = size / (realViewport.max - realViewport.min);
  const formattedReal = value[0].toFixed(displayPrecision);
  const formattedImaginary = value[1].toFixed(displayPrecision);
  const valueDescriptionId = useId();

  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-describedby={valueDescriptionId}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        focusable="false"
        className={cn(
          'touch-none cursor-crosshair select-none rounded-lg border bg-muted/30',
          isDragging && 'cursor-grabbing',
        )}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onPointerLeave={() => setHoverPos(null)}
      >
        <rect x={0} y={0} width={size} height={size} fill="transparent" />

        <g className="stroke-muted-foreground/15" strokeWidth={1}>
          {[0.25, 0.5, 0.75].map((ratio) => (
            <g key={ratio}>
              <line x1={size * ratio} y1={0} x2={size * ratio} y2={size} />
              <line x1={0} y1={size * ratio} x2={size} y2={size * ratio} />
            </g>
          ))}
        </g>

        {zeroX !== null && (
          <line x1={zeroX} y1={0} x2={zeroX} y2={size} className="stroke-muted-foreground/35" />
        )}
        {zeroY !== null && (
          <line x1={0} y1={zeroY} x2={size} y2={zeroY} className="stroke-muted-foreground/35" />
        )}

        {showUnitCircles && zeroX !== null && zeroY !== null && (
          <g className="fill-none">
            <circle
              cx={zeroX}
              cy={zeroY}
              r={unitRadius}
              className="stroke-primary/30"
              strokeWidth={2}
              strokeDasharray="4 4"
            />
            <circle
              cx={zeroX}
              cy={zeroY}
              r={unitRadius * 2}
              className="stroke-muted-foreground/10"
              strokeWidth={1}
            />
          </g>
        )}

        <g className="fill-muted-foreground text-[10px]" textAnchor="middle">
          <text x={center} y={12}>{imaginaryLabel}</text>
          <text x={size - 10} y={center + 4}>{realLabel}</text>
        </g>

        {hoverPos && !isDragging && (
          <circle
            cx={axisToPixel(hoverPos[0], realViewport, size)}
            cy={axisToPixel(hoverPos[1], imaginaryViewport, size, true)}
            r={4}
            className="fill-muted-foreground opacity-50"
          />
        )}

        <g>
          <line
            x1={dotX}
            y1={0}
            x2={dotX}
            y2={size}
            className="stroke-primary/30"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
          <line
            x1={0}
            y1={dotY}
            x2={size}
            y2={dotY}
            className="stroke-primary/30"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
          <circle cx={dotX} cy={dotY} r={6} className="fill-primary" />
          <circle cx={dotX} cy={dotY} r={10} className="fill-none stroke-primary" strokeWidth={2} />
        </g>
      </svg>

      <span id={valueDescriptionId} className="sr-only">
        {realLabel} {formattedReal}, {imaginaryLabel} {formattedImaginary}
      </span>

      <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
        <span>{realLabel}: {formattedReal}</span>
        <span>{imaginaryLabel}: {formattedImaginary}</span>
        {magnitudeLabel && (
          <span className="opacity-60">
            {magnitudeLabel}={Math.sqrt(value[0] ** 2 + value[1] ** 2).toFixed(2)}
          </span>
        )}
        {resetLabel && (
          <button
            type="button"
            aria-label={resetLabel}
            title={resetLabel}
            onClick={() => emitChange(constrainKeyboardToAxes ? [clamp(0, realAxis), clamp(0, imaginaryAxis)] : [0, 0])}
            className="rounded border px-1.5 py-0.5 font-sans hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            0
          </button>
        )}
      </div>
    </div>
  );
}
