'use client';

import { useEffect, useRef, useState, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import {
  Download,
  ImageDown,
  LoaderCircle,
  RotateCcw,
  Save,
  Upload,
} from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArtworkActionStatus,
  ArtworkOperation,
  CloudSyncPhase,
} from '@/hooks/useArtworkActions';

interface ArtworkActionsProps {
  /** Move only toolbar presentation; canvas dropzone and dialog state stay here. */
  toolbarTarget?: HTMLElement | null;
  frameReady?: boolean;
  status: ArtworkActionStatus;
  cloudPhase?: CloudSyncPhase;
  /** Prefilled save-dialog name — the current draft title, or a fallback. */
  defaultSaveName: string;
  onClearStatus: () => void;
  onSave: (name: string) => Promise<boolean>;
  onDownload: () => Promise<boolean>;
  onImport: (file: File) => Promise<boolean>;
  onExport: (scale: number, ssaaLevel: number) => Promise<boolean>;
  onReset: () => void;
  /** Revision-conflict exits (spec §17): adopt the remote version, or keep
   *  local edits as a brand-new draft. No silent overwrite either way. */
  onConflictReload?: () => void;
  onConflictSaveAsNew?: () => void;
  /** Disables both conflict exits while one is in flight (review N2). */
  conflictBusy?: boolean;
}

const ACTION_ICONS = {
  save: Save,
  download: Download,
  import: Upload,
  export: ImageDown,
} satisfies Record<ArtworkOperation, typeof Save>;

export function ArtworkActions({
  toolbarTarget,
  frameReady = true,
  status,
  cloudPhase = 'idle',
  defaultSaveName,
  onClearStatus,
  onSave,
  onDownload,
  onImport,
  onExport,
  onReset,
  onConflictReload,
  onConflictSaveAsNew,
  conflictBusy = false,
}: ArtworkActionsProps) {
  const t = useTranslations('explore.artworkActions');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resetCancelRef = useRef<HTMLButtonElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScale, setExportScale] = useState(2);
  const [exportQuality, setExportQuality] = useState(9);
  const [dragging, setDragging] = useState(false);
  const actionGridRef = useRef<HTMLDivElement>(null);
  const [wrappedActions, setWrappedActions] = useState(false);
  const pending = status.phase === 'pending';

  useEffect(() => {
    if (!toolbarTarget || !actionGridRef.current) return;
    const grid = actionGridRef.current;
    let active = true;
    const measure = () => {
      if (!active) return;
      const labels = [...grid.querySelectorAll('button > span')];
      const width = labels.reduce((total, label) => total + Math.max(44, label.getBoundingClientRect().width + 8), 16);
      setWrappedActions(width > grid.clientWidth);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(grid);
    void document.fonts?.ready.then(measure);
    return () => { active = false; observer?.disconnect(); };
  }, [toolbarTarget, t]);

  useEffect(() => {
    if (status.phase === 'idle' || status.phase === 'pending') return;
    const timer = window.setTimeout(onClearStatus, 4000);
    return () => window.clearTimeout(timer);
  }, [onClearStatus, status]);

  useEffect(() => {
    const handleDragEnter = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) setDragging(true);
    };
    const handleDragEnd = () => setDragging(false);
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragend', handleDragEnd);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragend', handleDragEnd);
    };
  }, []);

  const chooseFile = () => {
    if (!pending) fileInputRef.current?.click();
  };

  const submitSave = async () => {
    if (!saveName.trim() || pending || !frameReady) return;
    if (await onSave(saveName.trim())) setSaveOpen(false);
  };

  const submitExport = async () => {
    if (pending || !frameReady) return;
    if (await onExport(exportScale, exportQuality)) setExportOpen(false);
  };

  const statusText =
    status.phase === 'success'
      ? t(`status.${status.operation}.success`)
      : status.phase === 'error'
        ? t(`errors.${status.code}`)
        : null;
  const cloudText =
    status.phase === 'success' && status.operation === 'save' && cloudPhase !== 'idle'
      ? t(`cloud.${cloudPhase}`)
      : null;

  const toolbar = (
      <div className={toolbarTarget ? 'w-full' : 'absolute right-3 top-3 z-20'}>
        <div ref={actionGridRef} data-wrapped={wrappedActions}
          style={toolbarTarget ? { gridTemplateColumns: wrappedActions ? 'repeat(3, minmax(0, 1fr))' : 'repeat(5, minmax(max-content, 1fr))' } : undefined}
          className={toolbarTarget ? 'grid items-stretch gap-1' : 'ml-auto flex w-fit max-w-full flex-wrap items-center gap-1 rounded-xl border border-white/15 bg-black/65 p-1.5 text-white shadow-lg backdrop-blur-md'}>
          <ActionButton
            compact={!!toolbarTarget}
            shortLabel={t('save.short')}
            label={t('save.label')}
            operation="save"
            buttonRef={saveButtonRef}
            disabled={!frameReady}
            status={status}
            onClick={() => {
              setSaveName(defaultSaveName);
              setSaveOpen(true);
              onClearStatus();
            }}
          />
          <ActionButton
            compact={!!toolbarTarget}
            shortLabel={t('download.short')}
            label={t('download.label')}
            operation="download"
            status={status}
            onClick={onDownload}
          />
          <ActionButton
            compact={!!toolbarTarget}
            shortLabel={t('import.short')}
            label={t('import.label')}
            operation="import"
            status={status}
            onClick={chooseFile}
          />
          <ActionButton
            compact={!!toolbarTarget}
            shortLabel={t('export.short')}
            label={t('export.label')}
            operation="export"
            buttonRef={exportButtonRef}
            disabled={!frameReady}
            status={status}
            onClick={() => {
              setExportOpen(true);
              onClearStatus();
            }}
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={pending}
                className={toolbarTarget ? 'h-auto min-h-11 w-full flex-col gap-1 whitespace-normal border-l px-1 py-1 text-xs' : 'size-11 text-white hover:bg-white/15 hover:text-white'}
                aria-label={t('reset.label')}
                title={t('reset.label')}
              >
                <RotateCcw className="size-4" />
                {toolbarTarget && <span className="whitespace-nowrap">{t('reset.short')}</span>}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                resetCancelRef.current?.focus();
              }}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>{t('reset.title')}</AlertDialogTitle>
                <AlertDialogDescription>{t('reset.description')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel ref={resetCancelRef}>{t('reset.cancel')}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onReset}>
                  {t('reset.confirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        {statusText && (
          <div
            className={`ml-auto mt-2 w-fit max-w-sm rounded-md border px-3 py-2 text-xs shadow-lg backdrop-blur-md ${
              status.phase === 'error'
                ? 'border-red-400/40 bg-red-950/85 text-red-100'
                : 'border-emerald-400/40 bg-emerald-950/85 text-emerald-100'
            }`}
            role="status"
            aria-live="polite"
          >
            {statusText}
            {cloudText && (
              <span className="mt-1 block border-t border-white/10 pt-1 opacity-90">
                {cloudText}
              </span>
            )}
            {cloudPhase === 'conflict' && onConflictReload && onConflictSaveAsNew && (
              <span className="mt-1.5 flex gap-2">
                <button
                  type="button"
                  onClick={onConflictReload}
                  disabled={conflictBusy}
                  className="rounded border border-white/25 px-2 py-1 text-[11px] hover:bg-white/10 disabled:opacity-50"
                >
                  {t('conflict.reload')}
                </button>
                <button
                  type="button"
                  onClick={onConflictSaveAsNew}
                  disabled={conflictBusy || !frameReady}
                  className="rounded border border-white/25 px-2 py-1 text-[11px] hover:bg-white/10 disabled:opacity-50"
                >
                  {t('conflict.saveAsNew')}
                </button>
              </span>
            )}
          </div>
        )}
      </div>
  );

  return (
    <>
      {toolbarTarget ? createPortal(toolbar, toolbarTarget) : toolbar}
      <input
        ref={fileInputRef}
        type="file"
        accept=".fractal.json,application/json"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) await onImport(file);
        }}
      />

      {dragging && (
        <div
          className="absolute inset-0 z-40 grid place-items-center bg-black/70 p-6 backdrop-blur-sm"
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setDragging(false);
          }}
          onDrop={async (event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file) await onImport(file);
          }}
        >
          <div className="rounded-xl border border-dashed border-white/50 bg-black/60 px-8 py-10 text-center text-white">
            <Upload className="mx-auto mb-3 size-8" />
            <p className="font-medium">{t('import.dropHint')}</p>
          </div>
        </div>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}
          onCloseAutoFocus={event => { event.preventDefault(); saveButtonRef.current?.focus({ preventScroll: true }); }}>
          <DialogHeader>
            <DialogTitle>{t('save.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="artwork-name">{t('save.name')}</Label>
            <Input
              id="artwork-name"
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              placeholder={t('save.placeholder')}
              autoFocus
              onKeyDown={async (event) => {
                if (event.key === 'Enter') await submitSave();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button disabled={pending || !frameReady || !saveName.trim()} onClick={submitSave}>
              {pending ? t('save.pending') : t('save.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}
          onCloseAutoFocus={event => { event.preventDefault(); exportButtonRef.current?.focus({ preventScroll: true }); }}>
          <DialogHeader>
            <DialogTitle>{t('export.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <OptionGroup
              label={t('export.scale')}
              options={[1, 2, 3, 4].map((value) => ({
                value,
                label: `${value}x`,
              }))}
              value={exportScale}
              onChange={setExportScale}
            />
            <OptionGroup
              label={t('export.quality')}
              options={[
                { value: 0, label: t('export.qualityOff') },
                { value: 4, label: t('export.qualityLow') },
                { value: 9, label: t('export.qualityHigh') },
                { value: 16, label: t('export.qualityUltra') },
              ]}
              value={exportQuality}
              onChange={setExportQuality}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button disabled={pending || !frameReady} onClick={submitExport}>
              {pending ? t('export.pending') : t('export.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ActionButton({
  buttonRef,
  compact = false,
  shortLabel,
  disabled = false,
  label,
  operation,
  status,
  onClick,
}: {
  buttonRef?: Ref<HTMLButtonElement>;
  compact?: boolean;
  shortLabel?: string;
  disabled?: boolean;
  label: string;
  operation: ArtworkOperation;
  status: ArtworkActionStatus;
  onClick: () => void | Promise<boolean>;
}) {
  const Icon = ACTION_ICONS[operation];
  const isCurrent = status.phase === 'pending' && status.operation === operation;

  return (
    <Button
      ref={buttonRef}
      type="button"
      variant={compact && operation === 'save' ? 'default' : 'ghost'}
      size="icon"
      disabled={disabled || status.phase === 'pending'}
      className={compact ? 'h-auto min-h-11 w-full flex-col gap-1 whitespace-normal px-1 py-1 text-xs' : 'size-11 text-white hover:bg-white/15 hover:text-white'}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {isCurrent
        ? <LoaderCircle className="size-4 animate-spin" />
        : <Icon className="size-4" />
      }
      {compact && <span className="whitespace-nowrap">{shortLabel}</span>}
    </Button>
  );
}

function OptionGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: number; label: string }[];
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex overflow-hidden rounded-md border">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`min-h-10 flex-1 px-2 text-xs transition-colors ${
              value === option.value
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
