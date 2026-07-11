'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { PALETTES } from '@/engine/palettes';

interface ColorSchemeSelectorProps {
  value: number;
  onChange: (index: number) => void;
}

const categoryOrder = ['sequential', 'cyclic', 'diverging', 'artistic', 'legacy'] as const;

export function ColorSchemeSelector({ value, onChange }: ColorSchemeSelectorProps) {
  const t = useTranslations();

  return (
    <div className="space-y-3">
      {categoryOrder.map((category) => {
        const palettes = PALETTES.filter((palette) => palette.category === category);
        return (
          <div key={category} className="space-y-1.5">
            <div className="text-[10px] font-medium uppercase text-muted-foreground">
              {t(`explore.paletteCategories.${category}`)}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {palettes.map((palette) => (
                <button
                  key={palette.index}
                  type="button"
                  onClick={() => onChange(palette.index)}
                  className={cn(
                    'group flex min-w-0 flex-col items-center gap-1 focus:outline-none',
                    value === palette.index ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                  )}
                  aria-label={t(palette.key)}
                >
                  <span
                    className={cn(
                      'h-8 w-full rounded-md shadow-sm transition-all',
                      value === palette.index ? 'ring-2 ring-primary ring-offset-2' : 'group-hover:ring-1 group-hover:ring-primary/50'
                    )}
                    style={{ background: `linear-gradient(to right, ${palette.colors.join(', ')})` }}
                  />
                  <span className="w-full truncate text-center text-[10px] font-medium text-muted-foreground">
                    {t(palette.key)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
