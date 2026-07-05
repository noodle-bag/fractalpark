'use client';

import { useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface JuliaPickerProps {
  value: [number, number]; // [Re, Im]
  onChange: (c: [number, number]) => void;
  size?: number;
  className?: string;
}

export function JuliaPicker({
  value,
  onChange,
  size = 200,
  className,
}: JuliaPickerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverPos, setHoverPos] = useState<[number, number] | null>(null);

  // Convert screen coordinates to unit circle coordinates [-1, 1]
  const screenToUnit = useCallback(
    (clientX: number, clientY: number): [number, number] | null => {
      if (!svgRef.current) return null;

      const rect = svgRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Map to [-1, 1] range
      // X: left (-1) to right (+1)
      // Y: bottom (-1) to top (+1) - flipped because SVG Y increases downward
      const x = ((clientX - centerX) / (rect.width / 2)) * 1.5;
      const y = -((clientY - centerY) / (rect.height / 2)) * 1.5;

      return [x, y];
    },
    []
  );

  // Handle mouse/touch events
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const pos = screenToUnit(e.clientX, e.clientY);
      if (!pos) return;

      setHoverPos(pos);

      if (isDragging) {
        // Clamp to reasonable range [-2, 2] for Julia sets
        const clampedX = Math.max(-2, Math.min(2, pos[0]));
        const clampedY = Math.max(-2, Math.min(2, pos[1]));
        onChange([clampedX, clampedY]);
      }
    },
    [isDragging, onChange, screenToUnit]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      e.preventDefault();
      setIsDragging(true);
      (e.target as Element).setPointerCapture(e.pointerId);

      const pos = screenToUnit(e.clientX, e.clientY);
      if (pos) {
        const clampedX = Math.max(-2, Math.min(2, pos[0]));
        const clampedY = Math.max(-2, Math.min(2, pos[1]));
        onChange([clampedX, clampedY]);
      }
    },
    [onChange, screenToUnit]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging(false);
    (e.target as Element).releasePointerCapture(e.pointerId);
  }, []);

  const handlePointerLeave = useCallback(() => {
    setHoverPos(null);
  }, []);

  // Convert value to SVG coordinates
  const dotX = (value[0] / 1.5) * (size / 2) + size / 2;
  const dotY = -(value[1] / 1.5) * (size / 2) + size / 2;

  // Grid lines
  const gridSize = size;
  const center = size / 2;
  const radius = (size / 2) * (1 / 1.5); // Unit circle radius

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
          {/* Vertical lines */}
          <line x1={center} y1={0} x2={center} y2={gridSize} />
          <line x1={center - radius} y1={0} x2={center - radius} y2={gridSize} />
          <line x1={center + radius} y1={0} x2={center + radius} y2={gridSize} />

          {/* Horizontal lines */}
          <line x1={0} y1={center} x2={gridSize} y2={center} />
          <line x1={0} y1={center - radius} x2={gridSize} y2={center - radius} />
          <line x1={0} y1={center + radius} x2={gridSize} y2={center + radius} />
        </g>

        {/* Unit circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          className="fill-none stroke-primary/30"
          strokeWidth={2}
          strokeDasharray="4 4"
        />

        {/* Outer boundary circle (|c|=2) */}
        <circle
          cx={center}
          cy={center}
          r={radius * 2}
          className="fill-none stroke-muted-foreground/10"
          strokeWidth={1}
        />

        {/* Axis labels */}
        <g className="fill-muted-foreground text-[10px]" textAnchor="middle">
          <text x={center} y={12}>
            Im
          </text>
          <text x={size - 8} y={center + 4}>
            Re
          </text>
          <text x={center} y={center + 12} className="opacity-50">
            0
          </text>
          <text x={center + radius} y={center + 12} className="opacity-50">
            1
          </text>
          <text x={center - radius} y={center + 12} className="opacity-50">
            -1
          </text>
        </g>

        {/* Hover indicator */}
        {hoverPos && !isDragging && (
          <g className="opacity-50">
            <circle
              cx={(hoverPos[0] / 1.5) * (size / 2) + center}
              cy={-(hoverPos[1] / 1.5) * (size / 2) + center}
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
        <span>Re: {value[0].toFixed(3)}</span>
        <span>Im: {value[1].toFixed(3)}</span>
        <span className="opacity-50">|c|={Math.sqrt(value[0] ** 2 + value[1] ** 2).toFixed(2)}</span>
      </div>
    </div>
  );
}
