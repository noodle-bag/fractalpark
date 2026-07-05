'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Search, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { pluginRegistry } from '@/engine/plugins/registry';
import { getFormulaMetadata } from '@/engine/plugins/formula-catalog';
import type { FormulaPlugin } from '@/engine/plugins/types';
import { cn } from '@/lib/utils';

type FormulaFamily = 'all' | 'classic' | 'burning-ship' | 'newton' | 'magnet' | 'phoenix' | 'transcendental' | 'exotic';

interface FormulaBrowserProps {
  currentFormula: string;
  onFormulaChange: (formula: string) => void;
}

const FAMILY_COLORS: Record<string, string> = {
  classic: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  'burning-ship': 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  newton: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  magnet: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  phoenix: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
  transcendental: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  exotic: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
};

const FAMILY_ORDER: FormulaFamily[] = ['all', 'classic', 'burning-ship', 'newton', 'magnet', 'phoenix', 'transcendental', 'exotic'];

// Hook to get formulas with client-side hydration handling
function useFormulas() {
  const [formulas, setFormulas] = useState<FormulaPlugin[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Small delay to ensure plugins are registered
    const timeout = setTimeout(() => {
      setFormulas(pluginRegistry.listFormulas());
      setIsReady(true);
    }, 50);

    return () => clearTimeout(timeout);
  }, []);

  return { formulas, isReady };
}

export function FormulaBrowser({ currentFormula, onFormulaChange }: FormulaBrowserProps) {
  const t = useTranslations('explore');
  const [searchQuery, setSearchQuery] = useState('');
  const { formulas: allFormulas, isReady } = useFormulas();

  // Compute the family of the current formula
  const currentFormulaFamily = useMemo(() => {
    if (!currentFormula) return 'all';
    const meta = getFormulaMetadata(currentFormula);
    return (meta?.family as FormulaFamily) ?? 'all';
  }, [currentFormula]);

  // Track if user has manually selected a family
  const [userSelectedFamily, setUserSelectedFamily] = useState<FormulaFamily | null>(null);

  // Effective selected family: user selection takes precedence, otherwise follow current formula
  const selectedFamily = userSelectedFamily ?? currentFormulaFamily;

  // Filter formulas based on search and family
  const filteredFormulas = useMemo(() => {
    return allFormulas.filter((formula) => {
      const meta = getFormulaMetadata(formula.id);
      const family = meta?.family ?? 'classic';

      // Family filter
      if (selectedFamily !== 'all' && family !== selectedFamily) {
        return false;
      }

      // Search filter - search in both name and description
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        // Custom formulas use formula.name directly, built-in formulas use translation key
        const displayName = formula.source === 'frm' || formula.source === 'custom'
          ? formula.name
          : t(`controls.formula.${formula.id}`);
        const nameMatch = displayName.toLowerCase().includes(query);
        const descMatch = meta?.description?.toLowerCase().includes(query) ?? false;
        if (!nameMatch && !descMatch) {
          return false;
        }
      }

      return true;
    });
  }, [allFormulas, selectedFamily, searchQuery, t]);

  // Group by family for display
  const groupedFormulas = useMemo(() => {
    const groups: Record<string, FormulaPlugin[]> = {};
    filteredFormulas.forEach((formula) => {
      const meta = getFormulaMetadata(formula.id);
      const family = meta?.family ?? 'classic';
      if (!groups[family]) groups[family] = [];
      groups[family].push(formula);
    });
    return groups;
  }, [filteredFormulas]);

  // Sort families in consistent order
  const sortedFamilies = useMemo(() => {
    return Object.keys(groupedFormulas).sort((a, b) => {
      const orderA = FAMILY_ORDER.indexOf(a as FormulaFamily);
      const orderB = FAMILY_ORDER.indexOf(b as FormulaFamily);
      return orderA - orderB;
    });
  }, [groupedFormulas]);

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('formula.search')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* Family filter tabs */}
      <div className="flex flex-wrap gap-1 mb-3">
        {FAMILY_ORDER.map((family) => (
          <Button
            key={family}
            variant={selectedFamily === family ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setUserSelectedFamily(family)}
            className={cn(
              'h-7 px-2 text-xs capitalize',
              selectedFamily === family && 'bg-primary text-primary-foreground'
            )}
          >
            {family === 'all' ? t('formula.family.all') : t(`formula.family.${family}`)}
          </Button>
        ))}
      </div>

      {/* Formula grid */}
      <ScrollArea className="flex-1 -mx-2 px-2">
        {!isReady ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            <div className="animate-spin mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
            Loading formulas...
          </div>
        ) : filteredFormulas.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {t('formula.noResults')}
          </div>
        ) : selectedFamily === 'all' && !searchQuery ? (
          // Grouped view when showing all
          <div className="space-y-4">
            {sortedFamilies.map((family) => (
              <div key={family}>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  {t(`formula.family.${family}`)}
                </h4>
                <div className="grid grid-cols-1 gap-1.5">
                  {groupedFormulas[family].map((formula) => (
                    <FormulaCard
                      key={formula.id}
                      formula={formula}
                      isActive={formula.id === currentFormula}
                      onClick={() => onFormulaChange(formula.id)}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Flat list when filtering
          <div className="grid grid-cols-1 gap-1.5">
            {filteredFormulas.map((formula) => (
              <FormulaCard
                key={formula.id}
                formula={formula}
                isActive={formula.id === currentFormula}
                onClick={() => onFormulaChange(formula.id)}
                t={t}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface FormulaCardProps {
  formula: FormulaPlugin;
  isActive: boolean;
  onClick: () => void;
  t: (key: string) => string;
}

function FormulaCard({ formula, isActive, onClick, t }: FormulaCardProps) {
  const meta = getFormulaMetadata(formula.id);
  const family = meta?.family ?? 'classic';
  const difficulty = meta?.difficulty ?? 'easy';
  const supportsJulia = formula.supportsJulia !== false; // default true

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-2.5 rounded-md border transition-all duration-150',
        'hover:bg-accent hover:border-accent-foreground/20',
        isActive && 'bg-primary/10 border-primary/50 ring-1 ring-primary/30'
      )}
    >
      <div className="flex items-center gap-2">
        {/* Thumbnail placeholder */}
        <div
          className={cn(
            'w-10 h-10 rounded border flex items-center justify-center text-lg shrink-0',
            isActive ? 'bg-primary/20 border-primary/30' : 'bg-muted border-border'
          )}
        >
          <Sparkles className="h-4 w-4 text-muted-foreground" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-sm truncate">
              {formula.source === 'frm' || formula.source === 'custom'
                ? formula.name
                : t(`controls.formula.${formula.id}`)}
            </span>
            {supportsJulia && (
              <span className="text-[9px] bg-gradient-to-r from-purple-500/20 to-blue-500/20 text-purple-600 dark:text-purple-400 px-1.5 py-0 rounded-full border border-purple-500/30 shrink-0">
                Julia
              </span>
            )}
            {isActive && (
              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0 rounded-full">
                {t('formula.active')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-0.5">
            {/* Family badge */}
            <span
              className={cn(
                'text-[10px] px-1.5 py-0 rounded-full border capitalize',
                FAMILY_COLORS[family] ?? FAMILY_COLORS.classic
              )}
            >
              {t(`formula.family.${family}`)}
            </span>

            {/* Difficulty indicator */}
            <span className="text-[10px] text-muted-foreground" title={difficulty}>
              {difficulty === 'easy' && '●'}
              {difficulty === 'medium' && '●●'}
              {difficulty === 'hard' && '●●●'}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
