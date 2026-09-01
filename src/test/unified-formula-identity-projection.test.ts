import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import aliasesManifest from '../../resources/formula-library/v1/legacy-formula-aliases.json';
import projectionManifest from '../../resources/formula-library/v1/source-size-projection.json';
import identityManifest from '../../resources/formula-library/v1/standard-formula-ids.json';

const FORMULA_ID_NAMESPACE = '4287abf5-af50-5f75-9d2a-f56bec9bdf2b';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function uuidBytes(value: string): Buffer {
  return Buffer.from(value.replaceAll('-', ''), 'hex');
}

function uuidV5(namespace: string, value: string): string {
  const digest = createHash('sha1')
    .update(Buffer.concat([uuidBytes(namespace), Buffer.from(value, 'utf8')]))
    .digest()
    .subarray(0, 16);

  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

function executableSourceFits(source: string): boolean {
  return Buffer.byteLength(source, 'utf8') <= 65_536;
}

describe('v0.4.19 neutral Formula ID and migration evidence', () => {
  it('publishes exactly 677 neutral UUIDv5 identities without legacy-tier fields', () => {
    expect(identityManifest.version).toBe(1);
    expect(identityManifest.scope).toBe('standard');
    expect(identityManifest.formulaIdNamespace).toBe(FORMULA_ID_NAMESPACE);
    expect(identityManifest.formulaCount).toBe(677);
    expect(identityManifest.formulas).toHaveLength(677);

    const formulaIds = identityManifest.formulas.map((entry) => entry.formulaId);
    expect(new Set(formulaIds).size).toBe(677);
    expect(formulaIds.every((formulaId) => UUID_PATTERN.test(formulaId))).toBe(true);

    for (const entry of identityManifest.formulas) {
      expect(Object.keys(entry).sort()).toEqual([
        'displayName',
        'formulaId',
        'primaryFamily',
      ]);
      expect(entry.displayName.length).toBeGreaterThan(0);
      expect(entry.primaryFamily.length).toBeGreaterThan(0);
    }

    const serialized = JSON.stringify(identityManifest);
    expect(serialized).not.toMatch(/sourceTier|legacyUnionId|license|semanticHash|sourceRevision/);
    expect(serialized).not.toMatch(/\/home\/admin|Obsidian/);
  });

  it('derives every migrated Standard ID from its typed canonical alias', () => {
    const canonicalAliases = aliasesManifest.aliases.filter(
      (alias) => alias.kind === 'f588' || alias.kind === 'b94-canonical',
    );
    expect(canonicalAliases).toHaveLength(677);

    for (const alias of canonicalAliases) {
      expect(uuidV5(FORMULA_ID_NAMESPACE, alias.value)).toBe(alias.formulaId);
    }
  });

  it('accounts for all 797 typed legacy aliases with unique reverse keys', () => {
    expect(aliasesManifest.version).toBe(1);
    expect(aliasesManifest.aliasCount).toBe(797);
    expect(aliasesManifest.counts).toEqual({
      f588: 588,
      'b94-canonical': 89,
      'b94-runtime-alias': 5,
      'runtime-id': 94,
      'guide-slug': 21,
    });
    expect(aliasesManifest.aliases).toHaveLength(797);

    const identities = new Set(identityManifest.formulas.map((entry) => entry.formulaId));
    const typedKeys = aliasesManifest.aliases.map(
      (alias) => `${alias.kind}\u0000${alias.value}`,
    );
    expect(new Set(typedKeys).size).toBe(797);
    expect(aliasesManifest.aliases.every((alias) => identities.has(alias.formulaId))).toBe(true);

    for (const [kind, expected] of Object.entries(aliasesManifest.counts)) {
      expect(aliasesManifest.aliases.filter((alias) => alias.kind === kind)).toHaveLength(expected);
    }
  });
});

describe('v0.4.19 source-size projection evidence', () => {
  it('labels all 677 values as projections and keeps them below the unified budget', () => {
    expect(projectionManifest.kind).toBe('structural-source-size-projection');
    expect(projectionManifest.measurementStatus).toBe(
      'projection-not-canonical-source-measurement',
    );
    expect(projectionManifest.parameterProjectionStatus).toBe(
      'structural-types-only-not-final-schema',
    );
    expect(projectionManifest.formulaCount).toBe(677);
    expect(projectionManifest.formulas).toHaveLength(677);
    expect(projectionManifest.sourceLimitBytes).toBe(65_536);
    expect(projectionManifest.maxStructuralBytes).toBe(457);
    expect(projectionManifest.maxProjectedUtf8Bytes).toBe(5_704);
    expect(projectionManifest.maxProjectedParameterCount).toBe(6);
    expect(projectionManifest.overLimitCount).toBe(0);

    const identityIds = new Set(identityManifest.formulas.map((entry) => entry.formulaId));
    const projectionIds = projectionManifest.formulas.map((entry) => entry.formulaId);
    expect(new Set(projectionIds)).toEqual(identityIds);

    for (const entry of projectionManifest.formulas) {
      expect(Object.keys(entry).sort()).toEqual([
        'expansionFactor',
        'formulaId',
        'metadataAllowanceBytes',
        'projectedParameterCount',
        'projectedParameterTypes',
        'projectedUtf8Bytes',
        'sourceLimitBytes',
        'structuralBytes',
      ]);
      expect(entry.expansionFactor).toBe(8);
      expect(entry.metadataAllowanceBytes).toBe(2_048);
      expect(entry.projectedUtf8Bytes).toBe(
        entry.structuralBytes * entry.expansionFactor + entry.metadataAllowanceBytes,
      );
      expect(entry.projectedUtf8Bytes).toBeLessThanOrEqual(entry.sourceLimitBytes);
      expect(entry.projectedParameterCount).toBe(entry.projectedParameterTypes.length);
      expect(entry.projectedParameterTypes.every((type) => (
        type === 'real' || type === 'complex' || type === 'function'
      ))).toBe(true);
    }

    const serialized = JSON.stringify(projectionManifest.formulas);
    expect(serialized).not.toMatch(/\/home\/admin|Obsidian|semanticHash|sourceRevision/);
    expect(serialized).not.toMatch(/init:|loop:|bailout:/);
  });

  it('enforces the 65,536/65,537 UTF-8 byte boundary exactly', () => {
    expect(executableSourceFits('a'.repeat(65_536))).toBe(true);
    expect(executableSourceFits('é'.repeat(32_768))).toBe(true);
    expect(executableSourceFits(`${'é'.repeat(32_768)}a`)).toBe(false);
  });
});
