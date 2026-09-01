import identityManifest from "../../../../resources/formula-library/v1/standard-formula-ids.json";
import aliasManifest from "../../../../resources/formula-library/v1/legacy-formula-aliases.json";
import { FORMULA_ID_NAMESPACE_V1, isStandardFormulaIdV1 } from "./identity";
import type { FormulaAliasKindV1, FormulaIdV1 } from "./types";

const KINDS = Object.freeze([
  "f588",
  "b94-canonical",
  "b94-runtime-alias",
  "runtime-id",
  "guide-slug",
] as const satisfies readonly FormulaAliasKindV1[]);
const CANONICAL_ALIAS_KINDS = new Set<FormulaAliasKindV1>([
  "f588",
  "b94-canonical",
]);
const EXPECTED_COUNTS = Object.freeze({
  f588: 588,
  "b94-canonical": 89,
  "b94-runtime-alias": 5,
  "runtime-id": 94,
  "guide-slug": 21,
} satisfies Readonly<Record<FormulaAliasKindV1, number>>);

export interface LegacyAliasV1 {
  readonly kind: FormulaAliasKindV1;
  readonly value: string;
  readonly formulaId: FormulaIdV1;
}

export interface StandardAliasAuditEntryV1 {
  readonly formulaId: FormulaIdV1;
  readonly aliases: readonly LegacyAliasV1[];
}

export interface StandardManifestIndexV1 {
  readonly formulaIds: readonly FormulaIdV1[];
  readonly aliasCount: 797;
  readonly counts: Readonly<Record<FormulaAliasKindV1, number>>;
  hasFormulaId(formulaId: unknown): formulaId is FormulaIdV1;
  resolveAlias(
    kind: FormulaAliasKindV1,
    value: string,
  ): FormulaIdV1 | undefined;
  aliasesFor(formulaId: FormulaIdV1): readonly LegacyAliasV1[];
  audit(): readonly StandardAliasAuditEntryV1[];
}

export type StandardManifestBuildResultV1 =
  | { readonly ok: true; readonly index: StandardManifestIndexV1 }
  | { readonly ok: false; readonly code: "invalid-standard-manifest" };

function record(value: unknown): value is Record<string, unknown> {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Reflect.ownKeys(value).every((key) => {
      if (typeof key !== "string") return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return Boolean(descriptor?.enumerable && "value" in descriptor);
    });
  } catch {
    return false;
  }
}

function denseArray(value: unknown): value is readonly unknown[] {
  try {
    if (!Array.isArray(value)) return false;
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !("value" in descriptor)) return false;
    }
    return Reflect.ownKeys(value).every(
      (key) =>
        key === "length" ||
        (typeof key === "string" &&
          /^(?:0|[1-9]\d*)$/.test(key) &&
          Number(key) < value.length),
    );
  } catch {
    return false;
  }
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    Reflect.ownKeys(value).length === actual.length &&
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

export function isFormulaAliasKindV1(
  value: unknown,
): value is FormulaAliasKindV1 {
  return (
    typeof value === "string" && KINDS.includes(value as FormulaAliasKindV1)
  );
}

function aliasKey(kind: FormulaAliasKindV1, value: string): string {
  return JSON.stringify([kind, value]);
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Validates public identity/alias indexes only. It does not assert that canonical
 * source, Profiles, Records, previews, or runtime artifacts exist.
 */
export function createStandardManifestIndexV1(
  identities: unknown = identityManifest,
  aliases: unknown = aliasManifest,
): StandardManifestBuildResultV1 {
  const invalid = (): StandardManifestBuildResultV1 => ({
    ok: false,
    code: "invalid-standard-manifest",
  });
  if (!record(identities) || !record(aliases)) return invalid();
  if (
    !exactKeys(identities, [
      "version",
      "scope",
      "formulaIdNamespace",
      "formulaCount",
      "formulas",
    ]) ||
    identities.version !== 1 ||
    identities.scope !== "standard" ||
    identities.formulaIdNamespace !== FORMULA_ID_NAMESPACE_V1 ||
    identities.formulaCount !== 677 ||
    !denseArray(identities.formulas) ||
    identities.formulas.length !== 677
  )
    return invalid();
  if (
    !exactKeys(aliases, ["version", "aliasCount", "counts", "aliases"]) ||
    aliases.version !== 1 ||
    aliases.aliasCount !== 797 ||
    !denseArray(aliases.aliases) ||
    aliases.aliases.length !== 797 ||
    !record(aliases.counts) ||
    !exactKeys(aliases.counts, KINDS)
  )
    return invalid();

  const formulaIds = new Set<FormulaIdV1>();
  for (const entry of identities.formulas) {
    if (
      !record(entry) ||
      !exactKeys(entry, ["formulaId", "displayName", "primaryFamily"]) ||
      !isStandardFormulaIdV1(entry.formulaId) ||
      typeof entry.displayName !== "string" ||
      entry.displayName.length === 0 ||
      typeof entry.primaryFamily !== "string" ||
      entry.primaryFamily.length === 0 ||
      formulaIds.has(entry.formulaId)
    )
      return invalid();
    formulaIds.add(entry.formulaId);
  }

  const aliasesByKey = new Map<string, FormulaIdV1>();
  const reverse = new Map<FormulaIdV1, LegacyAliasV1[]>();
  const canonicalCounts = new Map<FormulaIdV1, number>();
  const counts: Record<FormulaAliasKindV1, number> = {
    f588: 0,
    "b94-canonical": 0,
    "b94-runtime-alias": 0,
    "runtime-id": 0,
    "guide-slug": 0,
  };
  for (const entry of aliases.aliases) {
    if (
      !record(entry) ||
      !exactKeys(entry, ["kind", "value", "formulaId"]) ||
      !isFormulaAliasKindV1(entry.kind) ||
      typeof entry.value !== "string" ||
      entry.value.length === 0 ||
      !isStandardFormulaIdV1(entry.formulaId) ||
      !formulaIds.has(entry.formulaId)
    )
      return invalid();
    const key = aliasKey(entry.kind, entry.value);
    if (aliasesByKey.has(key)) return invalid();
    const alias = Object.freeze({
      kind: entry.kind,
      value: entry.value,
      formulaId: entry.formulaId,
    });
    aliasesByKey.set(key, entry.formulaId);
    counts[entry.kind]++;
    const list = reverse.get(entry.formulaId) ?? [];
    list.push(alias);
    reverse.set(entry.formulaId, list);
    if (CANONICAL_ALIAS_KINDS.has(entry.kind))
      canonicalCounts.set(
        entry.formulaId,
        (canonicalCounts.get(entry.formulaId) ?? 0) + 1,
      );
  }
  for (const kind of KINDS) {
    if (
      counts[kind] !== EXPECTED_COUNTS[kind] ||
      aliases.counts[kind] !== EXPECTED_COUNTS[kind]
    )
      return invalid();
  }
  for (const formulaId of formulaIds)
    if (canonicalCounts.get(formulaId) !== 1) return invalid();

  const frozenFormulaIds = Object.freeze(
    [...formulaIds].sort(compareAscii),
  ) as readonly FormulaIdV1[];
  const frozenReverse = new Map<FormulaIdV1, readonly LegacyAliasV1[]>();
  for (const [formulaId, list] of reverse) {
    frozenReverse.set(
      formulaId,
      Object.freeze(
        [...list].sort((left, right) =>
          compareAscii(
            aliasKey(left.kind, left.value),
            aliasKey(right.kind, right.value),
          ),
        ),
      ),
    );
  }
  const audit = Object.freeze(
    frozenFormulaIds.map((formulaId) =>
      Object.freeze({
        formulaId,
        aliases: frozenReverse.get(formulaId) ?? Object.freeze([]),
      }),
    ),
  );
  const index: StandardManifestIndexV1 = Object.freeze({
    formulaIds: frozenFormulaIds,
    aliasCount: 797 as const,
    counts: EXPECTED_COUNTS,
    hasFormulaId(formulaId: unknown): formulaId is FormulaIdV1 {
      return isStandardFormulaIdV1(formulaId) && formulaIds.has(formulaId);
    },
    resolveAlias(kind: FormulaAliasKindV1, value: string) {
      if (!isFormulaAliasKindV1(kind) || typeof value !== "string")
        return undefined;
      return aliasesByKey.get(aliasKey(kind, value));
    },
    aliasesFor(formulaId: FormulaIdV1) {
      return frozenReverse.get(formulaId) ?? Object.freeze([]);
    },
    audit() {
      return audit;
    },
  });
  return { ok: true, index };
}

const standardManifestBuild = createStandardManifestIndexV1();
if (standardManifestBuild.ok === false)
  throw new Error(standardManifestBuild.code);
export const STANDARD_MANIFEST_INDEX_V1 = standardManifestBuild.index;

export function resolveStandardAliasV1(
  kind: FormulaAliasKindV1,
  value: string,
  index: StandardManifestIndexV1 = STANDARD_MANIFEST_INDEX_V1,
): FormulaIdV1 | undefined {
  return index.resolveAlias(kind, value);
}

export function auditStandardAliasesV1(
  index: StandardManifestIndexV1 = STANDARD_MANIFEST_INDEX_V1,
): readonly StandardAliasAuditEntryV1[] {
  return index.audit();
}
