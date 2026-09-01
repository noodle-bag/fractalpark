import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import {
  PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1,
  PUBLISHED_FORMULA_DIRECTORY_COUNT_V1,
  PUBLISHED_FORMULA_DIRECTORY_FAMILIES_V1,
  PUBLISHED_FORMULA_DIRECTORY_V1,
  filterPublishedFormulaDirectoryV1,
  parsePublishedFormulaDirectoryCategoryV1,
  type PublishedFormulaDirectoryCategoryV1,
  type PublishedFormulaDirectoryFamilyV1,
  type PublishedFormulaDirectoryRowV1,
} from '@/content/published-formula-directory';
import { Link } from '@/i18n/routing';
import { OG_LOCALE, type SupportedLocale } from '@/i18n/supported-locales';
import { renderJsonLd } from '@/lib/json-ld';
import { SITE, buildLocaleAlternates } from '@/lib/site';
import { buildFormulaCanonicalPathV1 } from '@/lib/formula-routes';

const DIRECTORY_PATH = '/formulas/directory';

type DirectorySortV1 = 'name-asc' | 'name-desc';
type DirectorySearchParams = { category?: string; q?: string; sort?: string };

function parseCategory(
  value: string | undefined,
): PublishedFormulaDirectoryCategoryV1 | undefined {
  return parsePublishedFormulaDirectoryCategoryV1(value);
}

function parseQuery(value: string | undefined): string | undefined {
  const query = value?.trim();
  return query && query.length <= 100 ? query : undefined;
}

function parseSort(value: string | undefined): DirectorySortV1 {
  return value === 'name-desc' ? value : 'name-asc';
}

function directoryHref(
  category: PublishedFormulaDirectoryCategoryV1 | undefined,
  options: Readonly<{ query?: string; sort: DirectorySortV1 }>,
): string {
  const params = new URLSearchParams();
  if (options.query) params.set('q', options.query);
  if (category) params.set('category', category);
  if (options.sort !== 'name-asc') params.set('sort', options.sort);
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
    description: t('description', { count: PUBLISHED_FORMULA_DIRECTORY_COUNT_V1 }),
    alternates: {
      canonical: `/${locale}${DIRECTORY_PATH}`,
      languages: buildLocaleAlternates(DIRECTORY_PATH),
    },
    openGraph: {
      title: t('title'),
      description: t('description', { count: PUBLISHED_FORMULA_DIRECTORY_COUNT_V1 }),
      url: `${SITE.url}/${locale}${DIRECTORY_PATH}`,
      siteName: SITE.name,
      locale: OG_LOCALE[locale as SupportedLocale] ?? OG_LOCALE.en,
      type: 'website',
    },
  };
}

function groupByFamily(
  entries: readonly PublishedFormulaDirectoryRowV1[],
): ReadonlyMap<PublishedFormulaDirectoryFamilyV1, PublishedFormulaDirectoryRowV1[]> {
  const groups = new Map<
    PublishedFormulaDirectoryFamilyV1,
    PublishedFormulaDirectoryRowV1[]
  >();
  for (const family of PUBLISHED_FORMULA_DIRECTORY_FAMILIES_V1) groups.set(family, []);
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
  const category = parseCategory(raw.category);
  const query = parseQuery(raw.q);
  const sort = parseSort(raw.sort);
  const categoryEntries = filterPublishedFormulaDirectoryV1(category);
  const entries = [...categoryEntries]
    .filter((entry) =>
      query
        ? entry.displayName.toLocaleLowerCase('en').includes(query.toLocaleLowerCase('en'))
        : true,
    )
    .sort((left, right) =>
      sort === 'name-desc'
        ? right.displayName.localeCompare(left.displayName, 'en')
        : left.displayName.localeCompare(right.displayName, 'en'),
    );
  const categoryFacets = PUBLISHED_FORMULA_DIRECTORY_CATEGORIES_V1.map((value) => ({
    value,
    count: PUBLISHED_FORMULA_DIRECTORY_V1.categoryCounts[value],
  }));
  const groups = groupByFamily(entries);
  const directoryUrl = `${SITE.url}/${locale}${DIRECTORY_PATH}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t('title'),
    description: t('description', { count: PUBLISHED_FORMULA_DIRECTORY_COUNT_V1 }),
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
            {t('intro', { count: PUBLISHED_FORMULA_DIRECTORY_COUNT_V1 })}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 pt-12 sm:px-8">
        <section aria-labelledby="facets-heading">
          <h2 className="text-lg font-semibold" id="facets-heading">
            {t('facets.categoryTitle')}
          </h2>

          <div className="mt-6 space-y-6">
            <form
              action={`/${locale}${DIRECTORY_PATH}`}
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,auto)_auto]"
              method="get"
            >
              {category ? <input name="category" type="hidden" value={category} /> : null}
              <label className="grid gap-2 text-sm font-medium">
                {t('searchLabel')}
                <input
                  className="h-10 rounded-md border bg-background px-3 font-normal"
                  defaultValue={query}
                  maxLength={100}
                  name="q"
                  placeholder={t('searchPlaceholder')}
                  type="search"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                {t('sortLabel')}
                <select
                  className="h-10 rounded-md border bg-background px-3 font-normal"
                  defaultValue={sort}
                  name="sort"
                >
                  <option value="name-asc">{t('sort.nameAsc')}</option>
                  <option value="name-desc">{t('sort.nameDesc')}</option>
                </select>
              </label>
              <button
                className="self-end rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                type="submit"
              >
                {t('apply')}
              </button>
            </form>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">
                {t('facets.category')}
              </h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                <li>
                  <FacetLink
                    active={category === undefined}
                    href={directoryHref(undefined, { query, sort })}
                    label={t('facets.all')}
                  />
                </li>
                {categoryFacets.map((facet) => (
                  <li key={facet.value}>
                    <FacetLink
                      active={category === facet.value}
                      count={facet.count}
                      href={directoryHref(facet.value, { query, sort })}
                      label={
                        facet.value === 'classic'
                          ? t('category.classic')
                          : t(`family.${facet.value}`)
                      }
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
                      className="min-w-0 truncate font-medium hover:underline"
                      href={buildFormulaCanonicalPathV1(entry.formulaId)}
                    >
                      {entry.displayName}
                    </Link>
                    {entry.guideSlug ? (
                      <Badge className="shrink-0" variant="secondary">
                        {t('guideBadge')}
                      </Badge>
                    ) : null}
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
