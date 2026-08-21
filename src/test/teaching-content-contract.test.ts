import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import aliasesAsset from '../../resources/formula-library/v1/legacy-formula-aliases.json';
import decisionsAsset from '../../resources/formula-library/v1/publication-decisions.json';
import identityAsset from '../../resources/formula-library/v1/standard-formula-ids.json';
import runtimeIndexAsset from '../../public/formula-library/v1/runtime/published/index.json';
import heldAsset from '../../resources/formula-library/v1/teaching-held-guide-appendix.v1.json';
import ledgerAsset from '../../resources/formula-library/v1/teaching-review-ledger.v1.json';
import selectionAsset from '../../resources/formula-library/v1/teaching-selection.v1.json';
import schemaAsset from '../../resources/formula-library/v1/teaching-content-schema.v1.json';
import prototypeAsset from '../../resources/formula-library/v1/teaching-content-prototype.json';
import terminologyAsset from '../../resources/formula-library/v1/teaching-terminology.v1.json';
import approvalAsset from '../../resources/formula-library/v1/teaching-review-evidence/maintainer-approval.v1.json';
import fixtureAsset from './fixtures/teaching/content-contract-fixtures.v1.json';
import {
  contentHashV1,
  resolveTeachingDeliveryPolicyV1,
  validateEnglishTeachingUnitV1,
  validateLocaleTeachingUnitV1,
  validateReviewContentLinkV1,
  validateReviewEventsV1,
  type ReviewEventV1,
} from '@/content/teaching/contracts';
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from '@/engine/formulas/v1/revisions';

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function rehashLocale<T extends { contentHash: string }>(value: T): T {
  const payload = structuredClone(value) as Record<string, unknown>;
  delete payload.contentHash;
  value.contentHash = contentHashV1(payload);
  return value;
}

const resourceRoot = join(process.cwd(), 'resources/formula-library/v1');
const EXPECTED_APPROVED_FORMULAS = 20;
const EXPECTED_APPROVED_UNITS = EXPECTED_APPROVED_FORMULAS * 7;
const semanticAnchorAsset = JSON.parse(
  readFileSync(join(resourceRoot, 'teaching-semantic-anchors.v1.json'), 'utf8'),
) as {
  rows: Array<{
    formulaId: string;
    sourceRevision: string;
    semanticHash: string;
    anchors: Array<{ nodeId: string }>;
  }>;
};
const fixtureAnchorRow = semanticAnchorAsset.rows.find(
  (row) => row.formulaId === fixtureAsset.binding.formulaId,
);
const fixtureRuntimeRow = runtimeIndexAsset.rows.find(
  (row) => row.formulaId === fixtureAsset.binding.formulaId,
);
if (!fixtureAnchorRow || !fixtureRuntimeRow) {
  throw new Error('Teaching fixture binding does not resolve');
}
const binding = {
  formulaId: fixtureRuntimeRow.formulaId,
  sourceRevision: fixtureRuntimeRow.sourceRevision,
  semanticHash: fixtureRuntimeRow.semanticHash,
  nodeIds: new Set(fixtureAnchorRow.anchors.map((anchor) => anchor.nodeId)),
  parameterSymbols: new Set(
    fixtureRuntimeRow.parameters.map((parameter) => parameter.slotName),
  ),
};

function validatesHeldAppendix(asset: typeof heldAsset): boolean {
  const aliases = new Map(
    aliasesAsset.aliases
      .filter((alias) => alias.kind === 'guide-slug')
      .map((alias) => [alias.formulaId, alias.value]),
  );
  const decisions = new Map(
    decisionsAsset.rows.map((row) => [row.formulaId, row]),
  );
  const identities = new Map(
    identityAsset.formulas.map((row) => [row.formulaId, row]),
  );
  const keys = [
    'allowedEditorialFields',
    'decisionReason',
    'displayName',
    'forbiddenCapabilities',
    'formulaId',
    'guideSlug',
    'primaryFamily',
    'publicationDecision',
  ];
  return (
    asset.schema === 'fractalpark-teaching-held-guide-appendix/v1' &&
    asset.rows.length === 4 &&
    new Set(asset.rows.map((row) => row.formulaId)).size === 4 &&
    asset.rows.every((row) => {
      const decision = decisions.get(row.formulaId);
      const identity = identities.get(row.formulaId);
      return (
        JSON.stringify(Object.keys(row).sort()) === JSON.stringify(keys) &&
        aliases.get(row.formulaId) === row.guideSlug &&
        identity?.displayName === row.displayName &&
        identity?.primaryFamily === row.primaryFamily &&
        decision?.publicationDecision === 'hold' &&
        decision.decisionReason === row.decisionReason &&
        row.publicationDecision === 'hold'
      );
    })
  );
}

describe('teaching selection and review contract', () => {
  it('pins an exact, published, balanced 50-row selection in five batches', () => {
    expect(selectionAsset).toMatchObject({
      schema: 'fractalpark-teaching-selection/v1',
      packageCount: 50,
      contentUnitCount: 350,
      englishUnitCount: 50,
      localizedUnitCount: 300,
    });
    expect(selectionAsset.rows).toHaveLength(50);
    expect(selectionAsset.rows.map((row) => row.ordinal)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 1),
    );
    expect(new Set(selectionAsset.rows.map((row) => row.formulaId)).size).toBe(50);
    expect(new Set(selectionAsset.rows.map((row) => row.semanticHash)).size).toBe(50);
    expect(selectionAsset.rows.filter((row) => row.guideSlug !== null)).toHaveLength(17);
    expect(selectionAsset.rows.filter((row) => row.guideSlug === null)).toHaveLength(33);
    expect(selectionAsset.batches).toHaveLength(5);
    expect(selectionAsset.batches.map((batch) => batch.formulaIds.length)).toEqual([
      10, 10, 10, 10, 10,
    ]);
    for (const batch of selectionAsset.batches) {
      expect(batch.formulaIds).toEqual(
        selectionAsset.rows
          .filter((row) => row.batch === batch.batch)
          .map((row) => row.formulaId),
      );
    }

    const runtimeById = new Map(
      runtimeIndexAsset.rows.map((row) => [row.formulaId, row]),
    );
    const decisionById = new Map(
      decisionsAsset.rows.map((row) => [row.formulaId, row]),
    );
    const identityById = new Map(
      identityAsset.formulas.map((row) => [row.formulaId, row]),
    );
    for (const row of selectionAsset.rows) {
      expect(decisionById.get(row.formulaId)?.publicationDecision).toBe('publish');
      expect(identityById.get(row.formulaId)?.displayName).toBe(row.displayName);
      expect(runtimeById.get(row.formulaId)).toMatchObject({
        displayName: row.displayName,
        family: row.family,
        implementationBasis: row.implementationBasis,
        sourceRevision: row.sourceRevision,
        semanticHash: row.semanticHash,
      });
    }
    expect(new Set(selectionAsset.rows.map((row) => row.family)).size).toBe(7);
    expect(
      new Set(selectionAsset.rows.map((row) => row.implementationBasis)).size,
    ).toBe(3);
    expect(
      Object.fromEntries(
        [...new Set(selectionAsset.rows.map((row) => row.family))]
          .sort()
          .map((family) => [
            family,
            selectionAsset.rows.filter((row) => row.family === family).length,
          ]),
      ),
    ).toEqual({
      'algebraic-power': 6,
      'folded-absolute': 9,
      'function-composition': 6,
      'orbit-memory': 6,
      'rational-reciprocal': 11,
      'root-finding': 7,
      transcendental: 5,
    });
    expect(
      Object.fromEntries(
        [...new Set(selectionAsset.rows.map((row) => row.implementationBasis))]
          .sort()
          .map((basis) => [
            basis,
            selectionAsset.rows.filter(
              (row) => row.implementationBasis === basis,
            ).length,
          ]),
      ),
    ).toEqual({
      'direct-adaptation': 8,
      'project-owned': 29,
      'separated-independent-rewrite': 13,
    });
  });

  it('pins the actual source ledgers by bytes, not revision labels alone', () => {
    expect(selectionAsset.pins).toMatchObject({
      identityCatalogSha256: sha256(
        join(resourceRoot, 'standard-formula-ids.json'),
      ),
      publicationDecisionSha256: sha256(
        join(resourceRoot, 'publication-decisions.json'),
      ),
      legacyAliasesSha256: sha256(
        join(resourceRoot, 'legacy-formula-aliases.json'),
      ),
      runtimeIndexSha256: sha256(
        join(
          process.cwd(),
          'public/formula-library/v1/runtime/published/index.json',
        ),
      ),
      runtimeIndexCanonicalSha256: sha256HexSyncV1(
        canonicalJsonV1(runtimeIndexAsset, 2_000_000),
      ),
      prototypeSha256: sha256(
        join(resourceRoot, 'teaching-content-prototype.json'),
      ),
    });
  });

  it('keeps all five noindex prototypes in Batch 1 without review claims', () => {
    const prototypeIds = [...new Set(prototypeAsset.entries.map((entry) => entry.formulaId))];
    expect(prototypeIds).toHaveLength(5);
    for (const formulaId of prototypeIds) {
      expect(selectionAsset.rows.find((row) => row.formulaId === formulaId)?.batch).toBe(1);
    }
    expect(prototypeAsset.status).toBe('prototype-not-reviewed-localization');
    expect(
      prototypeAsset.entries.every(
        (entry) =>
          entry.indexability === 'noindex' &&
          (entry.translationStatus === 'draft' ||
            entry.translationStatus === 'fallback'),
      ),
    ).toBe(true);
  });

  it('activates the root schema and pins terminology to decision codes', () => {
    expect(schemaAsset.oneOf).toEqual([
      { $ref: '#/$defs/englishFactUnit' },
      { $ref: '#/$defs/localeEditorialUnit' },
      { $ref: '#/$defs/heldGuideEditorialUnit' },
    ]);
    expect(new Set(terminologyAsset.protectedDecisionReasonCodes)).toEqual(
      new Set(decisionsAsset.rows.map((row) => row.decisionReason)),
    );
    expect(
      heldAsset.rows.every((row) =>
        terminologyAsset.protectedDecisionReasonCodes.includes(row.decisionReason),
      ),
    ).toBe(true);
  });

  it('requires an explicit justification for suffix-only semantic siblings', () => {
    for (const selected of selectionAsset.rows) {
      const baseName = selected.displayName.replace(/\[[^\]]+\]$/, '');
      const siblings = runtimeIndexAsset.rows.filter(
        (candidate) =>
          candidate.formulaId !== selected.formulaId &&
          candidate.displayName.replace(/\[[^\]]+\]$/, '') === baseName &&
          candidate.semanticHash === selected.semanticHash,
      );
      if (siblings.length > 0) {
        expect(
          (selected as typeof selected & {
            semanticSiblingJustification?: string;
          }).semanticSiblingJustification,
        ).toBeTruthy();
      }
    }
  });

  it('accounts for 17 selected Guides and four fail-closed held Guide aliases', () => {
    const guideAliases = aliasesAsset.aliases.filter(
      (alias) => alias.kind === 'guide-slug',
    );
    const selectedGuideIds = new Set(
      selectionAsset.rows
        .filter((row) => row.guideSlug !== null)
        .map((row) => row.formulaId),
    );
    expect(selectedGuideIds.size).toBe(17);
    expect(heldAsset.rows).toHaveLength(4);
    expect(
      new Set(guideAliases.map((alias) => alias.formulaId)),
    ).toEqual(
      new Set([
        ...selectedGuideIds,
        ...heldAsset.rows.map((row) => row.formulaId),
      ]),
    );
    for (const row of heldAsset.rows) {
      expect(row).not.toHaveProperty('sourceRevision');
      expect(row).not.toHaveProperty('semanticHash');
      expect(row.forbiddenCapabilities).toEqual(
        expect.arrayContaining([
          'sourceWalkthrough',
          'parameters',
          'implementationGeneratedImagery',
          'explorer',
          'run',
          'viewSource',
          'edit',
          'remix',
        ]),
      );
    }
    expect(validatesHeldAppendix(heldAsset)).toBe(true);
  });

  it('rejects held appendix field, UUID, slug, and reason drift', () => {
    const mutations: Array<(asset: typeof heldAsset) => void> = [
      (asset) => {
        Object.assign(asset.rows[0], { sourceRevision: 'a'.repeat(64) });
      },
      (asset) => {
        asset.rows[0].formulaId = asset.rows[1].formulaId;
      },
      (asset) => {
        asset.rows[0].guideSlug = 'mandelbrot';
      },
      (asset) => {
        asset.rows[0].decisionReason = 'held-invented-reason';
      },
    ];
    for (const mutate of mutations) {
      const mutated = clone(heldAsset);
      mutate(mutated);
      expect(validatesHeldAppendix(mutated)).toBe(false);
    }
  });

  it('keeps held Guide depth prose out of every global locale message payload', () => {
    for (const locale of selectionAsset.locales) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8'),
      ) as { formulas: { entries: Record<string, unknown> } };
      expect(Object.keys(messages.formulas.entries)).toHaveLength(17);
      for (const row of heldAsset.rows) {
        expect(messages.formulas.entries).not.toHaveProperty(row.guideSlug);
      }
    }
  });

  it('binds every delivered content file to monotonic review and human approval evidence', () => {
    expect(ledgerAsset.selectionSha256).toBe(
      sha256(join(resourceRoot, 'teaching-selection.v1.json')),
    );
    expect(ledgerAsset.units).toHaveLength(50);
    expect(new Set(ledgerAsset.units.map((unit) => unit.formulaId)).size).toBe(50);
    expect(approvalAsset).toMatchObject({
      schema: 'fractalpark-teaching-maintainer-approval/v1',
      status: 'maintainer-approved',
      actorId: 'fractalpark-maintainer',
      actorKind: 'human-maintainer',
      actorRole: 'maintainer',
    });
    expect(approvalAsset.approvalPacketSha256).toBe(
      sha256(
        join(
          resourceRoot,
          'teaching-review-evidence/maintainer-approval-packet.v1.json',
        ),
      ),
    );

    const maintainerActorIds = new Set(ledgerAsset.maintainerActorIds);
    let approvedFormulas = 0;
    let approvedUnits = 0;
    const stages: string[] = [];
    for (const [index, unit] of ledgerAsset.units.entries()) {
      const selected = selectionAsset.rows[index];
      const anchorRow = semanticAnchorAsset.rows.find(
        (row) => row.formulaId === unit.formulaId,
      );
      const runtimeRow = runtimeIndexAsset.rows.find(
        (row) => row.formulaId === unit.formulaId,
      );
      expect(unit).toMatchObject({
        formulaId: selected.formulaId,
        sourceRevision: selected.sourceRevision,
        semanticHash: selected.semanticHash,
      });
      expect(anchorRow).toBeTruthy();
      expect(runtimeRow).toBeTruthy();
      if (!anchorRow || !runtimeRow) continue;
      const unitBinding = {
        formulaId: unit.formulaId,
        sourceRevision: unit.sourceRevision,
        semanticHash: unit.semanticHash,
        nodeIds: new Set(anchorRow.anchors.map((anchor) => anchor.nodeId)),
        parameterSymbols: new Set(
          runtimeRow.parameters.map((parameter) => parameter.slotName),
        ),
      };
      const englishPath = join(
        resourceRoot,
        'teaching-content/en',
        `${unit.formulaId}.json`,
      );
      stages.push(unit.english.stage);
      if (unit.english.stage === 'not-started') {
        expect(existsSync(englishPath)).toBe(false);
        expect(unit.english).toEqual({
          stage: 'not-started',
          contentHash: null,
          events: [],
        });
        expect(validateReviewContentLinkV1(unit.english, null)).toEqual({ ok: true });
        expect(
          validateReviewEventsV1(
            unit.english.stage,
            unit.english.events as ReviewEventV1[],
            maintainerActorIds,
          ),
        ).toEqual({ ok: true });
      } else {
        approvedFormulas += 1;
        approvedUnits += 1;
        expect(unit.english.stage).toBe('maintainer-approved');
        expect(existsSync(englishPath)).toBe(true);
        const english = JSON.parse(readFileSync(englishPath, 'utf8')) as Record<
          string,
          unknown
        >;
        const englishHash = contentHashV1(english);
        expect(validateEnglishTeachingUnitV1(english, unitBinding)).toEqual({ ok: true });
        expect(validateReviewContentLinkV1(unit.english, englishHash)).toEqual({
          ok: true,
        });
        expect(
          validateReviewEventsV1(
            unit.english.stage,
            unit.english.events as ReviewEventV1[],
            maintainerActorIds,
          ),
        ).toEqual({ ok: true });
      }

      expect(Object.keys(unit.localized).sort()).toEqual(
        ['zh', 'pt', 'ko', 'ru', 'es', 'fr'].sort(),
      );
      for (const [locale, localizedReview] of Object.entries(unit.localized)) {
        const localePath = join(
          resourceRoot,
          'teaching-content',
          locale,
          `${unit.formulaId}.json`,
        );
        stages.push(localizedReview.stage);
        if (localizedReview.stage === 'not-started') {
          expect(existsSync(localePath)).toBe(false);
          expect(localizedReview).toEqual({
            stage: 'not-started',
            contentHash: null,
            englishContentHash: null,
            events: [],
          });
          expect(
            validateReviewContentLinkV1(localizedReview, null, null),
          ).toEqual({ ok: true });
          expect(
            validateReviewEventsV1(
              localizedReview.stage,
              localizedReview.events as ReviewEventV1[],
              maintainerActorIds,
            ),
          ).toEqual({ ok: true });
          continue;
        }

        approvedUnits += 1;
        expect(localizedReview.stage).toBe('maintainer-approved');
        expect(existsSync(englishPath)).toBe(true);
        expect(existsSync(localePath)).toBe(true);
        const english = JSON.parse(readFileSync(englishPath, 'utf8')) as Record<
          string,
          unknown
        >;
        const englishHash = contentHashV1(english);
        const localized = JSON.parse(readFileSync(localePath, 'utf8')) as Record<
          string,
          unknown
        >;
        const localePayload = clone(localized);
        delete localePayload.contentHash;
        const localeHash = contentHashV1(localePayload);
        expect(
          validateLocaleTeachingUnitV1(
            localized,
            unitBinding,
            english,
            englishHash,
          ),
        ).toEqual({ ok: true });
        expect(
          validateReviewContentLinkV1(
            localizedReview,
            localeHash,
            englishHash,
          ),
        ).toEqual({ ok: true });
        expect(
          validateReviewEventsV1(
            localizedReview.stage,
            localizedReview.events as ReviewEventV1[],
            maintainerActorIds,
          ),
        ).toEqual({ ok: true });
      }
    }
    expect(stages).toHaveLength(350);
    expect(approvedFormulas).toBe(EXPECTED_APPROVED_FORMULAS);
    expect(approvedUnits).toBe(EXPECTED_APPROVED_UNITS);
    expect(new Set(stages)).toEqual(
      EXPECTED_APPROVED_UNITS === 350
        ? new Set(['maintainer-approved'])
        : new Set(['maintainer-approved', 'not-started']),
    );
  });

  it('rejects invalid or decreasing review event timestamps', () => {
    const events = clone(ledgerAsset.units[0].english.events) as ReviewEventV1[];
    expect(events).toHaveLength(4);
    const decreasingEvents = events.map((event, index) => ({
      ...event,
      at: index === 1 ? '2026-08-21T00:00:00Z' : event.at,
    }));
    expect(
      validateReviewEventsV1(
        'maintainer-approved',
        decreasingEvents,
        new Set(ledgerAsset.maintainerActorIds),
      ),
    ).toEqual({ ok: false, code: 'review-event-time-invalid' });
    const invalidEvents = events.map((event, index) => ({
      ...event,
      at: index === 1 ? 'not-a-timestamp' : event.at,
    }));
    expect(
      validateReviewEventsV1(
        'maintainer-approved',
        invalidEvents,
        new Set(ledgerAsset.maintainerActorIds),
      ),
    ).toEqual({ ok: false, code: 'review-event-time-invalid' });
  });

  it('binds each delivered batch to immutable model evidence and the approved candidate', () => {
    const approvedBatchCount = EXPECTED_APPROVED_FORMULAS / 10;
    expect(Number.isInteger(approvedBatchCount)).toBe(true);
    const approvalPacket = JSON.parse(
      readFileSync(
        join(
          resourceRoot,
          'teaching-review-evidence/maintainer-approval-packet.v1.json',
        ),
        'utf8',
      ),
    ) as {
      batches: Array<{
        batch: number;
        candidateSha256: string;
        reviewManifestSha256: string;
      }>;
    };
    for (let batch = 1; batch <= 5; batch += 1) {
      const evidenceRoot = join(
        resourceRoot,
        'teaching-review-evidence',
        `batch-${String(batch).padStart(2, '0')}`,
      );
      if (batch > approvedBatchCount) {
        expect(existsSync(evidenceRoot)).toBe(false);
        continue;
      }
      const approved = approvalPacket.batches.find((row) => row.batch === batch);
      expect(approved).toBeTruthy();
      if (!approved) continue;
      const contentManifest = JSON.parse(
        readFileSync(join(evidenceRoot, 'content-manifest.json'), 'utf8'),
      ) as {
        batch: number;
        status: string;
        candidateSha256: string;
        reviewManifestSha256: string;
        maintainerApprovalSha256: string;
        formulaCount: number;
        contentUnitCount: number;
        formulaIds: string[];
        unitHashes: Array<{
          formulaId: string;
          locale: string;
          contentHash: string;
        }>;
        files: Array<{ path: string; sha256: string; contentHash: string }>;
      };
      const reviewManifest = JSON.parse(
        readFileSync(join(evidenceRoot, 'manifest.json'), 'utf8'),
      ) as {
        batch: number;
        status: string;
        candidateSha256: string;
        reviewers: Array<{
          provider: string;
          actualModel: string;
          finishReason: string;
          verdict: string;
          findings: number;
          coverageGaps: number;
          rawSha256: string;
          reviewSha256: string;
        }>;
      };
      expect(contentManifest).toMatchObject({
        batch,
        status: 'maintainer-approved',
        candidateSha256: approved.candidateSha256,
        formulaCount: 10,
        contentUnitCount: 70,
      });
      expect(contentManifest.formulaIds).toHaveLength(10);
      expect(contentManifest.unitHashes).toHaveLength(70);
      expect(contentManifest.files).toHaveLength(70);
      expect(contentManifest.reviewManifestSha256).toBe(
        sha256(join(evidenceRoot, 'manifest.json')),
      );
      expect(contentManifest.reviewManifestSha256).toBe(
        approved.reviewManifestSha256,
      );
      expect(contentManifest.maintainerApprovalSha256).toBe(
        sha256(
          join(
            resourceRoot,
            'teaching-review-evidence/maintainer-approval.v1.json',
          ),
        ),
      );
      expect(reviewManifest).toMatchObject({
        batch,
        status: 'model-reviewed-maintainer-pending',
        candidateSha256: approved.candidateSha256,
      });
      for (const file of contentManifest.files) {
        expect(file.sha256).toBe(sha256(join(process.cwd(), file.path)));
      }
      for (const reviewer of reviewManifest.reviewers) {
        expect(reviewer).toMatchObject({
          finishReason: 'stop',
          verdict: 'APPROVE',
          findings: 0,
          coverageGaps: 0,
        });
        const rawPath = join(evidenceRoot, `${reviewer.provider}.raw.json`);
        const reviewPath = join(evidenceRoot, `${reviewer.provider}.review.json`);
        expect(reviewer.rawSha256).toBe(sha256(rawPath));
        expect(reviewer.reviewSha256).toBe(sha256(reviewPath));
        const raw = JSON.parse(readFileSync(rawPath, 'utf8')) as {
          model: string;
          choices: Array<{ finish_reason: string }>;
        };
        const review = JSON.parse(readFileSync(reviewPath, 'utf8')) as {
          verdict: string;
          findings: unknown[];
          coverageGaps: unknown[];
        };
        expect(raw.model).toBe(reviewer.actualModel);
        expect(raw.choices[0]?.finish_reason).toBe('stop');
        expect(review).toMatchObject({
          verdict: 'APPROVE',
          findings: [],
          coverageGaps: [],
        });
      }
    }
  });

  it('keeps locale schemas separate from English and forbids authorable review state', () => {
    const localeSchema = schemaAsset.$defs.localeEditorialUnit;
    expect(localeSchema.properties.locale.enum).toEqual([
      'zh',
      'pt',
      'ko',
      'ru',
      'es',
      'fr',
    ]);
    expect(localeSchema.additionalProperties).toBe(false);
    expect(localeSchema.properties).not.toHaveProperty('review');
    expect(schemaAsset.$defs.englishFactUnit.properties).not.toHaveProperty(
      'review',
    );
  });

  it('accepts the positive English and locale fixtures', () => {
    expect(binding).toMatchObject({
      formulaId: fixtureAsset.binding.formulaId,
      sourceRevision: fixtureAsset.binding.sourceRevision,
      semanticHash: fixtureAsset.binding.semanticHash,
    });
    expect(
      fixtureAsset.binding.nodeIds.every((nodeId) => binding.nodeIds.has(nodeId)),
    ).toBe(true);
    expect(
      fixtureAsset.binding.parameterSymbols.every((symbol) =>
        binding.parameterSymbols.has(symbol),
      ),
    ).toBe(true);
    expect(validateEnglishTeachingUnitV1(fixtureAsset.english, binding)).toEqual({
      ok: true,
    });
    expect(
      validateLocaleTeachingUnitV1(
        fixtureAsset.locale,
        binding,
        fixtureAsset.english,
        fixtureAsset.locale.englishContentHash,
      ),
    ).toEqual({ ok: true });
  });

  it('rejects each declared content mutation instead of passing vacuously', () => {
    const rejected = new Set<string>();

    const revision = clone(fixtureAsset.english);
    revision.sourceRevision = 'b'.repeat(64);
    if (!validateEnglishTeachingUnitV1(revision, binding).ok)
      rejected.add('revision-mismatch');

    const node = clone(fixtureAsset.english);
    node.sourceWalkthrough[0].nodeId = 'frm-v1:missing:node';
    if (!validateEnglishTeachingUnitV1(node, binding).ok)
      rejected.add('unknown-node-id');

    const duplicate = clone(fixtureAsset.english);
    duplicate.sourceWalkthrough.push(clone(duplicate.sourceWalkthrough[0]));
    if (!validateEnglishTeachingUnitV1(duplicate, binding).ok)
      rejected.add('duplicate-annotation-id');

    const unresolved = clone(fixtureAsset.english);
    unresolved.parameterExperiment.parameterSymbols = ['exponent'];
    unresolved.parameterExperiment.steps = ['Set exponent to 3.'];
    if (!validateEnglishTeachingUnitV1(unresolved, binding).ok)
      rejected.add('unresolved-parameter-symbol');

    const missing = clone(fixtureAsset.english);
    missing.parameterExperiment.steps = ['Change the control to 3.'];
    if (!validateEnglishTeachingUnitV1(missing, binding).ok)
      rejected.add('missing-parameter-token');

    const keyset = clone(fixtureAsset.locale) as typeof fixtureAsset.locale & {
      sourceWalkthrough: Record<string, string>;
    };
    keyset.sourceWalkthrough.extra = '不应存在';
    rehashLocale(keyset);
    if (
      !validateLocaleTeachingUnitV1(
        keyset,
        binding,
        fixtureAsset.english,
        fixtureAsset.locale.englishContentHash,
      ).ok
    )
      rejected.add('locale-keyset-drift');

    const translated = clone(fixtureAsset.locale);
    translated.parameterExperiment.steps = ['将幂设为 3。'];
    rehashLocale(translated);
    if (
      !validateLocaleTeachingUnitV1(
        translated,
        binding,
        fixtureAsset.english,
        fixtureAsset.locale.englishContentHash,
      ).ok
    )
      rejected.add('locale-protected-parameter-translation');

    const translatedLiteral = clone(fixtureAsset.locale);
    translatedLiteral.overview = translatedLiteral.overview.replace(
      'FRM-like/1',
      'FRM 类/1',
    );
    rehashLocale(translatedLiteral);
    if (
      !validateLocaleTeachingUnitV1(
        translatedLiteral,
        binding,
        fixtureAsset.english,
        fixtureAsset.locale.englishContentHash,
      ).ok
    )
      rejected.add('locale-protected-literal-translation');

    const authorableReview = clone(fixtureAsset.locale) as Record<string, unknown>;
    authorableReview.review = { current: 'maintainer-approved' };
    if (
      !validateLocaleTeachingUnitV1(
        authorableReview,
        binding,
        fixtureAsset.english,
        fixtureAsset.locale.englishContentHash,
      ).ok
    )
      rejected.add('unit-review-field');

    const localeHash = clone(fixtureAsset.locale);
    localeHash.contentHash = 'b'.repeat(64);
    if (
      !validateLocaleTeachingUnitV1(
        localeHash,
        binding,
        fixtureAsset.english,
        fixtureAsset.locale.englishContentHash,
      ).ok
    )
      rejected.add('locale-content-hash-mismatch');

    const englishHash = clone(fixtureAsset.locale);
    englishHash.englishContentHash = 'b'.repeat(64);
    rehashLocale(englishHash);
    if (
      !validateLocaleTeachingUnitV1(
        englishHash,
        binding,
        fixtureAsset.english,
        fixtureAsset.locale.englishContentHash,
      ).ok
    )
      rejected.add('english-content-hash-mismatch');

    const unsourced = clone(fixtureAsset.english);
    unsourced.facts.claims[0].sourceIds = ['missing-source'];
    if (!validateEnglishTeachingUnitV1(unsourced, binding).ok)
      rejected.add('unsourced-history');

    expect([...rejected].sort()).toEqual(
      fixtureAsset.mutations
        .filter(
          (name) =>
            !name.startsWith('review-') &&
            name !== 'unit-ledger-divergence' &&
            name !== 'fallback-index-leak',
        )
        .sort(),
    );
  });

  it('rejects skipped stages and model-issued maintainer approval', () => {
    const evidence = [{ kind: 'review-artifact', value: 'review:1' }];
    const skipped: ReviewEventV1[] = [
      {
        stage: 'source-drafted',
        at: '2026-08-21T00:00:00Z',
        actorId: 'author',
        actorKind: 'human-maintainer',
        actorRole: 'author',
        evidenceRefs: evidence,
      },
      {
        stage: 'locale-reviewed',
        at: '2026-08-21T00:01:00Z',
        actorId: 'reviewer',
        actorKind: 'model-reviewer',
        actorRole: 'locale-reviewer',
        evidenceRefs: evidence,
      },
    ];
    expect(
      validateReviewEventsV1(
        'locale-reviewed',
        skipped,
        new Set(['fractalpark-maintainer']),
      ),
    ).toMatchObject({ ok: false });

    const modelApproval: ReviewEventV1[] = [
      skipped[0],
      {
        ...skipped[1],
        stage: 'technical-reviewed',
        actorRole: 'technical-reviewer',
      },
      skipped[1],
      {
        ...skipped[1],
        stage: 'maintainer-approved',
        actorRole: 'maintainer',
      },
    ];
    expect(
      validateReviewEventsV1(
        'maintainer-approved',
        modelApproval,
        new Set(['fractalpark-maintainer']),
      ),
    ).toMatchObject({ ok: false });
  });

  it('allows evidenced invalidation edges and terminal blocked state only', () => {
    const reviewEvidence = [{ kind: 'review-artifact', value: 'review:1' }];
    const hashEvidence = [
      { kind: 'content-hash', value: `sha256:${fixtureAsset.locale.contentHash}` },
    ];
    const event = (
      stage: string,
      evidenceRefs = reviewEvidence,
    ): ReviewEventV1 => ({
      stage,
      at: '2026-08-21T00:00:00Z',
      actorId: stage === 'maintainer-approved' ? 'fractalpark-maintainer' : 'reviewer',
      actorKind: stage === 'maintainer-approved' ? 'human-maintainer' : 'model-reviewer',
      actorRole: stage === 'maintainer-approved' ? 'maintainer' : 'technical-reviewer',
      evidenceRefs,
    });
    const approved = [
      event('source-drafted'),
      event('technical-reviewed'),
      event('locale-reviewed'),
      event('maintainer-approved'),
    ];
    expect(
      validateReviewEventsV1(
        'source-drafted',
        [...approved, event('source-drafted', hashEvidence)],
        new Set(['fractalpark-maintainer']),
        fixtureAsset.locale.contentHash,
      ),
    ).toEqual({ ok: true });
    expect(
      validateReviewEventsV1(
        'locale-reviewed',
        [...approved, event('locale-reviewed', hashEvidence)],
        new Set(['fractalpark-maintainer']),
        fixtureAsset.locale.contentHash,
      ),
    ).toEqual({ ok: true });
    expect(
      validateReviewEventsV1(
        'source-drafted',
        [...approved, event('source-drafted')],
        new Set(['fractalpark-maintainer']),
        fixtureAsset.locale.contentHash,
      ),
    ).toMatchObject({ ok: false });
    const unrelatedHashEvidence = [
      { kind: 'content-hash', value: `sha256:${'b'.repeat(64)}` },
    ];
    expect(
      validateReviewEventsV1(
        'source-drafted',
        [...approved, event('source-drafted', unrelatedHashEvidence)],
        new Set(['fractalpark-maintainer']),
        fixtureAsset.locale.contentHash,
      ),
    ).toMatchObject({ ok: false });
    expect(
      validateReviewEventsV1(
        'blocked',
        [event('source-drafted'), event('blocked')],
        new Set(['fractalpark-maintainer']),
      ),
    ).toEqual({ ok: true });
    expect(
      validateReviewEventsV1(
        'source-drafted',
        [
          event('source-drafted'),
          event('blocked'),
          event('source-drafted', hashEvidence),
        ],
        new Set(['fractalpark-maintainer']),
        fixtureAsset.locale.contentHash,
      ),
    ).toEqual({ ok: true });
    expect(
      validateReviewEventsV1(
        'blocked',
        [event('blocked')],
        new Set(['fractalpark-maintainer']),
      ),
    ).toMatchObject({ ok: false });
    expect(
      validateReviewEventsV1(
        'source-drafted',
        [{ ...event('source-drafted'), actorRole: 'owner' }],
        new Set(['fractalpark-maintainer']),
      ),
    ).toMatchObject({ ok: false });
    expect(
      validateReviewEventsV1(
        'technical-reviewed',
        [event('source-drafted'), event('blocked'), event('technical-reviewed')],
        new Set(['fractalpark-maintainer']),
      ),
    ).toMatchObject({ ok: false });
  });

  it('binds ledger hashes to canonical English and locale units', () => {
    const englishContentHash = contentHashV1(fixtureAsset.english);
    const localeContentHash = fixtureAsset.locale.contentHash;
    expect(
      validateReviewContentLinkV1(
        {
          stage: 'maintainer-approved',
          contentHash: localeContentHash,
          englishContentHash,
        },
        localeContentHash,
        englishContentHash,
      ),
    ).toEqual({ ok: true });
    expect(
      validateReviewContentLinkV1(
        { stage: 'not-started', contentHash: null, englishContentHash: null },
        null,
        null,
      ),
    ).toEqual({ ok: true });
    expect(
      validateReviewContentLinkV1(
        {
          stage: 'maintainer-approved',
          contentHash: 'b'.repeat(64),
          englishContentHash,
        },
        localeContentHash,
        englishContentHash,
      ),
    ).toMatchObject({ ok: false });
    expect(
      validateReviewContentLinkV1(
        {
          stage: 'maintainer-approved',
          contentHash: localeContentHash,
          englishContentHash: 'b'.repeat(64),
        },
        localeContentHash,
        englishContentHash,
      ),
    ).toMatchObject({ ok: false });
  });

  it('never turns English fallback under a non-English path into delivery', () => {
    const english = resolveTeachingDeliveryPolicyV1({
      requestedLocale: 'en',
      englishApproved: true,
      localizedApproved: false,
      bindingsValid: true,
      ledgerMatchesUnit: true,
    });
    const fallback = resolveTeachingDeliveryPolicyV1({
      requestedLocale: 'zh',
      englishApproved: true,
      localizedApproved: false,
      bindingsValid: true,
      ledgerMatchesUnit: true,
    });
    expect(english).toMatchObject({
      delivery: 'delivered',
      contentLocale: 'en',
      robots: 'index,follow',
      contentEligibleForCommit21: true,
    });
    expect(fallback).toEqual({
      delivery: 'fallback-browse-only',
      contentLocale: 'en',
      robots: 'noindex,follow',
      contentEligibleForCommit21: false,
    });
  });
});
