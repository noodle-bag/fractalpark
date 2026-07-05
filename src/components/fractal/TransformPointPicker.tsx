'use client';

import { useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface TransformPointPickerProps {
  valueX: number;
  valueY: number;
  onChange: (x: number, y: number) => void;
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  labelX?: string;
  labelY?: string;
  size?: number;
  className?: string;
}

export function TransformPointPicker({
  valueX,
  valueY,
  onChange,
  minX = -2,
  maxX = 2,
  minY = -2,
  maxY = 2,
  labelX = 'X',
  labelY = 'Y',
  size = 200,
  className,
}: TransformPointPickerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverPos, setHoverPos] = useState<[number, number] | null>(null);

  // Convert screen coordinates to value range
  const screenToValue = useCallback(
    (clientX: number, clientY: number): [number, number] | null => {
      if (!svgRef.current) return null;

      const rect = svgRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Map to value range
      // X: left (minX) to right (maxX)
      // Y: bottom (minY) to top (maxY) - flipped because SVG Y increases downward
      const rangeX = maxX - minX;
      const rangeY = maxY - minY;
      const x = ((clientX - centerX) / (rect.width / 2)) * (rangeX / 2) + (minX + maxX) / 2;
      const y = -(((clientY - centerY) / (rect.height / 2)) * (rangeY / 2)) + (minY + maxY) / 2;

      return [x, y];
    },
    [minX, maxX, minY, maxY]
  );

  // Handle mouse/touch events
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const pos = screenToValue(e.clientX, e.clientY);
      if (!pos) return;

      setHoverPos(pos);

      if (isDragging) {
        const clampedX = Math.max(minX, Math.min(maxX, pos[0]));
        const clampedY = Math.max(minY, Math.min(maxY, pos[1]));
        onChange(clampedX, clampedY);
      }
    },
    [isDragging, onChange, screenToValue, minX, maxX, minY, maxY]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      e.preventDefault();
      setIsDragging(true);
      (e.target as Element).setPointerCapture(e.pointerId);

      const pos = screenToValue(e.clientX, e.clientY);
      if (pos) {
        const clampedX = Math.max(minX, Math.min(maxX, pos[0]));
        const clampedY = Math.max(minY, Math.min(maxY, pos[1]));
        onChange(clampedX, clampedY);
      }
    },
    [onChange, screenToValue, minX, maxX, minY, maxY]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging(false);
    (e.target as Element).releasePointerCapture(e.pointerId);
  }, []);

  const handlePointerLeave = useCallback(() => {
    setHoverPos(null);
  }, []);

  // Convert value to SVG coordinates
  const rangeX = maxX - minX;
  const rangeY = maxY - minY;
  const dotX = ((valueX - (minX + maxX) / 2) / (rangeX / 2)) * (size / 2) + size / 2;
  const dotY = -((valueY - (minY + maxY) / 2) / (rangeY / 2)) * (size / 2) + size / 2;

  // Grid lines
  const center = size / 2;
  const unit = size / Math.max(rangeX, rangeY);

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={cn(
          'cursor-crosshair select-none rounded-lg border bg-muted/30',
          isDragging ? 'cursor-grabbing' : 'cursor-crosshair'
        )}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        {/* Background */}
        <rect x={0} y={0} width={size} height={size} fill="transparent" />

        {/* Grid lines */}
        <g className="stroke-muted-foreground/20" strokeWidth={1}>
          {/* Center vertical and horizontal */}
          <line x1={center} y1={0} x2={center} y2={size} />
          <line x1={0} y1={center} x2={size} y2={center} />

          {/* ±1 grid lines */}
          {[-1, 1].map((val) => (
            <g key={val}>
              <line
                x1={center + val * unit}
                y1={0}
                x2={center + val * unit}
                y2={size}
                strokeDasharray="2 2"
                opacity={0.5}
              />
              <line
                x1={0}
                y1={center - val * unit}
                x2={size}
                y2={center - val * unit}
                strokeDasharray="2 2"
                opacity={0.5}
              />
            </g>
          ))}
        </g>

        {/* Unit circle reference */}
        <circle
          cx={center}
          cy={center}
          r={unit}
          className="fill-none stroke-primary/20"
          strokeWidth={1}
          strokeDasharray="4 4"
        />

        {/* Axis labels */}
        <g className="fill-muted-foreground text-[10px]" textAnchor="middle">
          <text x={center} y={12}>
            {labelY}
          </text>
          <text x={size - 12} y={center + 4}>
            {labelX}
          </text>
          <text x={center + 4} y={center + 12} className="opacity-50">
            0
          </text>
        </g>

        {/* Hover indicator */}
        {hoverPos && !isDragging && (
          <g className="opacity-50">
            <circle
              cx={((hoverPos[0] - (minX + maxX) / 2) / (rangeX / 2)) * (size / 2) + center}
              cy={-((hoverPos[1] - (minY + maxY) / 2) / (rangeY / 2)) * (size / 2) + center}
              r={4}
              className="fill-muted-foreground"
            />
          </g>
        )}

        {/* Current value indicator */}
        <g>
          {/* Crosshairs */}
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

          {/* Center dot */}
          <circle cx={dotX} cy={dotY} r={6} className="fill-primary" />
          <circle cx={dotX} cy={dotY} r={10} className="fill-none stroke-primary" strokeWidth={2} />
        </g>
      </svg>

      {/* Coordinate display */}
      <div className="flex gap-4 text-xs text-muted-foreground font-mono">
        <span>
          {labelX}: {valueX.toFixed(3)}
        </span>
        <span>
          {labelY}: {valueY.toFixed(3)}
        </span>
      </div>
    </div>
  );
}
