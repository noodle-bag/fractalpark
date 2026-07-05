'use client';

import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BuiltinBadgeProps {
  className?: string;
}

/**
 * Badge indicating a builtin/featured preset
 */
export function BuiltinBadge({ className }: BuiltinBadgeProps) {
  const t = useTranslations('gallery');

  return (
    <div
      className={cn(
        'absolute top-1.5 left-1.5',
        'flex items-center gap-0.5',
        'px-1.5 py-0.5 rounded-full',
        'bg-amber-500/90 text-white',
        'text-[10px] font-medium',
        'pointer-events-none',
        className
      )}
    >
      <Sparkles className="h-3 w-3" />
      <span>{t('builtin.badge')}</span>
    </div>
  );
}
