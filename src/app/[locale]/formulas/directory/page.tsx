import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import {
  FORMULA_DIRECTORY_FAMILIES_V1,
  buildFormulaDirectoryFacetsV1,
  filterFormulaDirectoryV1,
  type FormulaDirectoryEntryV1,
  type FormulaDirectoryFamilyV1,
} from '@/engine/formulas/v1/directory';
import type { FormulaPublicationDecisionV1 } from '@/engine/formulas/v1/publication-decisions';
import { Link } from '@/i18n/routing';
import { OG_LOCALE, type SupportedLocale } from '@/i18n/supported-locales';
import { renderJsonLd } from '@/lib/json-ld';
import { SITE, buildLocaleAlternates } from '@/lib/site';
import { buildFormulaCanonicalPathV1 } from '@/lib/formula-routes';

const DIRECTORY_PATH = '/formulas/directory';

type DirectorySearchParams = { family?: string; status?: string };

function parseFamily(value: string | undefined): FormulaDirectoryFamilyV1 | undefined {
  return (FORMULA_DIRECTORY_FAMILIES_V1 as readonly string[]).includes(value ?? '')
    ? (value as FormulaDirectoryFamilyV1)
    : undefined;
}

function parseStatus(value: string | undefined): FormulaPublicationDecisionV1 | undefined {
  return value === 'publish' || value === 'hold' || value === 'exclude'
    ? value
    : undefined;
}

function directoryHref(
  family: FormulaDirectoryFamilyV1 | undefined,
  status: FormulaPublicationDecisionV1 | undefined,
): string {
  const params = new URLSearchParams();
  if (family) params.set('family', family);
  if (status) params.set('status', status);
  const query = params.toString();
  return query ? `${DIRECTORY_PATH}?${query}` : DIRECTORY_PATH;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'formulas.directory' });

  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `/${locale}${DIRECTORY_PATH}`,
      languages: buildLocaleAlternates(DIRECTORY_PATH),
    },
    openGraph: {
      title: t('title'),
      description: t('description'),
      url: `${SITE.url}/${locale}${DIRECTORY_PATH}`,
      siteName: SITE.name,
      locale: OG_LOCALE[locale as SupportedLocale] ?? OG_LOCALE.en,
      type: 'website',
    },
  };
}

function groupByFamily(
  entries: readonly FormulaDirectoryEntryV1[],
): ReadonlyMap<FormulaDirectoryFamilyV1, FormulaDirectoryEntryV1[]> {
  const groups = new Map<FormulaDirectoryFamilyV1, FormulaDirectoryEntryV1[]>();
  for (const family of FORMULA_DIRECTORY_FAMILIES_V1) groups.set(family, []);
  for (const entry of entries) groups.get(entry.primaryFamily)?.push(entry);
  return groups;
}

export default async function FormulaDirectoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<DirectorySearchParams>;
}) {
  const { locale } = await params;
  const raw = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'formulas.directory' });
  const family = parseFamily(raw.family);
  const status = parseStatus(raw.status);
  const entries = filterFormulaDirectoryV1({ family, decision: status });
  const facets = buildFormulaDirectoryFacetsV1();
  const groups = groupByFamily(entries);
  const directoryUrl = `${SITE.url}/${locale}${DIRECTORY_PATH}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t('title'),
    description: t('description'),
    url: directoryUrl,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: t('breadcrumbAtlas'),
          item: `${SITE.url}/${locale}/formulas`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: t('breadcrumb'),
          item: directoryUrl,
        },
      ],
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: entries.length,
    },
  };

  return (
    <main className="pb-24">
      <script
        dangerouslySetInnerHTML={{ __html: renderJsonLd(jsonLd) }}
        type="application/ld+json"
      />

      <header className="border-b bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16">
          <nav
            aria-label={t('breadcrumbLabel')}
            className="mb-8 text-sm text-muted-foreground"
          >
            <Link className="hover:text-foreground" href="/formulas">
              {t('breadcrumbAtlas')}
            </Link>
            <span className="mx-2">/</span>
            <span>{t('breadcrumb')}</span>
          </nav>
          <Badge variant="outline">{t('eyebrow')}</Badge>
          <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            {t('title')}
          </h1>
          <p className="mt-6 max-w-3xl text-pretty text-lg leading-8 text-muted-foreground">
            {t('intro')}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 pt-12 sm:px-8">
        <section aria-labelledby="facets-heading">
          <h2 className="text-lg font-semibold" id="facets-heading">
            {t('facets.title')}
          </h2>

          <div className="mt-6 space-y-6">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">
                {t('facets.family')}
              </h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                <li>
                  <FacetLink
                    active={family === undefined}
                    href={directoryHref(undefined, status)}
                    label={t('facets.all')}
                  />
                </li>
                {facets.families.map((facet) => (
                  <li key={facet.value}>
                    <FacetLink
                      active={family === facet.value}
                      count={facet.count}
                      href={directoryHref(
                        facet.value as FormulaDirectoryFamilyV1,
                        status,
                      )}
                      label={t(`family.${facet.value}`)}
                    />
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-medium text-muted-foreground">
                {t('facets.status')}
              </h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                <li>
                  <FacetLink
                    active={status === undefined}
                    href={directoryHref(family, undefined)}
                    label={t('facets.all')}
                  />
                </li>
                {facets.decisions.map((facet) => (
                  <li key={facet.value}>
                    <FacetLink
                      active={status === facet.value}
                      count={facet.count}
                      href={directoryHref(
                        family,
                        facet.value as FormulaPublicationDecisionV1,
                      )}
                      label={t(`status.${facet.value}`)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-8 text-sm text-muted-foreground">
            {t('resultCount', { count: entries.length })}
          </p>
        </section>

        {[...groups.entries()].map(([groupFamily, rows]) =>
          rows.length === 0 ? null : (
            <section
              aria-labelledby={`directory-family-${groupFamily}`}
              className="mt-12"
              key={groupFamily}
            >
              <h2
                className="flex items-baseline gap-3 text-xl font-semibold"
                id={`directory-family-${groupFamily}`}
              >
                {t(`family.${groupFamily}`)}
                <span className="text-sm font-normal tabular-nums text-muted-foreground">
                  {rows.length}
                </span>
              </h2>
              <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map((entry) => (
                  <li
                    className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"
                    data-formula-id={entry.formulaId}
                    key={entry.formulaId}
                  >
                    <Link
                      className="truncate font-medium hover:underline"
                      href={buildFormulaCanonicalPathV1(entry.formulaId)}
                    >
                      {entry.displayName}
                    </Link>
                    <StatusBadge
                      decision={entry.publicationDecision}
                      label={t(`status.${entry.publicationDecision}`)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ),
        )}
      </div>
    </main>
  );
}

function FacetLink({
  active,
  count,
  href,
  label,
}: {
  active: boolean;
  count?: number;
  href: string;
  label: string;
}) {
  return (
    <Link
      aria-current={active ? 'true' : undefined}
      className={
        active
          ? 'inline-flex items-center gap-1.5 rounded-full border border-foreground bg-foreground px-3.5 py-1.5 text-sm text-background'
          : 'inline-flex items-center gap-1.5 rounded-full border bg-card px-3.5 py-1.5 text-sm transition-colors hover:border-foreground/30 hover:bg-muted/20'
      }
      href={href}
    >
      {label}
      {count !== undefined ? (
        <span className="tabular-nums opacity-70">{count}</span>
      ) : null}
    </Link>
  );
}

function StatusBadge({
  decision,
  label,
}: {
  decision: FormulaPublicationDecisionV1;
  label: string;
}) {
  const className =
    decision === 'publish'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : 'border-muted-foreground/30 bg-muted/40 text-muted-foreground';
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${className}`}
    >
      {label}
    </span>
  );
}
