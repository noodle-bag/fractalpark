import { describe, expect, it } from 'vitest';

import { hashFrmLikeV1, parseFrmLikeV1 } from '@/engine/frm/v1';
import type { PublishedFormulaRuntimeIndexRowV1 } from '@/engine/formulas/v1';
import {
  buildMineFormulaEditorHref,
  buildMineRemixLifecycleRevisionV1,
  buildPublishedFormulaRemixHref,
  collectMineRemixEditorErrorsV1,
  compileMineRemixSourceV1,
  createFrozenPublishedFormulaRemixV1,
  parseMineFormulaEditorIntent,
  parsePublishedFormulaRemixIntent,
  restoreFrozenMineFormulaRemixV1,
  stripMineFormulaEditorIntent,
  stripPublishedFormulaRemixIntent,
  validateMineRemixApplyV1,
} from '@/lib/published-formula-remix';

const PARENT_ID = '1cd7a16f-4745-5b8f-a974-e122ea893769';
const MINE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SOURCE = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
RemixSeed {
  parameters:
    power: real = 2 domain [1, 16] classic p1
  init:
    z = pixel
  loop:
    z = z ^ power + c
  bailout:
    |z| <= 4
}`;

async function fixture() {
  const parsed = parseFrmLikeV1(SOURCE);
  if (!parsed.ok) throw new Error(parsed.reason);
  const hashes = await hashFrmLikeV1(SOURCE, parsed.ir);
  const row: PublishedFormulaRuntimeIndexRowV1 = {
    formulaId: PARENT_ID,
    displayName: 'Remix Seed',
    family: 'polynomial',
    implementationBasis: 'project-owned',
    sourceRevision: hashes.sourceRevision,
    semanticHash: hashes.semanticHash,
    definitionPath: `definitions/${hashes.sourceRevision}.frm`,
    descriptorSchema: 'fractalpark-published-formula-descriptor/v1',
    parameters: [
      {
        slotName: 'power',
        type: 'real',
        default: 2,
        hardDomain: [1, 16],
        classicBinding: 'p1',
        uniformName: 'power',
      },
    ],
    profile: {
      schema: 'fractalpark-published-formula-profile/v1',
      quality: 'mechanical',
      mode: 'parameter-plane',
      center: [0, 0],
      zoom: 1,
      rotation: 0,
      iterations: 100,
    },
  };
  const source = {
    formulaId: PARENT_ID,
    sourceRevision: hashes.sourceRevision,
    semanticHash: hashes.semanticHash,
    href: `/formula-library/v1/runtime/published/definitions/${hashes.sourceRevision}.frm`,
    source: SOURCE,
    lineCount: SOURCE.split('\n').length,
    byteLength: new TextEncoder().encode(SOURCE).byteLength,
  };
  return { row, source };
}

describe('published Formula Remix handoff', () => {
  it('uses one exact editor handoff and strips only one-shot fields', () => {
    const href = buildPublishedFormulaRemixHref('en', PARENT_ID);
    expect(href).toBe(
      `/en/formulas/editor?open=standard-formula&formula=${PARENT_ID}&intent=remix`,
    );
    const params = new URL(href, 'https://fractalpark.test').searchParams;
    expect(parsePublishedFormulaRemixIntent(params)).toEqual({
      status: 'valid',
      formulaId: PARENT_ID,
    });
    params.set('palette', '4');
    expect(stripPublishedFormulaRemixIntent('en', params)).toBe(
      '/en/formulas/editor?palette=4',
    );
  });

  it('restores a Mine lifecycle formula through a one-shot owner handoff', () => {
    expect(buildMineFormulaEditorHref('en', MINE_ID)).toBe(
      `/en/formulas/editor?open=mine-formula&formula=${MINE_ID}`,
    );
    const params = new URLSearchParams(
      `open=mine-formula&formula=${MINE_ID}&keep=1`,
    );
    expect(parseMineFormulaEditorIntent(params)).toEqual({
      status: 'valid',
      formulaId: MINE_ID,
    });
    expect(stripMineFormulaEditorIntent('en', params)).toBe(
      '/en/formulas/editor?keep=1',
    );
    expect(
      parseMineFormulaEditorIntent(
        new URLSearchParams(`open=mine-formula&formula=${PARENT_ID}`),
      ).status,
    ).toBe('invalid');
  });

  it('fails closed for duplicates, non-Remix intents, and non-Standard IDs', () => {
    for (const query of [
      `open=standard-formula&formula=${PARENT_ID}&formula=${PARENT_ID}&intent=remix`,
      `open=standard-formula&formula=${PARENT_ID}&intent=open`,
      `open=standard-formula&formula=${MINE_ID}&intent=remix`,
    ]) {
      expect(
        parsePublishedFormulaRemixIntent(new URLSearchParams(query)).status,
      ).toBe('invalid');
    }
  });
});

describe('frozen published Formula Remix lifecycle', () => {
  it('freezes exact parent source/Profile revisions onto a new Mine identity', async () => {
    const { row, source } = await fixture();
    const fork = await createFrozenPublishedFormulaRemixV1({
      formulaId: MINE_ID,
      row,
      source,
    });
    expect(fork.formulaId).toBe(MINE_ID);
    expect(fork.parentFormulaId).toBe(PARENT_ID);
    expect(fork.parentSourceRevision).toBe(row.sourceRevision);
    expect(fork.parentProfileRevision).toMatch(/^[0-9a-f]{64}$/);
    expect(collectMineRemixEditorErrorsV1(source.source)).toEqual([]);
    const compiled = await compileMineRemixSourceV1({
      fork,
      source: source.source,
      runtimeFormulaId: `custom-formula:${MINE_ID}`,
    });
    expect(compiled.success).toBe(true);
    expect(compiled.plugin?.id).toBe(`custom-formula:${MINE_ID}`);
    expect(collectMineRemixEditorErrorsV1('not canonical')).toEqual([
      expect.objectContaining({ severity: 'error' }),
    ]);
    await expect(
      createFrozenPublishedFormulaRemixV1({
        formulaId: MINE_ID,
        row,
        source: { ...source, semanticHash: 'b'.repeat(64) },
      }),
    ).rejects.toThrow(/authority/i);
  });

  it('runs the Safety Envelope on Apply and preserves invalid source as a non-runnable editable head', async () => {
    const { row, source } = await fixture();
    const fork = await createFrozenPublishedFormulaRemixV1({
      formulaId: MINE_ID,
      row,
      source,
    });
    await expect(validateMineRemixApplyV1({ fork, source: SOURCE })).resolves.toEqual({
      ok: true,
    });
    const invalidSource = 'not canonical';
    const rejected = await validateMineRemixApplyV1({
      fork,
      source: invalidSource,
    });
    expect(rejected.ok).toBe(false);

    const invalid = await buildMineRemixLifecycleRevisionV1(fork, {
      name: 'Broken fork',
      source: invalidSource,
      runnable: false,
      diagnostics: ['Parse failed'],
    });
    expect(invalid.runnable).toBe(false);
    expect(invalid.diagnostics).toEqual([
      { code: 'invalid-draft', message: 'Parse failed' },
    ]);
    expect(invalid.remixedFromFormulaId).toBe(PARENT_ID);
    expect(invalid.lineageSourceRevision).toBe(row.sourceRevision);
    expect(invalid.lineageProfileRevision).toBe(fork.parentProfileRevision);
  });

  it('builds a runnable candidate only from exact applied source and explicit rehabilitation head', async () => {
    const { row, source } = await fixture();
    const fork = await createFrozenPublishedFormulaRemixV1({
      formulaId: MINE_ID,
      row,
      source,
    });
    const lifecycle = await buildMineRemixLifecycleRevisionV1(fork, {
      name: 'Working fork',
      source: SOURCE,
      runnable: true,
      diagnostics: ['must be discarded'],
      supersedes: '11111111-2222-4333-8444-555555555555',
    });
    expect(lifecycle.runnable).toBe(true);
    expect(lifecycle.diagnostics).toEqual([]);
    expect(lifecycle.supersedes).toBe('11111111-2222-4333-8444-555555555555');
    expect(lifecycle.definition).toMatchObject({
      formulaId: MINE_ID,
      scope: 'mine',
      name: 'Working fork',
      source: SOURCE,
    });
    const restored = restoreFrozenMineFormulaRemixV1({
      formulaId: MINE_ID,
      displayName: 'Working fork',
      source: SOURCE,
      definition: lifecycle.definition,
      profile: lifecycle.profile,
      remixedFromFormulaId: lifecycle.remixedFromFormulaId ?? null,
      lineageSourceRevision: lifecycle.lineageSourceRevision ?? null,
      lineageProfileRevision: lifecycle.lineageProfileRevision ?? null,
    });
    expect(restored).toMatchObject({
      formulaId: MINE_ID,
      parentFormulaId: PARENT_ID,
      parentSourceRevision: row.sourceRevision,
      parentProfileRevision: fork.parentProfileRevision,
    });
  });
});
