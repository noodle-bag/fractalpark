'use client';

import { useMemo, useRef, useState } from 'react';
import { Dices, Library, Loader2 } from 'lucide-react';
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
import {
  PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1,
  type PublishedFormulaDirectoryCategoryV1,
} from '@/content/formula-directory-categories';
import type { PublishedFormulaDirectoryRowV1 } from '@/content/published-formula-directory';
import {
  getPublishedFormulaLibraryClient,
  PUBLISHED_FORMULA_LIBRARY_DEFAULT_CATEGORY,
  PUBLISHED_FORMULA_LIBRARY_PAGE_SIZE,
  type PublishedFormulaLibraryClientResult,
} from '@/lib/published-formula-library';
import type {
  PublishedFormulaBeforeApply,
  PublishedFormulaSelectionResult,
} from '@/lib/published-formula-selection';
import { cn } from '@/lib/utils';

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
  loadClient = getPublishedFormulaLibraryClient,
}: PublishedFormulaLibraryProps) {
  const t = useTranslations('explore');
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<readonly PublishedFormulaDirectoryRowV1[]>([]);
  const [loading, setLoading] = useState(false);
  const [libraryError, setLibraryError] = useState(false);
  const [selectionError, setSelectionError] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<
    PublishedFormulaDirectoryCategoryV1 | 'all'
  >(PUBLISHED_FORMULA_LIBRARY_DEFAULT_CATEGORY);
  const [visibleCount, setVisibleCount] = useState(PUBLISHED_FORMULA_LIBRARY_PAGE_SIZE);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<'lucky' | null>(null);
  const [actionError, setActionError] = useState(false);
  const selectionGeneration = useRef(0);
  const libraryGeneration = useRef(0);
  const commitClose = useRef(false);

  const filteredRows = useMemo(
    () =>
      selectedCategory === 'all'
        ? rows
        : rows.filter((row) => row.categories.includes(selectedCategory)),
    [rows, selectedCategory],
  );
  const visibleRows = filteredRows.slice(0, visibleCount);

  const changeCategory = (
    category: PublishedFormulaDirectoryCategoryV1 | 'all',
  ) => {
    setSelectedCategory(category);
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
      setSelectedCategory(PUBLISHED_FORMULA_LIBRARY_DEFAULT_CATEGORY);
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
          setRows(result.value.directory.rows);
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
    callback: () => Promise<PublishedFormulaSelectionResult>,
  ) => {
    const generation = ++selectionGeneration.current;
    setActionPending('lucky');
    setActionError(false);
    const result = await callback();
    if (generation !== selectionGeneration.current) return;
    setActionPending(null);
    if (!result.ok && result.code !== 'selection-superseded') {
      setActionError(true);
    }
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

      {actionError && (
        <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">
          {t('formula.library.selectionFailed')}
        </p>
      )}

      <div
        className={cn('grid gap-2', onFeelingLucky ? 'grid-cols-2' : 'grid-cols-1')}
        data-testid="published-formula-discovery-actions"
      >
        {onFeelingLucky && (
          <Button
            type="button"
            className="h-auto min-h-9 min-w-0 justify-center gap-1.5 whitespace-normal px-2 py-2 text-center text-xs leading-tight sm:text-sm"
            aria-busy={actionPending === 'lucky'}
            onClick={() => void runDiscoveryAction(onFeelingLucky)}
          >
            {actionPending === 'lucky' ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <Dices className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            {t('formula.library.lucky')}
          </Button>
        )}

        <Sheet open={open} onOpenChange={handleOpenChange}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-9 min-w-0 justify-center gap-1.5 whitespace-normal px-2 py-2 text-center text-xs leading-tight sm:text-sm"
            >
              <Library className="h-4 w-4 shrink-0" />
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
              {t('formula.library.description', { count: rows.length || 534 })}
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
                <div
                  role="group"
                  className="mb-3 flex flex-wrap gap-1"
                  aria-label={t('formula.library.categoryFilter')}
                >
                  <Button
                    type="button"
                    size="sm"
                    variant={selectedCategory === 'all' ? 'default' : 'ghost'}
                    aria-pressed={selectedCategory === 'all'}
                    onClick={() => changeCategory('all')}
                  >
                    {t('formula.family.all')}
                  </Button>
                  {PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1.map((category) => (
                    <Button
                      type="button"
                      key={category}
                      size="sm"
                      variant={selectedCategory === category ? 'default' : 'ghost'}
                      aria-pressed={selectedCategory === category}
                      onClick={() => changeCategory(category)}
                    >
                      {t(`formula.family.${category}`)}
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
                          {t(`formula.family.${row.primaryFamily}`)}
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
    </div>
  );
}
