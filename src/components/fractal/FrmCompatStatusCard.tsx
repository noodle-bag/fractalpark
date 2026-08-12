/**
 * Four-level compatibility status card (v0.4.18 Slice 7e2, plan §5.6).
 *
 * Presentational component for the classification engine: level badge,
 * declared adaptations, severity/blocking-split diagnostics with classic
 * source locations, and — for multi-entry sources — the explicit entry
 * picker (the user chooses the target; nothing silently runs the first
 * entry). Mobile renders the persistent single-line summary with details
 * on demand; desktop renders the full card.
 */

'use client';

import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  CircleAlert,
  CircleCheck,
  Info,
  Lock,
} from 'lucide-react';
import type {
  FrmCompatDiagnostic,
  FrmCompatLevel,
  FrmSourceCompat,
} from '@/engine/frm/compat-status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface FrmCompatStatusCardProps {
  classification: FrmSourceCompat;
  /** Multi-entry sources: pick the target entry (slice-loaded by the caller). */
  onSelectEntry?: (key: string) => void;
  /** Jump to a classic source location in the editor. */
  onJumpToLocation?: (line: number, col?: number) => void;
}

const LEVEL_STYLE: Record<FrmCompatLevel, string> = {
  supported: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  adapted: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  'read-only': 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  invalid: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
};

function LevelBadge({ level }: { level: FrmCompatLevel }) {
  const t = useTranslations('frmEditor.compat');
  return (
    <Badge className={LEVEL_STYLE[level]} variant="outline">
      {t(`level.${level === 'read-only' ? 'readOnly' : level}`)}
    </Badge>
  );
}

function SeverityIcon({ severity }: { severity: FrmCompatDiagnostic['severity'] }) {
  if (severity === 'error') return <CircleAlert aria-hidden className="size-3.5 text-red-500" />;
  if (severity === 'warning') return <AlertTriangle aria-hidden className="size-3.5 text-amber-500" />;
  return <Info aria-hidden className="size-3.5 text-sky-500" />;
}

function DiagnosticList({
  diagnostics,
  onJumpToLocation,
}: {
  diagnostics: FrmCompatDiagnostic[];
  onJumpToLocation?: (line: number, col?: number) => void;
}) {
  const t = useTranslations('frmEditor.compat');
  if (diagnostics.length === 0) return null;
  const order = { error: 0, warning: 1, note: 2 } as const;
  const sorted = [...diagnostics].sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <ul className="space-y-1.5" data-testid="frm-compat-diagnostics">
      {sorted.map((d, i) => (
        <li className="flex items-start gap-2 text-xs leading-5" key={`${d.reasonCode}-${i}`}>
          <SeverityIcon severity={d.severity} />
          <span className="min-w-0 flex-1 text-muted-foreground">
            {d.blocking && (
              <span className="mr-1 font-medium text-red-600 dark:text-red-400">
                {t('blockingTag')}
              </span>
            )}
            <span className="break-words">{d.message}</span>
          </span>
          {d.line !== undefined && onJumpToLocation && (
            <Button
              className="h-5 shrink-0 px-1.5 text-[10px]"
              onClick={() => onJumpToLocation(d.line!, d.col)}
              type="button"
              variant="ghost"
            >
              {t('lineJump', { line: d.line })}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function AdaptationChips({ adaptations }: { adaptations: string[] }) {
  const t = useTranslations('frmEditor.compat');
  if (adaptations.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{t('adaptationsTitle')}</span>
      {adaptations.map((a) => (
        <Badge className="font-mono text-[10px]" key={a} variant="secondary">
          {a}
        </Badge>
      ))}
    </div>
  );
}

export function FrmCompatStatusCard({
  classification,
  onSelectEntry,
  onJumpToLocation,
}: FrmCompatStatusCardProps) {
  const t = useTranslations('frmEditor.compat');
  const { entries, sourceDiagnostics } = classification;

  const summaryOf = (level: FrmCompatLevel | null) => {
    const errors =
      entries.reduce((n, e) => n + e.diagnostics.filter((d) => d.severity === 'error').length, 0) +
      sourceDiagnostics.filter((d) => d.severity === 'error').length;
    const warnings = entries.reduce(
      (n, e) => n + e.diagnostics.filter((d) => d.severity === 'warning').length,
      0,
    );
    return t('summary', {
      level: level ? t(`level.${level === 'read-only' ? 'readOnly' : level}`) : t('level.invalid'),
      errors,
      warnings,
    });
  };

  // Multi-entry: explicit picker — nothing runs until the user chooses.
  if (entries.length > 1) {
    const blocked = entries.filter((e) => !e.runnable).length;
    const body = (
      <ul className="space-y-1.5" data-testid="frm-compat-entry-picker">
        {entries.map((e) => (
          <li className="flex items-center gap-2" key={e.key}>
            <LevelBadge level={e.level} />
            {!e.runnable && <Lock aria-hidden className="size-3.5 text-muted-foreground" />}
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{e.key}</span>
            {onSelectEntry && (
            <Button
              aria-label={t('selectEntry', { name: e.key })}
              data-testid={`frm-compat-select-${e.key}`}
                onClick={() => onSelectEntry(e.key)}
                size="sm"
                type="button"
                variant="outline"
              >
                {t('select')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    );
    return (
      <div className="rounded-lg border bg-card p-3" data-testid="frm-compat-card">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <CircleCheck aria-hidden className="size-4 text-sky-500" />
          {t('entriesTitle', { count: entries.length })}
        </div>
        <details className="lg:hidden">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {t('entriesSummary', { count: entries.length, blocked })}
          </summary>
          <div className="mt-2">{body}</div>
        </details>
        <div className="hidden lg:block">{body}</div>
      </div>
    );
  }

  // Single entry (or none): full status card.
  const entry = entries[0];
  const summary = summaryOf(entry?.level ?? null);
  const diagnostics = entry ? [...sourceDiagnostics, ...entry.diagnostics] : sourceDiagnostics;
  const full = (
    <>
      <div className="mb-2 flex items-center gap-2">
        <LevelBadge level={entry?.level ?? 'invalid'} />
        {entry && !entry.runnable && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock aria-hidden className="size-3.5" />
            {t('blockedHint')}
          </span>
        )}
      </div>
      {entry && <AdaptationChips adaptations={entry.adaptations} />}
      <div className={entry && entry.adaptations.length > 0 ? 'mt-2' : ''}>
        <DiagnosticList diagnostics={diagnostics} onJumpToLocation={onJumpToLocation} />
      </div>
    </>
  );
  return (
    <div className="rounded-lg border bg-card p-3" data-testid="frm-compat-card">
      <details className="lg:hidden">
        <summary className="cursor-pointer text-xs">{summary}</summary>
        <div className="mt-2">{full}</div>
      </details>
      <div className="hidden lg:block">{full}</div>
    </div>
  );
}
