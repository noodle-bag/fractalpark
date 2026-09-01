import heldSeoAsset from '../../resources/formula-library/v1/held-formula-record-seo-projection.v1.json';
import { routing } from '@/i18n/routing';

const UUID_V5 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LOCALES = new Set<string>(routing.locales);
const raw = heldSeoAsset as unknown as {
  readonly rowCount?: unknown;
  readonly rows?: unknown;
};

function loadHeldFormulaIds(): ReadonlySet<string> {
  if (raw.rowCount !== 143 || !Array.isArray(raw.rows) || raw.rows.length !== 143) {
    throw new Error('held-formula-route-set-invalid');
  }
  const ids = new Set<string>();
  for (const value of raw.rows) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      typeof (value as { formulaId?: unknown }).formulaId !== 'string'
    ) {
      throw new Error('held-formula-route-set-invalid');
    }
    const formulaId = (value as { formulaId: string }).formulaId;
    if (!UUID_V5.test(formulaId) || ids.has(formulaId)) {
      throw new Error('held-formula-route-set-invalid');
    }
    ids.add(formulaId);
  }
  return ids;
}

const HELD_FORMULA_IDS = loadHeldFormulaIds();

export function isHeldFormulaRecordPathV1(pathname: string): boolean {
  const segments = pathname.split('/');
  return (
    segments.length === 4 &&
    segments[0] === '' &&
    LOCALES.has(segments[1]) &&
    segments[2] === 'formulas' &&
    HELD_FORMULA_IDS.has(segments[3])
  );
}
