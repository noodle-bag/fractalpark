'use client';

import { useTranslations } from 'next-intl';
import { pluginRegistry } from '@/engine/plugins/registry';
import type { TransformPlugin } from '@/engine/plugins/types';
import { cn } from '@/lib/utils';
import { 
  CircleOff, 
  Sparkles, 
  Scale, 
  FlipHorizontal, 
  Waves, 
  Globe,
  Move
} from 'lucide-react';

interface TransformSelectorProps {
  currentTransform: string;
  onTransformChange: (transform: string) => void;
}

// Map transform IDs to icons
const TRANSFORM_ICONS: Record<string, React.ReactNode> = {
  none: <CircleOff className="h-4 w-4" />,
  kaleidoscope: <Sparkles className="h-4 w-4" />,
  mobius: <Scale className="h-4 w-4" />,
  inversion: <FlipHorizontal className="h-4 w-4" />,
  polar: <Move className="h-4 w-4" />,
  sinusoidal: <Waves className="h-4 w-4" />,
  spherical: <Globe className="h-4 w-4" />,
};

export function TransformSelector({ currentTransform, onTransformChange }: TransformSelectorProps) {
  const t = useTranslations('explore');
  const transforms = pluginRegistry.listTransforms();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">
          {t('controls.transform.label')}
        </label>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {transforms.map((transform) => (
          <TransformButton
            key={transform.id}
            transform={transform}
            isActive={transform.id === currentTransform}
            onClick={() => onTransformChange(transform.id)}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

interface TransformButtonProps {
  transform: TransformPlugin;
  isActive: boolean;
  onClick: () => void;
  t: (key: string) => string;
}

function TransformButton({ transform, isActive, onClick, t }: TransformButtonProps) {
  const icon = TRANSFORM_ICONS[transform.id] ?? <Move className="h-4 w-4" />;

  return (
    <button
      onClick={onClick}
      title={t(`controls.transform.${transform.id}`)}
      className={cn(
        'flex flex-col items-center gap-1 p-2 rounded-md border transition-all duration-150',
        'hover:bg-accent hover:border-accent-foreground/20',
        isActive && 'bg-primary/10 border-primary/50 ring-1 ring-primary/30'
      )}
    >
      <span className={cn('text-muted-foreground', isActive && 'text-primary')}>
        {icon}
      </span>
      <span className="text-[10px] leading-tight text-center line-clamp-1">
        {t(`controls.transform.${transform.id}`)}
      </span>
    </button>
  );
}
