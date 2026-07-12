'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { RgbCurve, RgbCurvesConfig } from '@/engine/types';

type Channel = keyof RgbCurvesConfig;
interface Props { value: RgbCurvesConfig; onChange: (value: RgbCurvesConfig) => void; labels: Record<Channel, string> & { resetChannel: string; point: string }; }
const IDENTITY: RgbCurve = [0, 0.25, 0.5, 0.75, 1];
const COLORS: Record<Channel, string> = { red: '#ef4444', green: '#22c55e', blue: '#3b82f6' };

export function RgbCurveEditor({ value, onChange, labels }: Props) {
  const [channel, setChannel] = useState<Channel>('red');
  const svgRef = useRef<SVGSVGElement>(null);
  const curve = value[channel];
  const setPoint = (index: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect?.height) return;
    const next = [...curve] as RgbCurve;
    next[index] = Math.min(1, Math.max(0, 1 - (clientY - rect.top) / rect.height));
    onChange({ ...value, [channel]: next });
  };
  const points = curve.map((output, index) => `${index * 25},${100 - output * 100}`).join(' ');

  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-2">
      <div className="flex gap-1">{(['red', 'green', 'blue'] as const).map((item) => <Button key={item} type="button" size="sm" variant={channel === item ? 'default' : 'outline'} className="h-7 min-w-9 px-2" onClick={() => setChannel(item)}>{labels[item]}</Button>)}</div>
      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onChange({ ...value, [channel]: [...IDENTITY] as RgbCurve })}>{labels.resetChannel}</Button>
    </div>
    <svg ref={svgRef} viewBox="0 0 100 100" className="aspect-[5/3] w-full touch-none rounded-md border bg-background" role="img" aria-label={`${labels[channel]} curve`}>
      {[25, 50, 75].map((position) => <g key={position} className="text-border"><line x1={position} y1="0" x2={position} y2="100" stroke="currentColor" strokeWidth="0.5" /><line x1="0" y1={position} x2="100" y2={position} stroke="currentColor" strokeWidth="0.5" /></g>)}
      <line x1="0" y1="100" x2="100" y2="0" className="text-muted-foreground/40" stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 3" />
      <polyline points={points} fill="none" stroke={COLORS[channel]} strokeWidth="1.8" />
      {curve.map((output, index) => <circle key={index} cx={index * 25} cy={100 - output * 100} r="3.5" fill={COLORS[channel]} stroke="white" strokeWidth="1" tabIndex={0} role="slider" aria-label={`${labels[channel]} ${labels.point} ${index + 1}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(output * 100)} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setPoint(index, event.clientY); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setPoint(index, event.clientY); }} onKeyDown={(event) => { if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return; event.preventDefault(); const next = [...curve] as RgbCurve; next[index] = Math.min(1, Math.max(0, next[index] + (event.key === 'ArrowUp' ? 0.01 : -0.01))); onChange({ ...value, [channel]: next }); }} />)}
    </svg>
  </div>;
}
