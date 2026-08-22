'use client';

import { useMemo, useRef, useState } from 'react';
import { Dices, Library, Loader2, RotateCcw, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { pluginRegistry } from '@/engine/plugins/registry';
import type { PublishedFormulaRuntimeIndexRowV1 } from '@/engine/formulas/v1';
import {
  getPublishedFormulaLibraryClient,
  PUBLISHED_FORMULA_LIBRARY_PAGE_SIZE,
  type PublishedFormulaLibraryClientResult,
} from '@/lib/published-formula-library';
import type {
  PublishedFormulaBeforeApply,
  PublishedFormulaSelectionResult,
} from '@/lib/published-formula-selection';
import { cn } from '@/lib/utils';

const FAMILY_ORDER = [
  'algebraic-power',
  'folded-absolute',
  'function-composition',
  'orbit-memory',
  'rational-reciprocal',
  'root-finding',
  'transcendental',
] as const;

interface PublishedFormulaLibraryProps {
  currentFormula: string;
  onSelect: (
    formulaId: string,
    beforeApply?: PublishedFormulaBeforeApply,
  ) => Promise<PublishedFormulaSelectionResult>;
  onCancel?: () => void;
  onFeelingLucky?: () => Promise<PublishedFormulaSelectionResult>;
  onResetProfile?: () => Promise<PublishedFormulaSelectionResult>;
  canResetProfile?: boolean;
  canUndo?: boolean;
  onUndo?: () => void;
  loadClient?: () => Promise<PublishedFormulaLibraryClientResult>;
}

function currentFormulaName(formulaId: string, t: ReturnType<typeof useTranslations>): string {
  const plugin = pluginRegistry.getFormula(formulaId);
  if (!plugin) return formulaId;
  return plugin.source === 'builtin'
    ? t(`controls.formula.${formulaId}`)
    : plugin.name;
}

export function PublishedFormulaLibrary({
  currentFormula,
  onSelect,
  onCancel,
  onFeelingLucky,
  onResetProfile,
  canResetProfile = false,
  canUndo = false,
  onUndo,
  loadClient = getPublishedFormulaLibraryClient,
}: PublishedFormulaLibraryProps) {
  const t = useTranslations('explore');
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<readonly PublishedFormulaRuntimeIndexRowV1[]>([]);
  const [loading, setLoading] = useState(false);
  const [libraryError, setLibraryError] = useState(false);
  const [selectionError, setSelectionError] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PUBLISHED_FORMULA_LIBRARY_PAGE_SIZE);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<'lucky' | 'reset' | null>(null);
  const [actionError, setActionError] = useState(false);
  const selectionGeneration = useRef(0);
  const libraryGeneration = useRef(0);
  const commitClose = useRef(false);

  const families = useMemo(() => {
    const present = new Set(rows.map((row) => row.family));
    return FAMILY_ORDER.filter((family) => present.has(family));
  }, [rows]);

  const filteredRows = useMemo(
    () =>
      selectedFamily === 'all'
        ? rows
        : rows.filter((row) => row.family === selectedFamily),
    [rows, selectedFamily],
  );
  const visibleRows = filteredRows.slice(0, visibleCount);

  const changeFamily = (family: string) => {
    setSelectedFamily(family);
    setVisibleCount(PUBLISHED_FORMULA_LIBRARY_PAGE_SIZE);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    selectionGeneration.current += 1;
    setSelectingId(null);
    setSelectionError(false);
    if (next && actionPending !== null) onCancel?.();
    setActionPending(null);
    setActionError(false);
    if (next) {
      setSelectedFamily('all');
      setVisibleCount(PUBLISHED_FORMULA_LIBRARY_PAGE_SIZE);
      if (rows.length === 0) {
        const generation = ++libraryGeneration.current;
        setLoading(true);
        setLibraryError(false);
        void loadClient().then((result) => {
          if (generation !== libraryGeneration.current) return;
          setLoading(false);
          if (!result.ok) {
            setLibraryError(true);
            return;
          }
          setRows(result.value.index.rows);
        });
      }
    } else {
      if (!commitClose.current) onCancel?.();
      libraryGeneration.current += 1;
      setLoading(false);
    }
  };

  const handleSelect = async (formulaId: string) => {
    const generation = ++selectionGeneration.current;
    setSelectingId(formulaId);
    setSelectionError(false);
    setActionPending(null);
    setActionError(false);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    if (generation !== selectionGeneration.current) return;
    const result = await onSelect(formulaId, async () => {
      commitClose.current = true;
      setOpen(false);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });
    commitClose.current = false;
    if (generation !== selectionGeneration.current) return;
    setSelectingId(null);
    if (result.ok) {
      setOpen(false);
      return;
    }
    if (result.code !== 'selection-superseded') setSelectionError(true);
  };

  const runDiscoveryAction = async (
    action: 'lucky' | 'reset',
    callback: () => Promise<PublishedFormulaSelectionResult>,
  ) => {
    const generation = ++selectionGeneration.current;
    setActionPending(action);
    setActionError(false);
    const result = await callback();
    if (generation !== selectionGeneration.current) return;
    setActionPending(null);
    if (!result.ok && result.code !== 'selection-superseded') {
      setActionError(true);
    }
  };

  const handleUndo = () => {
    selectionGeneration.current += 1;
    setActionPending(null);
    setActionError(false);
    onUndo?.();
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t('formula.library.current')}
        </p>
        <p
          className="break-words text-sm font-medium"
          data-formula-id={currentFormula}
          data-testid="published-formula-current"
        >
          {currentFormulaName(currentFormula, t)}
        </p>
      </div>

      {onFeelingLucky && (
        <Button
          type="button"
          className="w-full justify-center gap-2"
          aria-busy={actionPending === 'lucky'}
          onClick={() => void runDiscoveryAction('lucky', onFeelingLucky)}
        >
          {actionPending === 'lucky' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Dices className="h-4 w-4" aria-hidden="true" />
          )}
          {t('formula.library.lucky')}
        </Button>
      )}

      {(onResetProfile || onUndo) && (
        <div className="grid grid-cols-2 gap-2">
          {onResetProfile && (
            <Button
              type="button"
              variant="outline"
              className="min-w-0 gap-1.5 whitespace-normal"
              disabled={!canResetProfile}
              aria-busy={actionPending === 'reset'}
              onClick={() => void runDiscoveryAction('reset', onResetProfile)}
            >
              {actionPending === 'reset' ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              {t('formula.library.resetProfile')}
            </Button>
          )}
          {onUndo && (
            <Button
              type="button"
              variant="outline"
              className="min-w-0 gap-1.5 whitespace-normal"
              disabled={!canUndo}
              onClick={handleUndo}
            >
              <Undo2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t('formula.library.undoFormulaChange')}
            </Button>
          )}
        </div>
      )}

      {actionError && (
        <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">
          {t('formula.library.selectionFailed')}
        </p>
      )}

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-center gap-2">
            <Library className="h-4 w-4" />
            {t('formula.library.open')}
          </Button>
        </SheetTrigger>
        <SheetContent
          aria-busy={loading || selectingId !== null}
          className="w-full max-w-none gap-0 p-0 data-[state=closed]:animate-none! data-[state=closed]:transition-none! sm:w-[min(90vw,48rem)] sm:max-w-3xl"
        >
          <SheetHeader className="border-b pr-12">
            <SheetTitle>{t('formula.library.title')}</SheetTitle>
            <SheetDescription>
              {t('formula.library.description', { count: rows.length || 513 })}
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col p-4">
            {loading ? (
              <div
                role="status"
                aria-live="polite"
                className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {t('formula.library.loading')}
              </div>
            ) : libraryError ? (
              <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">
                {t('formula.library.unavailable')}
              </p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-1" aria-label={t('formula.library.familyFilter')}>
                  <Button
                    type="button"
                    size="sm"
                    variant={selectedFamily === 'all' ? 'default' : 'ghost'}
                    aria-pressed={selectedFamily === 'all'}
                    onClick={() => changeFamily('all')}
                  >
                    {t('formula.family.all')}
                  </Button>
                  {families.map((family) => (
                    <Button
                      type="button"
                      key={family}
                      size="sm"
                      variant={selectedFamily === family ? 'default' : 'ghost'}
                      aria-pressed={selectedFamily === family}
                      onClick={() => changeFamily(family)}
                    >
                      {t(`formula.family.${family}`)}
                    </Button>
                  ))}
                </div>

                {selectionError && (
                  <p role="alert" className="mb-3 rounded-md border border-destructive/30 p-3 text-sm text-destructive">
                    {t('formula.library.selectionFailed')}
                  </p>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {visibleRows.map((row) => (
                      <button
                        type="button"
                        key={row.formulaId}
                        data-formula-id={row.formulaId}
                        aria-label={row.displayName}
                        aria-current={row.formulaId === currentFormula ? 'true' : undefined}
                        aria-busy={selectingId === row.formulaId}
                        onClick={() => void handleSelect(row.formulaId)}
                        className={cn(
                          'rounded-md border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          row.formulaId === currentFormula && 'border-primary bg-primary/10',
                        )}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="min-w-0 break-words text-sm font-medium">
                            {row.displayName}
                          </span>
                          {selectingId === row.formulaId && (
                            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                          )}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {t(`formula.family.${row.family}`)}
                        </span>
                      </button>
                    ))}
                  </div>

                  {visibleCount < filteredRows.length && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-3 w-full"
                      onClick={() => setVisibleCount((count) => count + PUBLISHED_FORMULA_LIBRARY_PAGE_SIZE)}
                    >
                      {t('formula.library.loadMore')}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
