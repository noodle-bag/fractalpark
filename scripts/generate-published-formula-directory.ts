import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { FORMULA_CATALOG } from '../src/engine/plugins/formula-catalog';
import { buildFormulaDefaultDocument } from '../src/lib/formula-documents';
import { PUBLISHED_FORMULA_DIRECTORY_CONTENT_HASH_V1 } from '../src/content/formula-directory-categories';

const FAMILY_ORDER = [
  'algebraic-power',
  'transcendental',
  'function-composition',
  'rational-reciprocal',
  'orbit-memory',
  'folded-absolute',
  'root-finding',
] as const;
const DIRECTORY_OUTPUT = 'public/formula-library/v1/directory/index.json';
const HELD_SEO_OUTPUT =
  'resources/formula-library/v1/held-formula-record-seo-projection.v1.json';
const UUID_V5 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;

type JsonRecord = Record<string, unknown>;

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    invariant(Number.isFinite(value), 'published-directory-non-finite');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  invariant(isRecord(value), 'published-directory-invalid-json');
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function readJson(repositoryRoot: string, relativePath: string): JsonRecord {
  const parsed = JSON.parse(
    readFileSync(join(repositoryRoot, relativePath), 'utf8'),
  ) as unknown;
  invariant(isRecord(parsed), 'published-directory-input-invalid');
  return parsed;
}

function sourceBinding(repositoryRoot: string, relativePath: string): string {
  return sha256(readFileSync(join(repositoryRoot, relativePath)));
}

function withContentHash<T extends JsonRecord>(value: T): T & { contentHash: string } {
  const normalized = JSON.parse(JSON.stringify(value)) as T;
  return { ...normalized, contentHash: sha256(canonicalJson(normalized)) };
}

function verifySelfHash(value: JsonRecord, code: string): void {
  const contentHash = value.contentHash;
  invariant(typeof contentHash === 'string' && SHA256.test(contentHash), code);
  const unsigned = { ...value };
  delete unsigned.contentHash;
  invariant(sha256(canonicalJson(unsigned)) === contentHash, code);
}

function compareRows(
  left: Readonly<{ displayName: string; formulaId: string }>,
  right: Readonly<{ displayName: string; formulaId: string }>,
): number {
  const name = left.displayName.localeCompare(right.displayName, 'en');
  return name !== 0 ? name : left.formulaId.localeCompare(right.formulaId, 'en');
}

export function buildPublishedFormulaDirectoryV1(repositoryRoot: string) {
  const inputPaths = {
    identities: 'resources/formula-library/v1/standard-formula-ids.json',
    aliases: 'resources/formula-library/v1/legacy-formula-aliases.json',
    decisions: 'resources/formula-library/v1/publication-decisions.json',
    runtime: 'public/formula-library/v1/runtime/published/index.json',
    classic: 'resources/formula-library/v1/classic-formula-exact-set.v1.json',
    catalog: 'src/engine/plugins/formula-catalog.ts',
    formulaDocuments: 'src/lib/formula-documents.ts',
  } as const;
  const identities = readJson(repositoryRoot, inputPaths.identities);
  const aliases = readJson(repositoryRoot, inputPaths.aliases);
  const decisions = readJson(repositoryRoot, inputPaths.decisions);
  const runtime = readJson(repositoryRoot, inputPaths.runtime);
  const classic = readJson(repositoryRoot, inputPaths.classic);
  verifySelfHash(classic, 'published-directory-classic-hash-invalid');

  invariant(
    identities.formulaCount === 677 && Array.isArray(identities.formulas),
    'published-directory-identities-invalid',
  );
  invariant(
    aliases.aliasCount === 797 && Array.isArray(aliases.aliases),
    'published-directory-aliases-invalid',
  );
  invariant(
    decisions.formulaCount === 677 &&
      decisions.decisionRevision === 4 &&
      typeof decisions.contentHash === 'string' &&
      Array.isArray(decisions.rows),
    'published-directory-decisions-invalid',
  );
  invariant(
    runtime.rowCount === 534 &&
      runtime.decisionRevision === decisions.decisionRevision &&
      runtime.publicationDecisionsContentHash === decisions.contentHash &&
      Array.isArray(runtime.rows),
    'published-directory-runtime-invalid',
  );
  invariant(
    classic.schema === 'fractalpark-classic-formula-exact-set/v1' &&
      classic.revision === 1 &&
      Array.isArray(classic.rows) &&
      classic.rows.length === 94,
    'published-directory-classic-invalid',
  );

  const identityById = new Map<string, JsonRecord>();
  for (const value of identities.formulas) {
    invariant(
      isRecord(value) &&
        typeof value.formulaId === 'string' &&
        UUID_V5.test(value.formulaId) &&
        typeof value.displayName === 'string' &&
        value.displayName.length > 0 &&
        typeof value.primaryFamily === 'string' &&
        (FAMILY_ORDER as readonly string[]).includes(value.primaryFamily) &&
        !identityById.has(value.formulaId),
      'published-directory-identities-invalid',
    );
    identityById.set(value.formulaId, value);
  }
  invariant(identityById.size === 677, 'published-directory-identities-invalid');

  const aliasRows = aliases.aliases.filter(isRecord);
  invariant(aliasRows.length === 797, 'published-directory-aliases-invalid');
  const b94Canonical = new Map<string, string>();
  const guideSlugById = new Map<string, string>();
  const mergedRuntimeAliases: JsonRecord[] = [];
  for (const alias of aliasRows) {
    invariant(
      typeof alias.kind === 'string' &&
        typeof alias.value === 'string' &&
        alias.value.length > 0 &&
        typeof alias.formulaId === 'string' &&
        identityById.has(alias.formulaId),
      'published-directory-aliases-invalid',
    );
    if (alias.kind === 'b94-canonical') {
      invariant(!b94Canonical.has(alias.formulaId), 'published-directory-aliases-invalid');
      b94Canonical.set(alias.formulaId, alias.value);
    }
    if (alias.kind === 'guide-slug') {
      invariant(!guideSlugById.has(alias.formulaId), 'published-directory-guides-invalid');
      guideSlugById.set(alias.formulaId, alias.value);
    }
    if (alias.kind === 'b94-runtime-alias') mergedRuntimeAliases.push(alias);
  }
  invariant(
    b94Canonical.size === 89 &&
      guideSlugById.size === 21 &&
      mergedRuntimeAliases.length === 5,
    'published-directory-aliases-invalid',
  );

  const publishedIds = new Set<string>();
  const heldIds = new Set<string>();
  for (const value of decisions.rows) {
    invariant(
      isRecord(value) &&
        typeof value.formulaId === 'string' &&
        identityById.has(value.formulaId),
      'published-directory-decisions-invalid',
    );
    if (value.publicationDecision === 'publish') publishedIds.add(value.formulaId);
    else if (value.publicationDecision === 'hold') heldIds.add(value.formulaId);
    else invariant(value.publicationDecision === 'exclude', 'published-directory-decisions-invalid');
  }
  invariant(
    publishedIds.size === 534 && heldIds.size === 143,
    'published-directory-decisions-invalid',
  );

  const runtimeIds = new Set<string>();
  for (const value of runtime.rows) {
    invariant(
      isRecord(value) &&
        typeof value.formulaId === 'string' &&
        publishedIds.has(value.formulaId) &&
        !runtimeIds.has(value.formulaId),
      'published-directory-runtime-invalid',
    );
    runtimeIds.add(value.formulaId);
  }
  invariant(
    runtimeIds.size === 534 && [...publishedIds].every((id) => runtimeIds.has(id)),
    'published-directory-runtime-invalid',
  );

  const classicIds = new Set<string>();
  let legacyCanonicalCount = 0;
  let curatedAdditionCount = 0;
  for (const value of classic.rows) {
    invariant(
      isRecord(value) &&
        typeof value.formulaId === 'string' &&
        publishedIds.has(value.formulaId) &&
        !classicIds.has(value.formulaId) &&
        typeof value.displayName === 'string' &&
        identityById.get(value.formulaId)?.displayName === value.displayName,
      'published-directory-classic-invalid',
    );
    if (value.membershipBasis === 'legacy-b94-canonical') {
      invariant(
        typeof value.legacyCanonicalAlias === 'string' &&
          b94Canonical.get(value.formulaId) === value.legacyCanonicalAlias,
        'published-directory-classic-invalid',
      );
      legacyCanonicalCount++;
    } else {
      invariant(
        value.membershipBasis === 'maintainer-curated-addition' &&
          value.legacyCanonicalAlias === null &&
          !b94Canonical.has(value.formulaId),
        'published-directory-classic-invalid',
      );
      curatedAdditionCount++;
    }
    classicIds.add(value.formulaId);
  }
  invariant(
    classicIds.size === 94 &&
      legacyCanonicalCount === 89 &&
      curatedAdditionCount === 5 &&
      [...b94Canonical].every(([id]) => classicIds.has(id)),
    'published-directory-classic-invalid',
  );
  invariant(
    [...guideSlugById.keys()].every((id) => publishedIds.has(id)),
    'published-directory-guides-invalid',
  );

  const rows = [...publishedIds]
    .map((formulaId) => {
      const identity = identityById.get(formulaId)!;
      const primaryFamily = identity.primaryFamily as string;
      return {
        formulaId,
        displayName: identity.displayName as string,
        primaryFamily,
        categories: classicIds.has(formulaId)
          ? ['classic', primaryFamily]
          : [primaryFamily],
        canonicalPath: `/formulas/${formulaId}`,
        guideSlug: guideSlugById.get(formulaId) ?? null,
      };
    })
    .sort(compareRows);

  const categoryCounts: Record<string, number> = { classic: classicIds.size };
  for (const family of FAMILY_ORDER) {
    categoryCounts[family] = rows.filter((row) => row.primaryFamily === family).length;
  }
  invariant(
    Object.values(categoryCounts).reduce((total, count) => total + count, 0) === 628 &&
      new Set(rows.map((row) => row.formulaId)).size === 534,
    'published-directory-categories-invalid',
  );

  const aliasDeepLinks = mergedRuntimeAliases
    .map((alias) => {
      const legacyRuntimeId = alias.value as string;
      const canonicalFormulaId = alias.formulaId as string;
      const metadata = FORMULA_CATALOG.find((entry) => entry.id === legacyRuntimeId);
      invariant(metadata, 'published-directory-alternate-profile-invalid');
      const document = buildFormulaDefaultDocument(legacyRuntimeId);
      return {
        legacyRuntimeId,
        canonicalFormulaId,
        canonicalPath: `/formulas/${canonicalFormulaId}`,
        alternateProfile: {
          schema: 'fractalpark-classic-alternate-profile/v1',
          authority: 'legacy-formula-catalog',
          bounds: document.scene.bounds,
          formula: {
            isJulia: document.formula.isJulia,
            juliaC: document.formula.juliaC,
            power: document.formula.power,
            params: document.formula.params,
          },
          coloring: document.coloring,
          iterations: document.render.maxIterations,
        },
      };
    })
    .sort((left, right) => left.legacyRuntimeId.localeCompare(right.legacyRuntimeId, 'en'));
  invariant(aliasDeepLinks.length === 5, 'published-directory-alternate-profile-invalid');

  const sourceBindings = Object.fromEntries(
    Object.entries(inputPaths).map(([name, path]) => [
      name,
      { path, sha256: sourceBinding(repositoryRoot, path) },
    ]),
  );
  const directory = withContentHash({
    schema: 'fractalpark-published-formula-directory/v1',
    revision: 1,
    authority: {
      decisionRevision: decisions.decisionRevision,
      publicationDecisionsContentHash: decisions.contentHash,
      classicExactSetContentHash: classic.contentHash,
    },
    sourceBindings,
    counts: {
      published: 534,
      classic: 94,
      guides: 21,
      categoryMemberships: 628,
    },
    categoryOrder: ['classic', ...FAMILY_ORDER],
    categoryCounts,
    rows,
    aliasDeepLinks,
  });

  const heldRows = [...heldIds]
    .map((formulaId) => {
      const identity = identityById.get(formulaId)!;
      return {
        formulaId,
        displayName: identity.displayName as string,
        canonicalPath: `/formulas/${formulaId}`,
        httpStatus: 200,
        robots: 'noindex, follow',
        canonical: 'self',
        sitemap: false,
        hreflang: false,
        publicSource: false,
        publicActions: false,
      };
    })
    .sort(compareRows);
  const heldSeo = withContentHash({
    schema: 'fractalpark-held-formula-record-seo-projection/v1',
    revision: 1,
    authority: {
      decisionRevision: decisions.decisionRevision,
      publicationDecisionsContentHash: decisions.contentHash,
    },
    sourceBindings: {
      identities: sourceBindings.identities,
      decisions: sourceBindings.decisions,
    },
    rowCount: 143,
    rows: heldRows,
  });

  return Object.freeze({ directory, heldSeo });
}

function serialized(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function generatePublishedFormulaDirectoryV1(
  repositoryRoot: string,
  write: boolean,
): Readonly<{ directoryBytes: number; heldSeoBytes: number }> {
  const built = buildPublishedFormulaDirectoryV1(repositoryRoot);
  invariant(
    built.directory.contentHash === PUBLISHED_FORMULA_DIRECTORY_CONTENT_HASH_V1,
    'published-directory-content-hash-anchor-stale',
  );
  const outputs = [
    [DIRECTORY_OUTPUT, serialized(built.directory)],
    [HELD_SEO_OUTPUT, serialized(built.heldSeo)],
  ] as const;
  for (const [relativePath, output] of outputs) {
    const path = join(repositoryRoot, relativePath);
    if (write) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, output, 'utf8');
    }
    else invariant(readFileSync(path, 'utf8') === output, 'published-directory-stale');
  }
  return Object.freeze({
    directoryBytes: Buffer.byteLength(outputs[0][1]),
    heldSeoBytes: Buffer.byteLength(outputs[1][1]),
  });
}

async function main(): Promise<void> {
  const result = generatePublishedFormulaDirectoryV1(
    process.cwd(),
    process.argv.includes('--write'),
  );
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
