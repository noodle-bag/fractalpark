import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import restoredAsset from '../../resources/formula-library/v1/teaching-restored-guide-projection.v1.json';
import reviewEvidence from '../../resources/formula-library/v1/teaching-review-evidence/guide-restoration-v1/review-manifest.v1.json';
import selectionAsset from '../../resources/formula-library/v1/teaching-selection.v1.json';
import { SUPPORTED_LOCALES } from '@/i18n/supported-locales';
import {
  RESTORED_GUIDE_FORMULA_IDS_V1,
  isRestoredGuideFormulaV1,
  loadRestoredGuideLocalesV1,
} from '@/content/teaching/restored-guide-projection';

const evidenceRoot = join(
  process.cwd(),
  'resources/formula-library/v1/teaching-review-evidence/guide-restoration-v1',
);

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('restored Guide projection v1', () => {
  it('publishes exactly four reviewed Guides without mutating the 50-package selection', () => {
    const selectedIds = new Set(selectionAsset.rows.map((row) => row.formulaId));
    const restoredIds = restoredAsset.rows.map((row) => row.formulaId);

    expect(selectionAsset.rows).toHaveLength(50);
    expect(restoredAsset).toMatchObject({
      schema: 'fractalpark-teaching-restored-guide-projection/v1',
      status: 'published',
      guideCount: 4,
      localeCount: 7,
      scope: {
        expectedCommit: '26d',
        teachingPackageMutation: false,
        reviewedTeachingPackageCount: 50,
      },
    });
    expect(RESTORED_GUIDE_FORMULA_IDS_V1).toEqual(restoredIds);
    expect(new Set(restoredIds)).toHaveLength(4);
    expect(restoredIds.every((formulaId) => !selectedIds.has(formulaId))).toBe(
      true,
    );
  });

  it('delivers every restored Guide in exactly the seven supported locales', () => {
    for (const formulaId of RESTORED_GUIDE_FORMULA_IDS_V1) {
      expect(isRestoredGuideFormulaV1(formulaId)).toBe(true);
      expect(loadRestoredGuideLocalesV1(formulaId)).toEqual(SUPPORTED_LOCALES);
    }
    expect(isRestoredGuideFormulaV1(selectionAsset.rows[0].formulaId)).toBe(
      false,
    );
    expect(loadRestoredGuideLocalesV1('not-a-formula-id')).toEqual([]);
  });

  it('preserves rejected revisions and requires both final reviewers to approve', () => {
    expect(reviewEvidence.rounds).toHaveLength(5);
    expect(reviewEvidence.rounds.slice(0, 4).map(({ status }) => status)).toEqual(
      ['rejected', 'rejected', 'rejected', 'rejected'],
    );
    expect(reviewEvidence.rounds[4]).toMatchObject({
      revision: 5,
      status: 'approved',
      candidateSha256:
        '89f45d192fa6afa67c4bd08f0c8009478bce7788e7842d207b9be9dfaf47594d',
      deepseek: {
        actualModel: 'deepseek-v4-flash',
        finishReason: 'stop',
        verdict: 'APPROVE',
      },
      kimi: {
        actualModel: 'k3-256k',
        finishReason: 'stop',
        verdict: 'APPROVE',
      },
    });
    expect(reviewEvidence.finalVerdict).toMatchObject({
      status: 'approved',
      deepseek: 'APPROVE / NO_FINDINGS',
      kimi: 'APPROVE / NO_FINDINGS',
    });
    expect(reviewEvidence.maintainerAuthorization).toMatchObject({
      status: 'authorized',
      actorId: 'fractalpark-maintainer',
      actorKind: 'human-maintainer',
      maintainerResponse: '好的，继续，需要复审',
      scope: 'Expected Commit 26d only',
    });
  });

  it('binds every raw review wrapper and the final candidate to its manifest metadata', () => {
    for (const round of reviewEvidence.rounds) {
      for (const provider of ['deepseek', 'kimi'] as const) {
        const binding = round[provider];
        const path = join(evidenceRoot, binding.path);
        const wrapper = JSON.parse(readFileSync(path, 'utf8')) as {
          provider: string;
          requestedModel: string;
          actualModel: string;
          finishReason: string;
          candidateSha256?: string;
          draftSha256?: string;
          reviewPackageSha256: string;
          review: string;
        };
        expect(sha256File(path)).toBe(binding.sha256);
        expect(wrapper).toMatchObject({
          provider,
          requestedModel: binding.requestedModel,
          actualModel: binding.actualModel,
          finishReason: binding.finishReason,
          reviewPackageSha256: round.reviewPackageSha256,
        });
        expect(wrapper.candidateSha256 ?? wrapper.draftSha256).toBe(
          round.candidateSha256,
        );
        expect(wrapper.review.startsWith(`VERDICT: ${binding.verdict}`)).toBe(
          true,
        );
      }
    }

    const candidatePath = join(evidenceRoot, reviewEvidence.finalCandidatePath);
    const candidate = JSON.parse(readFileSync(candidatePath, 'utf8')) as {
      schema: string;
      entries: Record<string, Record<string, unknown>>;
    };
    expect(sha256File(candidatePath)).toBe(reviewEvidence.finalCandidateSha256);
    expect(reviewEvidence.finalCandidateSha256).toBe(
      restoredAsset.pins.finalReviewedCandidateSha256,
    );
    expect(candidate.schema).toBe('fractalpark-guide-restoration-draft/v5');
    for (const locale of SUPPORTED_LOCALES) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8'),
      ) as { formulas: { entries: Record<string, unknown> } };
      for (const row of restoredAsset.rows) {
        expect(candidate.entries[locale][row.guideSlug]).toEqual(
          messages.formulas.entries[row.guideSlug],
        );
      }
    }
  });
});
