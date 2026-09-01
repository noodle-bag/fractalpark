import { BookOpen, Code2, FlaskConical, ListChecks, ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { TeachingContentResolutionV1 } from '@/content/teaching/content-loader';

interface TeachingContentPanelProps {
  readonly includeOverview?: boolean;
  readonly locale: string;
  readonly resolution: TeachingContentResolutionV1;
}

export async function TeachingContentPanel({
  includeOverview = true,
  locale,
  resolution,
}: TeachingContentPanelProps) {
  if (resolution.delivery === 'not-delivered') return null;
  const t = await getTranslations({ locale, namespace: 'formulas.teaching' });
  const localized =
    resolution.delivery === 'delivered' ? resolution.localized : null;
  const english = resolution.english;
  const experiment = localized?.parameterExperiment ?? english.parameterExperiment;
  const exercise = localized?.exercise ?? english.exercise;
  const walkthrough = english.sourceWalkthrough.map((item) => ({
    ...item,
    explanation:
      localized?.sourceWalkthrough[item.annotationId] ?? item.explanation,
  }));
  const syntaxFeatures = english.syntaxFeatures.map((item) => ({
    ...item,
    explanation: localized?.syntaxFeatures[item.featureId] ?? item.explanation,
  }));

  return (
    <section
      className="mx-auto max-w-6xl px-5 pt-16 sm:px-8"
      data-content-locale={resolution.contentLocale}
      data-teaching-delivery={resolution.delivery}
    >
      {resolution.delivery === 'fallback-browse-only' ? (
        <aside
          className="mb-8 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-6"
          data-testid="teaching-fallback-notice"
        >
          {t('fallbackNotice')}
        </aside>
      ) : null}
      <div
        className="space-y-14"
        lang={resolution.contentLocale === locale ? undefined : resolution.contentLocale}
      >
        {includeOverview ? (
          <TeachingSection
            icon={<BookOpen aria-hidden />}
            id="teaching-overview"
            title={t('sections.overview')}
          >
            <p className="max-w-4xl text-lg leading-8 text-muted-foreground">
              {localized?.overview ?? english.overview}
            </p>
          </TeachingSection>
        ) : null}

        <TeachingSection
          icon={<Code2 aria-hidden />}
          id="source-walkthrough"
          title={t('sections.sourceWalkthrough')}
        >
          <ol className="space-y-4">
            {walkthrough.map((item) => (
              <li className="rounded-xl border bg-card p-5" key={item.annotationId}>
                <code className="break-all text-xs text-muted-foreground">
                  {item.nodeId}
                </code>
                <p className="mt-3 leading-7">{item.explanation}</p>
              </li>
            ))}
          </ol>
        </TeachingSection>

        <TeachingSection
          icon={<Code2 aria-hidden />}
          id="syntax-features"
          title={t('sections.syntaxFeatures')}
        >
          <div className="grid gap-4 md:grid-cols-2">
            {syntaxFeatures.map((feature) => (
              <article className="rounded-xl border bg-card p-5" key={feature.featureId}>
                <code className="text-sm font-semibold">{feature.featureId}</code>
                <p className="mt-3 leading-7 text-muted-foreground">
                  {feature.explanation}
                </p>
              </article>
            ))}
          </div>
        </TeachingSection>

        <TeachingSection
          icon={<FlaskConical aria-hidden />}
          id="parameter-experiment"
          title={t('sections.parameterExperiment')}
        >
          <div className="rounded-xl border bg-muted/20 p-5 sm:p-6">
            {english.parameterExperiment.parameterSymbols.length > 0 ? (
              <div className="mb-5 flex flex-wrap gap-2">
                {english.parameterExperiment.parameterSymbols.map((symbol) => (
                  <code className="rounded bg-muted px-2 py-1 text-sm" key={symbol}>
                    {symbol}
                  </code>
                ))}
              </div>
            ) : null}
            <h3 className="font-semibold">{t('labels.steps')}</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 leading-7 text-muted-foreground">
              {experiment.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
            <h3 className="mt-6 font-semibold">{t('labels.expectedObservation')}</h3>
            <p className="mt-2 leading-7 text-muted-foreground">
              {experiment.expectedObservation}
            </p>
            {experiment.safetyNote ? (
              <>
                <h3 className="mt-6 font-semibold">{t('labels.safetyNote')}</h3>
                <p className="mt-2 leading-7 text-muted-foreground">
                  {experiment.safetyNote}
                </p>
              </>
            ) : null}
          </div>
        </TeachingSection>

        <TeachingSection
          icon={<ListChecks aria-hidden />}
          id="teaching-exercise"
          title={t('sections.exercise')}
        >
          <div className="rounded-xl border bg-card p-5 sm:p-6">
            <p className="text-lg leading-8">{exercise.prompt}</p>
            <h3 className="mt-6 font-semibold">{t('labels.completionCheck')}</h3>
            <p className="mt-2 leading-7 text-muted-foreground">
              {exercise.completionCheck}
            </p>
            {'hint' in exercise && exercise.hint ? (
              <>
                <h3 className="mt-6 font-semibold">{t('labels.hint')}</h3>
                <p className="mt-2 leading-7 text-muted-foreground">{exercise.hint}</p>
              </>
            ) : null}
          </div>
        </TeachingSection>

        <TeachingSection
          icon={<ShieldCheck aria-hidden />}
          id="teaching-provenance"
          title={t('sections.provenance')}
        >
          <div className="space-y-3 break-words rounded-xl border bg-muted/20 p-5 text-sm leading-6 text-muted-foreground sm:p-6">
            <p>
              {localized?.factsPresentation.provenanceLead ??
                english.facts.provenanceStatement}
            </p>
            <p>
              {localized?.factsPresentation.rightsLead ?? english.facts.rightsStatement}
            </p>
          </div>
        </TeachingSection>
      </div>
    </section>
  );
}

function TeachingSection({
  children,
  icon,
  id,
  title,
}: {
  readonly children: React.ReactNode;
  readonly icon: React.ReactNode;
  readonly id: string;
  readonly title: string;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} id={id}>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-primary [&>svg]:size-5">
          {icon}
        </span>
        <h2 className="text-2xl font-semibold tracking-tight" id={`${id}-heading`}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}
