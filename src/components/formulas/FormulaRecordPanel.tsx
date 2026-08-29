import { ArrowRight, ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CanonicalSourceWorkspace } from '@/components/formulas/CanonicalSourceWorkspace';
import { FormulaRecordPreviewImage } from '@/components/formulas/FormulaRecordPreviewImage';
import { buildPublishedFormulaSourceReferenceV1 } from '@/lib/published-formula-source';
import type {
  PublicFormulaRecordV1,
  PublishedFormulaRecordV1,
} from '@/lib/formula-records';

interface FormulaRecordPanelProps {
  readonly locale: string;
  readonly record: PublicFormulaRecordV1;
}

export async function FormulaRecordPanel({
  locale,
  record,
}: FormulaRecordPanelProps) {
  const t = await getTranslations({ locale, namespace: 'formulas.record' });
  const sourceReference =
    record.availability === 'published'
      ? buildPublishedFormulaSourceReferenceV1({
          formulaId: record.formulaId,
          sourceRevision: record.source.sourceRevision,
          semanticHash: record.source.semanticHash,
          href: record.source.href,
        })
      : undefined;
  const mailto = `mailto:${record.takedown.email}?subject=${encodeURIComponent(
    record.takedown.subject,
  )}`;

  return (
    <section
      aria-labelledby="formula-record-heading"
      className="mx-auto max-w-6xl px-5 py-16 sm:px-8"
      data-formula-record-availability={record.availability}
      data-testid="formula-record"
      id="record"
    >
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
        {t('eyebrow')}
      </p>
      <h2
        className="mt-3 text-3xl font-semibold tracking-tight"
        id="formula-record-heading"
      >
        {record.canonicalName}
      </h2>
      <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
        {record.availability === 'published'
          ? t('publishedSummary')
          : t('unavailableSummary')}
      </p>

      {record.availability !== 'published' ? (
        <dl className="mt-6 max-w-3xl rounded-xl border bg-muted/20 p-5">
          <RecordFact breakAll label={t('formulaId')} value={record.formulaId} />
        </dl>
      ) : (
        <>
          <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <figure className="relative aspect-[8/5] self-start overflow-hidden rounded-2xl border bg-black shadow-sm">
              <FormulaRecordPreviewImage
                alt={t('previewAlt', { name: record.canonicalName })}
                fallbackSrc={record.preview.fallbackSrc}
                height={record.preview.height}
                src={record.preview.src}
                width={record.preview.width}
              />
            </figure>
            <div>
              <h3 className="text-xl font-semibold">{t('source')}</h3>
              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <RecordFact
                  label={t('language')}
                  value={record.source.languageVersion}
                />
                <RecordFact
                  label={t('stdlib')}
                  value={String(record.source.stdlibVersion)}
                />
                <RecordFact
                  label={t('profileMode')}
                  value={record.defaultProfile.mode}
                />
                <RecordFact
                  label={t('profileCenter')}
                  value={record.defaultProfile.center.join(', ')}
                />
                <RecordFact
                  label={t('profileZoom')}
                  value={String(record.defaultProfile.zoom)}
                />
                <RecordFact
                  label={t('profileIterations')}
                  value={String(record.defaultProfile.iterations)}
                />
                <RecordFact
                  label={t('profileQuality')}
                  value={record.defaultProfile.quality}
                />
              </dl>
              <div className="mt-5 rounded-xl border bg-card p-5">
                <h4 className="font-semibold">{t('parameters')}</h4>
                {record.source.parameters.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {record.source.parameters.map((parameter) => (
                      <li key={parameter.slotName}>
                        <Badge variant="outline">
                          {parameter.slotName}: {parameter.type}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t('noParameters')}
                  </p>
                )}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild>
                  <a href={record.actions.openExploreHref}>
                    {t('openExplore')}
                    <ArrowRight aria-hidden />
                  </a>
                </Button>
              </div>
            </div>
          </div>

          {sourceReference ? (
            <CanonicalSourceWorkspace
              displayName={record.canonicalName}
              reference={sourceReference}
              remixHref={record.actions.remixHref}
              variant="record"
            />
          ) : null}

          <article
            className="mt-10 rounded-2xl border bg-card p-5 sm:p-6"
            data-testid="formula-record-rights-attribution"
          >
            <h3 className="text-lg font-semibold">
              {t('sourceAndImplementation')}
            </h3>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <RecordFact
                breakAll
                label={t('formulaId')}
                value={record.formulaId}
              />
              <RecordFact
                label={t('canonicalName')}
                value={record.canonicalName}
              />
              <RecordFact
                label={t('originalName')}
                value={record.originalName}
              />
              <RecordFact
                label={t('historicalSource')}
                value={record.historicalSource.sourceProjectName}
              />
              <RecordLinkFact
                filePath={record.historicalSource.filePath}
                label={t('originalResource')}
                repositoryLabel={t('repository')}
                repositoryUrl={record.historicalSource.repositoryUrl}
                resourceUrl={record.historicalSource.resourceUrl}
              />
              <RecordFact
                label={t('currentImplementation')}
                value={t(
                  `basisValues.${record.implementationBasis ?? 'none'}`,
                )}
              />
            </dl>
            <p className="mt-6 max-w-4xl border-t pt-5 text-sm leading-6 text-muted-foreground">
              {t(`sourceNotes.${sourceNoteKey(record)}`)}
            </p>
            <div className="mt-6 border-t pt-5 sm:flex sm:items-start sm:gap-4">
              <ShieldCheck
                aria-hidden
                className="mt-0.5 size-5 shrink-0 text-primary"
              />
              <div>
                <h3 className="font-semibold">{t('takedown')}</h3>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
                  {t('takedownBody')}{' '}
                  <a className="font-medium text-primary underline" href={mailto}>
                    {record.takedown.email}
                  </a>
                </p>
              </div>
            </div>
          </article>
        </>
      )}
    </section>
  );
}

function sourceNoteKey(
  record: PublishedFormulaRecordV1,
):
  | 'fractalparkProjectOwned'
  | 'fractintDirectAdaptation'
  | 'fractintIndependentRewrite'
  | 'iteratedDynamicsIndependentRewrite' {
  if (record.historicalSource.sourceProject === 'fractalpark') {
    return 'fractalparkProjectOwned';
  }
  if (record.historicalSource.sourceProject === 'iterated-dynamics') {
    return 'iteratedDynamicsIndependentRewrite';
  }
  return record.implementationBasis === 'direct-adaptation'
    ? 'fractintDirectAdaptation'
    : 'fractintIndependentRewrite';
}

function RecordLinkFact({
  filePath,
  label,
  repositoryLabel,
  repositoryUrl,
  resourceUrl,
}: {
  readonly filePath: string;
  readonly label: string;
  readonly repositoryLabel: string;
  readonly repositoryUrl: string;
  readonly resourceUrl: string;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm leading-6">
        <a
          className="break-all font-medium text-primary underline underline-offset-4"
          href={resourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          {filePath}
        </a>
        <span aria-hidden className="mx-2 text-muted-foreground">
          ·
        </span>
        <a
          className="font-medium text-primary underline underline-offset-4"
          href={repositoryUrl}
          rel="noreferrer"
          target="_blank"
        >
          {repositoryLabel}
        </a>
      </dd>
    </div>
  );
}

function RecordFact({
  breakAll = false,
  label,
  value,
}: {
  readonly breakAll?: boolean;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-1 text-sm leading-6 ${breakAll ? 'break-all font-mono' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}
