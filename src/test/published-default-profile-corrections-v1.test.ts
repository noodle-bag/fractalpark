import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CORRECTED_PUBLISHED_DEFAULT_PROFILE_IDS_V1,
  resolveApplicationPublishedDefaultProfileV1,
  resolveCorrectedPublishedDefaultProfileV1,
} from '@/engine/formulas/v1/published-default-profile-corrections-v1';
import { parsePublishedFormulaRuntimeIndexV1 } from '@/engine/formulas/v1/published-runtime';
import { resolveActivatedPublishedFormulaDefaultProfileV1 } from '@/engine/formulas/v1/julia-runtime-activation-v1';
import { canonicalJsonV1, sha256HexSyncV1 } from '@/engine/formulas/v1/revisions';
import previewProfiles from '../../resources/formula-library/v1/record-preview-profiles.v1.json';

const INDEX_PATH = join(
  process.cwd(),
  'public/formula-library/v1/runtime/published/index.json',
);

describe('published default Profile corrections v1', () => {
  it('preserves every pre-separation application default and exactly 13 reviewed differences', () => {
    const parsed = parsePublishedFormulaRuntimeIndexV1(JSON.parse(readFileSync(INDEX_PATH, 'utf8')));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(sha256HexSyncV1(canonicalJsonV1(parsed.value.rows.map(row => [
      row.formulaId, resolveApplicationPublishedDefaultProfileV1(row),
    ]), 131_072))).toBe('071089a27f495b418f4d7cdd24ff6de5d920a04bd26be56c39889df532a647d2');
    expect(parsed.value.rows.filter(row => canonicalJsonV1(
      resolveApplicationPublishedDefaultProfileV1(row),
    ) !== canonicalJsonV1(resolveActivatedPublishedFormulaDefaultProfileV1(row)))
      .map(row => row.formulaId).sort()).toEqual(CORRECTED_PUBLISHED_DEFAULT_PROFILE_IDS_V1);
    const correctedJulia = parsed.value.rows.find(row =>
      CORRECTED_PUBLISHED_DEFAULT_PROFILE_IDS_V1.includes(row.formulaId) &&
      resolveApplicationPublishedDefaultProfileV1(row).mode === 'julia');
    expect(correctedJulia).toBeDefined();
    if (correctedJulia) expect(resolveApplicationPublishedDefaultProfileV1({
      ...correctedJulia, sourceRevision: '0'.repeat(64),
    }).mode).toBe('parameter-plane');
  });

  it('keeps all 534 asset-generation defaults bound to the sealed preview baseline', () => {
    const parsed = parsePublishedFormulaRuntimeIndexV1(
      JSON.parse(readFileSync(INDEX_PATH, 'utf8')),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const profiles = new Map(previewProfiles.rows.map(row => [row.formulaId, row]));
    for (const row of parsed.value.rows) {
      expect(sha256HexSyncV1(canonicalJsonV1(
        resolveActivatedPublishedFormulaDefaultProfileV1(row),
      )), row.formulaId).toBe(profiles.get(row.formulaId)?.runtimeDefaultProfileSha256);
    }
  });

  it('replaces exactly the 13 coarse-quantized defaults', () => {
    const parsed = parsePublishedFormulaRuntimeIndexV1(
      JSON.parse(readFileSync(INDEX_PATH, 'utf8')),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(CORRECTED_PUBLISHED_DEFAULT_PROFILE_IDS_V1).toHaveLength(13);
    const correctedIds = new Set(CORRECTED_PUBLISHED_DEFAULT_PROFILE_IDS_V1);
    const correctedRows = parsed.value.rows.filter((row) => correctedIds.has(row.formulaId));
    expect(correctedRows).toHaveLength(13);

    for (const row of correctedRows) {
      const profile = resolveCorrectedPublishedDefaultProfileV1(row);
      expect(profile).not.toBe(row.profile);
      expect(profile.iterations).toBe(200);
      expect(profile.probe).toBeUndefined();
      expect(Object.isFrozen(profile)).toBe(true);
    }

    expect(
      correctedRows
        .map((row) => resolveCorrectedPublishedDefaultProfileV1(row))
        .filter((profile) => profile.mode === 'julia'),
    ).toHaveLength(2);
    expect(
      resolveCorrectedPublishedDefaultProfileV1(
        correctedRows.find((row) => row.displayName === 'zaslavskyMap')!,
      ),
    ).toMatchObject({
      center: [-0.0036386858, -0.0036407475],
      zoom: 4,
      rotation: 0,
    });
  });

  it('preserves unrelated published Profiles by identity', () => {
    const parsed = parsePublishedFormulaRuntimeIndexV1(
      JSON.parse(readFileSync(INDEX_PATH, 'utf8')),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const mandelbrot = parsed.value.rows.find((row) => row.displayName === 'mandelbrot')!;
    expect(resolveCorrectedPublishedDefaultProfileV1(mandelbrot)).toBe(
      mandelbrot.profile,
    );
  });
});
