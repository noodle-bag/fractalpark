import {
  HTML_LANG,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from '@/i18n/supported-locales';
import { parsePublishedFormulaDirectoryCategoryV1 } from '@/content/formula-directory-categories';

export type LegacyFormulaDirectoryStatusResolutionV1 =
  | Readonly<{ kind: 'pass' }>
  | Readonly<{ kind: 'redirect'; location: string }>
  | Readonly<{ kind: 'gone'; locale: SupportedLocale }>
  | Readonly<{ kind: 'not-found' }>;

const DIRECTORY_PATH = '/formulas/directory';
const GONE_COPY: Record<
  SupportedLocale,
  Readonly<{ title: string; body: string; cta: string }>
> = {
  en: {
    title: 'This directory status view is no longer available',
    body: 'Formula availability now lives on each Formula Record.',
    cta: 'Browse available formulas',
  },
  zh: {
    title: '此目录状态视图已不再提供',
    body: '公式的可用状态现在由各自的公式记录页说明。',
    cta: '浏览可用公式',
  },
  pt: {
    title: 'Esta visualização de status não está mais disponível',
    body: 'A disponibilidade agora aparece em cada registro de fórmula.',
    cta: 'Ver fórmulas disponíveis',
  },
  ko: {
    title: '이 디렉터리 상태 보기는 더 이상 제공되지 않아요',
    body: '수식의 이용 가능 여부는 이제 각 수식 기록에서 확인할 수 있어요.',
    cta: '이용 가능한 수식 보기',
  },
  ru: {
    title: 'Этот вид статуса каталога больше недоступен',
    body: 'Доступность теперь указана в карточке каждой формулы.',
    cta: 'Просмотреть доступные формулы',
  },
  es: {
    title: 'Esta vista de estado ya no está disponible',
    body: 'La disponibilidad ahora se indica en el registro de cada fórmula.',
    cta: 'Ver fórmulas disponibles',
  },
  fr: {
    title: 'Cette vue d’état n’est plus disponible',
    body: 'La disponibilité figure désormais dans la fiche de chaque formule.',
    cta: 'Parcourir les formules disponibles',
  },
};

function localeForDirectoryPath(pathname: string): SupportedLocale | undefined {
  const match = /^\/([a-z]{2})\/formulas\/directory\/?$/.exec(pathname);
  if (!match) return undefined;
  return (SUPPORTED_LOCALES as readonly string[]).includes(match[1])
    ? (match[1] as SupportedLocale)
    : undefined;
}

function singleValidQuery(
  params: URLSearchParams,
  name: string,
): string | undefined {
  const values = params.getAll(name);
  if (values.length !== 1) return undefined;
  const value = values[0].trim();
  return value.length > 0 && value.length <= 100 ? value : undefined;
}

export function resolveLegacyFormulaDirectoryStatusV1(
  input: URL,
): LegacyFormulaDirectoryStatusResolutionV1 {
  const locale = localeForDirectoryPath(input.pathname);
  if (!locale) return Object.freeze({ kind: 'pass' });
  const statuses = input.searchParams.getAll('status');
  if (statuses.length === 0) return Object.freeze({ kind: 'pass' });
  if (statuses.length !== 1) return Object.freeze({ kind: 'not-found' });

  if (statuses[0] === 'held') return Object.freeze({ kind: 'gone', locale });
  if (statuses[0] !== 'published') return Object.freeze({ kind: 'not-found' });

  const canonical = new URL(`/${locale}${DIRECTORY_PATH}`, input.origin);
  const query = singleValidQuery(input.searchParams, 'q');
  if (query) canonical.searchParams.set('q', query);
  const categoryValues = input.searchParams.getAll('category');
  const category =
    categoryValues.length === 1
      ? parsePublishedFormulaDirectoryCategoryV1(categoryValues[0])
      : undefined;
  if (category) canonical.searchParams.set('category', category);
  const sortValues = input.searchParams.getAll('sort');
  const sort = sortValues.length === 1 ? sortValues[0] : undefined;
  if (sort === 'name-asc' || sort === 'name-desc') {
    canonical.searchParams.set('sort', sort);
  }
  return Object.freeze({ kind: 'redirect', location: canonical.toString() });
}

export function renderLegacyFormulaDirectoryGoneHtmlV1(
  locale: SupportedLocale,
): string {
  const copy = GONE_COPY[locale];
  const directoryHref = `/${locale}${DIRECTORY_PATH}`;
  return `<!doctype html><html lang="${HTML_LANG[locale]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, follow"><title>${copy.title}</title></head><body><main><h1>${copy.title}</h1><p>${copy.body}</p><p><a href="${directoryHref}">${copy.cta}</a></p></main></body></html>`;
}
