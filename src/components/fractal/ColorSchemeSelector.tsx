'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface ColorSchemeSelectorProps {
  value: number;
  onChange: (index: number) => void;
}

const schemes = [
  { key: 'inferno', gradient: 'from-red-900 via-orange-500 to-yellow-300' },
  { key: 'ocean', gradient: 'from-blue-900 via-cyan-500 to-white' },
  { key: 'spectrum', gradient: 'from-red-500 via-green-500 to-blue-500' },
  { key: 'sakura', gradient: 'from-pink-300 via-white to-purple-200' },
  { key: 'moonlight', gradient: 'from-slate-900 via-blue-300 to-white' },
];

export function ColorSchemeSelector({ value, onChange }: ColorSchemeSelectorProps) {
  const t = useTranslations('explore.palettes');

  return (
    <div className="grid grid-cols-5 gap-2">
      {schemes.map((scheme, index) => (
        <button
          key={scheme.key}
          onClick={() => onChange(index)}
          className={cn(
            'group flex flex-col items-center gap-1 focus:outline-none',
            value === index ? 'opacity-100' : 'opacity-70 hover:opacity-100'
          )}
          aria-label={t(scheme.key)}
        >
          <div
            className={cn(
              'h-8 w-full rounded-md bg-gradient-to-r shadow-sm transition-all',
              scheme.gradient,
              value === index ? 'ring-2 ring-primary ring-offset-2' : 'group-hover:ring-1 group-hover:ring-primary/50'
            )}
          />
          <span className="text-[10px] font-medium text-muted-foreground">
            {t(scheme.key)}
          </span>
        </button>
      ))}
    </div>
  );
}
