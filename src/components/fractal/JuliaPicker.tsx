'use client';

import { ComplexPlanePicker } from './ComplexPlanePicker';

interface JuliaPickerProps {
  value: [number, number];
  onChange: (c: [number, number]) => void;
  ariaLabel?: string;
  realLabel?: string;
  imaginaryLabel?: string;
  size?: number;
  className?: string;
}

const JULIA_INTERACTION_AXIS = { min: -2, max: 2 } as const;
const JULIA_VIEWPORT_AXIS = { min: -1.5, max: 1.5 } as const;

export function JuliaPicker({
  value,
  onChange,
  ariaLabel = 'Julia c',
  realLabel = 'Re',
  imaginaryLabel = 'Im',
  size = 200,
  className,
}: JuliaPickerProps) {
  return (
    <ComplexPlanePicker
      value={value}
      onChange={onChange}
      realAxis={JULIA_INTERACTION_AXIS}
      imaginaryAxis={JULIA_INTERACTION_AXIS}
      realViewport={JULIA_VIEWPORT_AXIS}
      imaginaryViewport={JULIA_VIEWPORT_AXIS}
      keyboardStep={0.01}
      displayPrecision={3}
      realLabel={realLabel}
      imaginaryLabel={imaginaryLabel}
      ariaLabel={ariaLabel}
      magnitudeLabel="|c|"
      showUnitCircles
      size={size}
      className={className}
    />
  );
}
