import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CORRECTED_PUBLISHED_DEFAULT_PROFILE_IDS_V1,
  resolveCorrectedPublishedDefaultProfileV1,
} from '@/engine/formulas/v1/published-default-profile-corrections-v1';
import { parsePublishedFormulaRuntimeIndexV1 } from '@/engine/formulas/v1/published-runtime';

const INDEX_PATH = join(
  process.cwd(),
  'public/formula-library/v1/runtime/published/index.json',
);

describe('published default Profile corrections v1', () => {
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
