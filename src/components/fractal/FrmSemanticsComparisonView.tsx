'use client';

import { useTranslations } from 'next-intl';

import AnimatedFractalCanvas from '@/components/fractal/AnimatedFractalCanvas';
import { Badge } from '@/components/ui/badge';
import type { CompileResult } from '@/engine/frm/compile';
import type {
  FrmSemanticsComparison,
  FrmSemanticsComparisonSide,
} from '@/lib/frm-semantics-comparison';

interface FrmSemanticsComparisonViewProps {
  comparison: FrmSemanticsComparison;
}

interface DiagnosticItem {
  severity: 'error' | 'warning' | 'note';
  message: string;
}

function diagnostics(result: CompileResult): DiagnosticItem[] {
  return [
    ...result.errors.map((message) => ({
      severity: 'error' as const,
      message,
    })),
    ...result.warnings.map((message) => ({
      severity: 'warning' as const,
      message,
    })),
    ...(result.canonicalFormula?.compatibilityNotes ?? []).map((note) => ({
      severity: 'note' as const,
      message: note.loc
        ? `Line ${note.loc.line}, column ${note.loc.col}: ${note.message}`
        : note.message,
    })),
  ];
}

function descriptorSummary(result: CompileResult): string {
  if (result.frmSemanticsVersion === 1) {
    return `legacy bailout=${result.plugin?.bailout ?? 4}`;
  }
  if (!result.bailoutDescriptor) return '—';
  return JSON.stringify(result.bailoutDescriptor);
}

function ComparisonColumn({
  side,
}: {
  side: FrmSemanticsComparisonSide;
}) {
  const t = useTranslations('cloud.customFormulas.semantics');
  const items = diagnostics(side.result);
  const runnable = Boolean(
    side.result.success && side.result.plugin && side.previewParams,
  );
  const title = side.version === 1 ? t('legacyColumn') : t('strictColumn');

  return (
    <section
      className="min-w-0 space-y-3 rounded-lg border bg-background p-3"
      data-testid={`semantics-comparison-v${side.version}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{title}</h3>
        <Badge variant={runnable ? 'secondary' : 'destructive'}>
          {runnable ? t('runnable') : t('readOnly')}
        </Badge>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          {t('visualPreview')}
        </p>
        {runnable && side.result.plugin && side.previewParams ? (
          <div
            aria-label={`${title}: ${t('visualPreview')}`}
            className="h-44 overflow-hidden rounded-md border bg-black"
            role="img"
          >
            <AnimatedFractalCanvas
              active
              className="h-full w-full"
              dprScale={0.6}
              formulaPlugin={side.result.plugin}
              maxIterationsClamp={300}
              params={side.previewParams}
            />
          </div>
        ) : (
          <div className="flex h-44 items-center justify-center rounded-md border bg-muted/40 p-4 text-center text-xs text-muted-foreground">
            {t('visualUnavailable')}
          </div>
        )}
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        <dt className="font-medium text-muted-foreground">
          {t('descriptorLabel')}
        </dt>
        <dd className="break-all font-mono">{descriptorSummary(side.result)}</dd>
        <dt className="font-medium text-muted-foreground">
          {t('timingLabel')}
        </dt>
        <dd>
          {side.version === 1
            ? t('legacyTiming')
            : side.result.plugin?.afterStepTiming
              ? t('afterStep')
              : t('beforeStep')}
        </dd>
        <dt className="font-medium text-muted-foreground">
          {t('smoothLabel')}
        </dt>
        <dd>
          {side.version === 1
            ? t('legacyFrozen')
            : side.result.plugin?.smoothCapability ?? '—'}
        </dd>
      </dl>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          {t('diagnosticsHeading')}
        </p>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('noDiagnostics')}</p>
        ) : (
          <ul className="max-h-36 space-y-1 overflow-y-auto pr-1 text-xs">
            {items.map((item, index) => (
              <li
                className={
                  item.severity === 'error'
                    ? 'text-destructive'
                    : item.severity === 'warning'
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-muted-foreground'
                }
                key={`${item.severity}-${index}-${item.message}`}
              >
                <span className="font-medium">
                  {t(`diagnostic${item.severity[0].toUpperCase()}${item.severity.slice(1)}`)}:
                </span>{' '}
                {item.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function FrmSemanticsComparisonView({
  comparison,
}: FrmSemanticsComparisonViewProps) {
  return (
    <div
      className="grid gap-3 md:grid-cols-2"
      data-testid="frm-semantics-comparison"
    >
      <ComparisonColumn side={comparison.v1} />
      <ComparisonColumn side={comparison.v2} />
    </div>
  );
}
