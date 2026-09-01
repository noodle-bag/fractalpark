import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateTeachingContentRegistryV1 } from '../../scripts/generate-teaching-content-registry';
import anchorAsset from '../../resources/formula-library/v1/teaching-semantic-anchors.v1.json';
import heldAsset from '../../resources/formula-library/v1/teaching-held-guide-appendix.v1.json';
import ledgerAsset from '../../resources/formula-library/v1/teaching-review-ledger.v1.json';
import selectionAsset from '../../resources/formula-library/v1/teaching-selection.v1.json';
import runtimeIndexAsset from '../../public/formula-library/v1/runtime/published/index.json';
import {
  TEACHING_ANCHORS_RAW_V1,
  TEACHING_APPROVAL_PACKET_RAW_V1,
  TEACHING_APPROVAL_RAW_V1,
  TEACHING_AUTHORITY_REBIND_RAW_V1,
  TEACHING_CONTENT_LOCALES_V1,
  TEACHING_CONTENT_REGISTRY_V1,
  TEACHING_LEDGER_RAW_V1,
  TEACHING_RUNTIME_INDEX_RAW_V1,
  TEACHING_SELECTION_RAW_V1,
} from '@/content/teaching/generated-content-registry';
import {
  loadTeachingContentV1,
  resolveDeliveredTeachingLocalesFromAssetsV1,
  resolveTeachingContentFromAssetsV1,
  type TeachingContentAssetsV1,
} from '@/content/teaching/content-loader';
import {
  filterTeachingAlternatesAtCommit20dV1,
  isTeachingPageIndexableAtCommit20dV1,
} from '@/content/teaching/guide-route-policy';
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from '@/engine/formulas/v1/revisions';

const assets: TeachingContentAssetsV1 = {
  selection: selectionAsset,
  selectionRaw: TEACHING_SELECTION_RAW_V1,
  anchors: anchorAsset,
  anchorsRaw: TEACHING_ANCHORS_RAW_V1,
  runtimeIndex: runtimeIndexAsset,
  runtimeIndexRaw: TEACHING_RUNTIME_INDEX_RAW_V1,
  ledger: ledgerAsset,
  ledgerRaw: TEACHING_LEDGER_RAW_V1,
  approval: JSON.parse(TEACHING_APPROVAL_RAW_V1) as unknown,
  approvalRaw: TEACHING_APPROVAL_RAW_V1,
  approvalPacket: JSON.parse(TEACHING_APPROVAL_PACKET_RAW_V1) as unknown,
  approvalPacketRaw: TEACHING_APPROVAL_PACKET_RAW_V1,
  authorityRebind: JSON.parse(TEACHING_AUTHORITY_REBIND_RAW_V1) as unknown,
  authorityRebindRaw: TEACHING_AUTHORITY_REBIND_RAW_V1,
  registry: TEACHING_CONTENT_REGISTRY_V1,
};
const formulaId = selectionAsset.rows[0].formulaId;

function resolve(
  locale: string,
  overrides: Partial<TeachingContentAssetsV1> = {},
) {
  const coherentOverrides = { ...overrides };
  const pairs = [
    ['selection', 'selectionRaw'],
    ['anchors', 'anchorsRaw'],
    ['runtimeIndex', 'runtimeIndexRaw'],
    ['ledger', 'ledgerRaw'],
    ['approval', 'approvalRaw'],
    ['approvalPacket', 'approvalPacketRaw'],
    ['authorityRebind', 'authorityRebindRaw'],
  ] as const;
  for (const [parsedKey, rawKey] of pairs) {
    if (parsedKey in overrides && !(rawKey in overrides)) {
      coherentOverrides[rawKey] = JSON.stringify(overrides[parsedKey]);
    }
  }
  return resolveTeachingContentFromAssetsV1(
    { ...assets, ...coherentOverrides },
    formulaId,
    locale,
  );
}

function registryWith(
  locale: keyof typeof TEACHING_CONTENT_REGISTRY_V1,
  value: unknown,
) {
  return {
    ...TEACHING_CONTENT_REGISTRY_V1,
    [locale]: {
      ...TEACHING_CONTENT_REGISTRY_V1[locale],
      [formulaId]: value,
    },
  };
}

function ledgerWithFirstUnit(mutator: (unit: Record<string, unknown>) => void) {
  const unit = structuredClone(ledgerAsset.units[0]) as unknown as Record<string, unknown>;
  mutator(unit);
  return { ...ledgerAsset, units: [unit, ...ledgerAsset.units.slice(1)] };
}

function leafKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('teaching content loader v1', () => {
  it('delivers all 350 approved units in their requested locale', () => {
    let delivered = 0;
    for (const selected of selectionAsset.rows) {
      for (const locale of TEACHING_CONTENT_LOCALES_V1) {
        const result = loadTeachingContentV1(selected.formulaId, locale);
        expect(result).toMatchObject({
          delivery: 'delivered',
          requestedLocale: locale,
          contentLocale: locale,
          robots: 'index,follow',
          contentEligibleForCommit21: true,
        });
        if (result.delivery === 'delivered') {
          expect(result.english.formulaId).toBe(selected.formulaId);
          expect(result.localized?.locale ?? 'en').toBe(locale);
        }
        delivered += 1;
      }
    }
    expect(delivered).toBe(350);
  });

  it('uses explicit noindex English fallback when a localization is missing', () => {
    const registry = registryWith('zh', undefined);
    expect(resolve('zh', { registry })).toMatchObject({
      delivery: 'fallback-browse-only',
      requestedLocale: 'zh',
      contentLocale: 'en',
      robots: 'noindex,follow',
      contentEligibleForCommit21: false,
      fallbackReason: 'localized-content-unavailable',
    });
  });

  it('rejects a stale localized hash and falls back without exposing it', () => {
    const stale = {
      ...(TEACHING_CONTENT_REGISTRY_V1.zh[formulaId] as Record<string, unknown>),
      contentHash: '0'.repeat(64),
    };
    const result = resolve('zh', { registry: registryWith('zh', stale) });
    expect(result).toMatchObject({
      delivery: 'fallback-browse-only',
      contentLocale: 'en',
      robots: 'noindex,follow',
    });
    if (result.delivery === 'fallback-browse-only') {
      expect(result).not.toHaveProperty('localized');
    }
  });

  it('does not throw when content hashing rejects malformed strings', () => {
    const malformedEnglish = {
      ...(TEACHING_CONTENT_REGISTRY_V1.en[formulaId] as Record<string, unknown>),
      overview: '\ud800',
    };
    expect(() =>
      resolve('en', { registry: registryWith('en', malformedEnglish) }),
    ).not.toThrow();
    expect(resolve('en', { registry: registryWith('en', malformedEnglish) })).toMatchObject(
      {
        delivery: 'not-delivered',
        failureCode: 'english-content-unavailable',
      },
    );

    const malformedLocalized = {
      ...(TEACHING_CONTENT_REGISTRY_V1.zh[formulaId] as Record<string, unknown>),
      overview: '\ud800',
    };
    expect(() =>
      resolve('zh', { registry: registryWith('zh', malformedLocalized) }),
    ).not.toThrow();
    expect(
      resolve('zh', { registry: registryWith('zh', malformedLocalized) }),
    ).toMatchObject({
      delivery: 'fallback-browse-only',
      contentLocale: 'en',
      robots: 'noindex,follow',
    });
  });

  it('does not serve localization whose ledger approval regressed', () => {
    const ledger = ledgerWithFirstUnit((unit) => {
      const localized = unit.localized as Record<string, Record<string, unknown>>;
      localized.zh = { ...localized.zh, stage: 'locale-reviewed' };
    });
    expect(resolve('zh', { ledger })).toMatchObject({
      delivery: 'fallback-browse-only',
      robots: 'noindex,follow',
    });
  });

  it('fails closed when English content or approval is stale', () => {
    const staleEnglish = {
      ...(TEACHING_CONTENT_REGISTRY_V1.en[formulaId] as Record<string, unknown>),
      sourceRevision: '0'.repeat(64),
    };
    expect(resolve('en', { registry: registryWith('en', staleEnglish) })).toMatchObject({
      delivery: 'not-delivered',
      contentLocale: null,
      robots: 'noindex,follow',
    });

    const ledger = ledgerWithFirstUnit((unit) => {
      unit.english = {
        ...(unit.english as Record<string, unknown>),
        stage: 'locale-reviewed',
      };
    });
    expect(resolve('zh', { ledger })).toMatchObject({
      delivery: 'not-delivered',
      contentLocale: null,
      robots: 'noindex,follow',
    });
  });

  it('rejects malformed evidence without throwing', () => {
    const ledger = ledgerWithFirstUnit((unit) => {
      const english = structuredClone(unit.english) as Record<string, unknown>;
      const events = english.events as Array<Record<string, unknown>>;
      events[0] = { ...events[0], evidenceRefs: [null] };
      unit.english = english;
    });
    expect(() => resolve('en', { ledger })).not.toThrow();
    expect(resolve('en', { ledger })).toMatchObject({
      delivery: 'not-delivered',
      failureCode: 'english-content-unavailable',
    });
  });

  it('binds terminal approval events to the reviewed approval artifact and packet', () => {
    const ledger = ledgerWithFirstUnit((unit) => {
      const english = structuredClone(unit.english) as Record<string, unknown>;
      const events = english.events as Array<Record<string, unknown>>;
      const terminal = events.at(-1) as Record<string, unknown>;
      terminal.evidenceRefs = (
        terminal.evidenceRefs as Array<Record<string, unknown>>
      ).map((reference) =>
        reference.kind === 'review-artifact'
          ? { ...reference, value: 'maintainer-approval.v1.json#sha256=invalid' }
          : reference,
      );
      unit.english = english;
    });
    expect(resolve('en', { ledger })).toMatchObject({
      delivery: 'not-delivered',
      failureCode: 'english-content-unavailable',
    });

    const approval = {
      ...(assets.approval as Record<string, unknown>),
      actorId: 'human:unapproved-maintainer',
    };
    expect(resolve('en', { approval })).toMatchObject({
      delivery: 'not-delivered',
      failureCode: 'binding-invalid',
    });

    const approvalPacket = {
      ...(assets.approvalPacket as Record<string, unknown>),
      formulaCount: 49,
    };
    expect(resolve('en', { approvalPacket })).toMatchObject({
      delivery: 'not-delivered',
      failureCode: 'binding-invalid',
    });
  });

  it('falls back when a locale approval omits its English hash binding', () => {
    const ledger = ledgerWithFirstUnit((unit) => {
      const localized = structuredClone(unit.localized) as Record<string, unknown>;
      const zh = localized.zh as Record<string, unknown>;
      delete zh.englishContentHash;
      localized.zh = zh;
      unit.localized = localized;
    });
    expect(resolve('zh', { ledger })).toMatchObject({
      delivery: 'fallback-browse-only',
      contentLocale: 'en',
      robots: 'noindex,follow',
    });
  });

  it('fails closed when runtime canonicalization rejects malformed strings', () => {
    const malformedRuntime = {
      ...runtimeIndexAsset,
      rows: runtimeIndexAsset.rows.map((row) =>
        row.formulaId === formulaId ? { ...row, displayName: '\ud800' } : row,
      ),
    };
    const malformedRuntimeRaw = JSON.stringify(malformedRuntime);
    const selection = {
      ...selectionAsset,
      pins: {
        ...selectionAsset.pins,
        runtimeIndexSha256: sha256HexSyncV1(malformedRuntimeRaw),
      },
    };
    const overrides = {
      runtimeIndex: malformedRuntime,
      runtimeIndexRaw: malformedRuntimeRaw,
      selection,
    };
    expect(() => resolve('en', overrides)).not.toThrow();
    expect(resolve('en', overrides)).toMatchObject({
      delivery: 'not-delivered',
      failureCode: 'binding-invalid',
    });
  });

  it('fails closed on global authority drift and duplicate rows', () => {
    const duplicatedSelection = {
      ...selectionAsset,
      rows: [selectionAsset.rows[0], ...selectionAsset.rows.slice(0, -1)],
    };
    const duplicatedAnchors = {
      ...anchorAsset,
      rows: [anchorAsset.rows[0], ...anchorAsset.rows.slice(0, -1)],
    };
    const duplicatedLedger = {
      ...ledgerAsset,
      units: [ledgerAsset.units[0], ...ledgerAsset.units.slice(0, -1)],
    };
    const runtimeRow = runtimeIndexAsset.rows.find(
      (row) => row.formulaId === formulaId,
    );
    if (!runtimeRow || runtimeRow.parameters.length === 0) {
      throw new Error('Expected parameterized teaching fixture');
    }
    const duplicateParameters = {
      ...runtimeIndexAsset,
      rows: runtimeIndexAsset.rows.map((row) =>
        row.formulaId === formulaId
          ? { ...row, parameters: [row.parameters[0], row.parameters[0]] }
          : row,
      ),
    };
    const mutatedAnchor = structuredClone(anchorAsset);
    mutatedAnchor.rows[0].anchors[0].nodeHash = '0'.repeat(64);
    const mutatedRuntime = {
      ...runtimeIndexAsset,
      rows: runtimeIndexAsset.rows.map((row) =>
        row.formulaId === formulaId
          ? { ...row, displayName: `${row.displayName} tampered` }
          : row,
      ),
    };
    const missingLocaleRegistry = {
      ...TEACHING_CONTENT_REGISTRY_V1,
    } as Record<string, unknown>;
    delete missingLocaleRegistry.zh;
    const tamperedRebind = JSON.parse(
      TEACHING_AUTHORITY_REBIND_RAW_V1,
    ) as { invariants: { selectionRowsChanged: boolean } };
    tamperedRebind.invariants.selectionRowsChanged = true;
    const coordinatedSelection = structuredClone(selectionAsset);
    coordinatedSelection.rows[0].selectionRationale += ' coordinated tamper';
    const coordinatedRebind = JSON.parse(
      TEACHING_AUTHORITY_REBIND_RAW_V1,
    ) as { selectionRowsCanonicalSha256: string };
    coordinatedRebind.selectionRowsCanonicalSha256 = sha256HexSyncV1(
      canonicalJsonV1(coordinatedSelection.rows, 131_072),
    );
    const cases: Partial<TeachingContentAssetsV1>[] = [
      { selection: duplicatedSelection },
      { selectionRaw: `${TEACHING_SELECTION_RAW_V1}\n` },
      { anchors: duplicatedAnchors },
      { ledger: duplicatedLedger },
      {
        anchors: {
          ...anchorAsset,
          selectionSha256: '0'.repeat(64),
        },
      },
      { runtimeIndex: duplicateParameters },
      { anchors: mutatedAnchor },
      { runtimeIndex: mutatedRuntime },
      { authorityRebind: tamperedRebind },
      {
        selection: coordinatedSelection,
        authorityRebind: coordinatedRebind,
      },
      {
        registry:
          missingLocaleRegistry as unknown as TeachingContentAssetsV1['registry'],
      },
      { registry: null as unknown as TeachingContentAssetsV1['registry'] },
    ];
    for (const overrides of cases) {
      expect(resolve('en', overrides)).toMatchObject({
        delivery: 'not-delivered',
        failureCode: 'binding-invalid',
      });
    }
  });

  it('freezes validated units before crossing the async render boundary', () => {
    const result = resolve('zh');
    expect(result.delivery).toBe('delivered');
    if (result.delivery !== 'delivered') return;
    expect(Object.isFrozen(result.english)).toBe(true);
    expect(Object.isFrozen(result.english.sourceWalkthrough)).toBe(true);
    expect(Object.isFrozen(result.localized)).toBe(true);
    expect(Object.isFrozen(result.localized?.exercise)).toBe(true);
  });

  it('advertises only locales whose current units are delivered', () => {
    const registry = registryWith('zh', undefined);
    const delivered = resolveDeliveredTeachingLocalesFromAssetsV1(
      { ...assets, registry },
      formulaId,
    );
    expect(delivered).toContain('en');
    expect(delivered).not.toContain('zh');
    const alternates = Object.fromEntries(
      TEACHING_CONTENT_LOCALES_V1.map((locale) => [
        locale,
        `https://example.test/${locale}/formulas/example`,
      ]),
    );
    alternates['x-default'] = alternates.en;
    const filtered = filterTeachingAlternatesAtCommit20dV1(
      alternates,
      delivered,
    );
    expect(filtered.en).toBe(alternates.en);
    expect(filtered.zh).toBeUndefined();
    expect(filtered['x-default']).toBe(alternates.en);

    const noEnglish = registryWith('en', undefined);
    const noneDelivered = resolveDeliveredTeachingLocalesFromAssetsV1(
      { ...assets, registry: noEnglish },
      formulaId,
    );
    expect(noneDelivered).toEqual([]);
    expect(
      filterTeachingAlternatesAtCommit20dV1(alternates, noneDelivered),
    ).not.toHaveProperty('x-default');
  }, 15_000);

  it('fails closed for unsupported locales and unselected or held identities', () => {
    expect(resolve('de')).toMatchObject({
      delivery: 'not-delivered',
      failureCode: 'unsupported-locale',
    });
    expect(
      resolveTeachingContentFromAssetsV1(
        assets,
        heldAsset.rows[0].formulaId,
        'en',
      ),
    ).toMatchObject({
      delivery: 'not-delivered',
      failureCode: 'formula-not-selected',
    });
  });

  it('keeps the generated registry and seven-locale UI keyset deterministic', () => {
    expect(() => generateTeachingContentRegistryV1(process.cwd(), false)).not.toThrow();
    const keysets = TEACHING_CONTENT_LOCALES_V1.map((locale) => {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8'),
      ) as { formulas: { teaching: unknown } };
      return leafKeys(messages.formulas.teaching).sort();
    });
    expect(keysets.every((keys) => JSON.stringify(keys) === JSON.stringify(keysets[0]))).toBe(
      true,
    );
    expect(keysets[0]).toHaveLength(12);
  });

  it('keeps commit 20d indexing limited to delivered legacy Guides', () => {
    expect(isTeachingPageIndexableAtCommit20dV1(true, 'delivered')).toBe(true);
    for (const delivery of ['not-delivered', 'fallback-browse-only'] as const) {
      expect(isTeachingPageIndexableAtCommit20dV1(true, delivery)).toBe(false);
    }
    expect(isTeachingPageIndexableAtCommit20dV1(false, 'delivered')).toBe(false);
  });

  it('routes metadata and both page branches through the shared loader', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/[locale]/formulas/[formulaId]/page.tsx'),
      'utf8',
    );
    expect(source.match(/loadTeachingContentCached\(formulaId, locale\)/g)).toHaveLength(2);
    expect(source.match(/<TeachingContentPanel/g)).toHaveLength(2);
    expect(source).toContain(
      'isPublishedFormulaRecordIndexableV1(formulaId, locale)',
    );
    expect(source).toContain('isFormulaLocaleIndexableV1(formulaId, locale)');
    expect(source).toContain('loadIndexableFormulaRecordLocalesCached(formulaId)');
    expect(source).toContain('loadIndexableTeachingLocalesCached(formulaId)');
    expect(source).toContain('filterTeachingAlternatesV1(');
    expect(source).not.toContain('TEACHING_CONTENT_REGISTRY_V1');
  });
});
