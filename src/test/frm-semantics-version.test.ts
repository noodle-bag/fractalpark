/**
 * frmSemanticsVersion mechanism-layer tests (v0.4.18 Slice 2, commit 5).
 *
 * Covers the version contract of docs/specs/frm-compatibility-v1.md §3 and
 * docs/adr/0007-frm-semantics-versioning.md: the lenient resolver, the
 * compiler entry points (default 1, explicit v2 round-trip, cache key
 * separation), portable asset envelope read/write, and the cloud
 * custom-formula DTO mapping (missing column → undefined). v1/v2 compile
 * behavior is identical at this layer; semantic differences land in a later
 * Slice.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { FractalDocument } from '../engine/document';
import {
  DEFAULT_FRM_SEMANTICS_VERSION,
  resolveFrmSemanticsVersion,
  type FrmSemanticsVersion,
} from '../engine/frm/semantics-version';
import {
  compileClassicFrmEntry,
  compileFrm,
  compileFrmDetailed,
  compileFrmEntry,
  compileFrmRange,
} from '../engine/frm/compile';
import { frmParserCache } from '../engine/frm/cache';
import { readFractalDocumentEnvelope } from '../engine/document-envelope';
import { createFractalDocumentEnvelope } from '../lib/fractal-file';
import { getCustomFormula, saveCustomFormula } from '../lib/cloud/custom-formulas';
import envelopeV1 from './fixtures/documents/envelope-v1.json';

const MANDELBROT = `Mandelbrot {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

const CLASSIC_LL = 'LL-Style {\n\tz=0, c=pixel:\n\tz=z^2+c\n\tz<=4\n}';

const fixture = (name: string): string =>
  readFileSync(resolve(process.cwd(), 'src/test/fixtures/frm-scanner', name), 'utf8');

describe('resolveFrmSemanticsVersion: lenient reader rules', () => {
  it('resolves missing, null, undefined, and 1 to v1', () => {
    expect(resolveFrmSemanticsVersion(undefined)).toBe(1);
    expect(resolveFrmSemanticsVersion(null)).toBe(1);
    expect(resolveFrmSemanticsVersion(1)).toBe(1);
    expect(resolveFrmSemanticsVersion(DEFAULT_FRM_SEMANTICS_VERSION)).toBe(1);
  });

  it('resolves 2 to v2', () => {
    expect(resolveFrmSemanticsVersion(2)).toBe(2);
  });

  it('leniently reads abnormal values as v1 (with a warning)', () => {
    expect(resolveFrmSemanticsVersion(0)).toBe(1);
    expect(resolveFrmSemanticsVersion(3)).toBe(1);
    expect(resolveFrmSemanticsVersion('1')).toBe(1);
    expect(resolveFrmSemanticsVersion('2')).toBe(1);
    expect(resolveFrmSemanticsVersion(true)).toBe(1);
    expect(resolveFrmSemanticsVersion({})).toBe(1);
  });
});

describe('compiler: frmSemanticsVersion metadata', () => {
  beforeEach(() => {
    frmParserCache.clear();
  });

  it('defaults compileFrm results to frmSemanticsVersion 1', () => {
    const result = compileFrm(MANDELBROT);
    expect(result.success).toBe(true);
    expect(result.frmSemanticsVersion).toBe(1);
  });

  it('round-trips an explicit v2 through compileFrm without polluting the v1 cache entry', () => {
    const v2 = compileFrm(MANDELBROT, undefined, 2);
    expect(v2.success).toBe(true);
    expect(v2.frmSemanticsVersion).toBe(2);

    // Same source compiled as v1 must not reuse the cached v2 result.
    const v1 = compileFrm(MANDELBROT);
    expect(v1.success).toBe(true);
    expect(v1.frmSemanticsVersion).toBe(1);
  });

  it('defaults compileFrmDetailed to v1 and honors an explicit v2', () => {
    expect(compileFrmDetailed(MANDELBROT).frmSemanticsVersion).toBe(1);
    expect(compileFrmDetailed(MANDELBROT, undefined, 2).frmSemanticsVersion).toBe(2);
  });

  it('defaults compileFrmEntry to v1 on success and on selection failure', () => {
    const ok = compileFrmEntry(fixture('single-entry.frm'));
    expect(ok.success).toBe(true);
    expect(ok.frmSemanticsVersion).toBe(1);

    const failed = compileFrmEntry(fixture('multi-entry.frm'));
    expect(failed.success).toBe(false);
    expect(failed.selectionError?.code).toBe('selection-required');
    expect(failed.frmSemanticsVersion).toBe(1);
  });

  it('threads an explicit v2 through compileFrmEntry and compileFrmRange', () => {
    const source = fixture('multi-entry.frm');
    const byKey = compileFrmEntry(source, 'ScanJulia', undefined, 2);
    expect(byKey.success).toBe(true);
    expect(byKey.frmSemanticsVersion).toBe(2);

    const scan = { entries: [] as Array<{ range: { startOffset: number; endOffset: number } }> };
    // Re-scan through the public API surface is not needed: compileFrmRange
    // accepts scanner output, so compile the first entry via its range.
    const firstRange = compileFrmEntry(source, 'ScanMandel');
    void scan;
    const rangeResult = compileFrmRange(
      source,
      firstRange.entry!.range,
      undefined,
      2,
    );
    expect(rangeResult.success).toBe(true);
    expect(rangeResult.frmSemanticsVersion).toBe(2);
  });

  it('defaults compileClassicFrmEntry to v1 and honors an explicit v2', () => {
    const v1 = compileClassicFrmEntry(CLASSIC_LL);
    expect(v1.success).toBe(true);
    expect(v1.frmSemanticsVersion).toBe(1);

    const v2 = compileClassicFrmEntry(CLASSIC_LL, undefined, undefined, 2);
    expect(v2.success).toBe(true);
    expect(v2.frmSemanticsVersion).toBe(2);
  });
});

describe('portable assets: formula envelope version', () => {
  it('reads a formula asset with a missing version as v1', () => {
    const result = readFractalDocumentEnvelope(envelopeV1);
    expect(result.mode).toBe('editable');
    if (result.mode !== 'editable') return;
    expect(result.envelope.assets?.formulas?.[0]?.frmSemanticsVersion).toBe(1);
  });

  it('preserves an explicit v2 in a formula asset', () => {
    const withV2 = {
      ...envelopeV1,
      assets: {
        formulas: [
          {
            ...envelopeV1.assets.formulas[0],
            frmSemanticsVersion: 2,
          },
        ],
      },
    };
    const result = readFractalDocumentEnvelope(withV2);
    expect(result.mode).toBe('editable');
    if (result.mode !== 'editable') return;
    expect(result.envelope.assets?.formulas?.[0]?.frmSemanticsVersion).toBe(2);
  });

  it('writes the current semantics version into new portable assets', async () => {
    const document = envelopeV1.document as unknown as FractalDocument;
    const result = await createFractalDocumentEnvelope(document, [
      {
        id: 'custom-fixture',
        name: 'Custom Fixture',
        source: 'CustomFixture {\ninit:\n  z = pixel\nloop:\n  z = z^2 + c\nbailout:\n  |z| < 4\n}',
      },
    ]);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.assets?.formulas?.[0]?.frmSemanticsVersion).toBe(
      DEFAULT_FRM_SEMANTICS_VERSION,
    );
  });
});

describe('cloud custom-formula DTO mapping', () => {
  const FORMULA_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const BASE_ROW = {
    id: FORMULA_ID,
    name: 'Stored formula',
    revision: 1,
    source_bytes: 40,
    experience_hint: null,
    created_at: '2026-08-03T00:00:00Z',
    updated_at: '2026-08-03T00:00:00Z',
    source: MANDELBROT,
  };

  beforeEach(() => {
    process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = 'true';
    process.env.SUPABASE_URL = 'https://project.example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'pk';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sk';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FRACTALPARK_CREATION_CLOUD_ENABLED;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it('maps a row without the column to undefined', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify([BASE_ROW]), { status: 200 }),
      ),
    );
    const dto = await getCustomFormula('owner-id', FORMULA_ID);
    expect(dto.frmSemanticsVersion).toBeUndefined();
  });

  it('maps a stored version to the DTO', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify([{ ...BASE_ROW, frm_semantics_version: 2 }]), {
          status: 200,
        }),
      ),
    );
    const dto = await getCustomFormula('owner-id', FORMULA_ID);
    expect(dto.frmSemanticsVersion).toBe(2);
  });

  it('omits p_frm_semantics_version on an ordinary save (no auto-upgrade)', async () => {
    let capturedBody: string | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = typeof init?.body === 'string' ? init.body : null;
        return new Response(
          JSON.stringify({ replayed: false, formula: { id: FORMULA_ID, revision: 1 } }),
          { status: 200 },
        );
      }),
    );
    await saveCustomFormula({
      ownerId: 'owner-id',
      formulaId: null,
      expectedRevision: null,
      idempotencyKey: 'idem-1',
      requestHash: 'hash-1',
      name: 'No version',
      source: MANDELBROT,
      experienceHint: null,
    });
    expect(capturedBody).not.toContain('p_frm_semantics_version');
  });

  it('forwards p_frm_semantics_version only when explicitly given', async () => {
    let capturedBody: string | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = typeof init?.body === 'string' ? init.body : null;
        return new Response(
          JSON.stringify({ replayed: false, formula: { id: FORMULA_ID, revision: 1 } }),
          { status: 200 },
        );
      }),
    );
    await saveCustomFormula({
      ownerId: 'owner-id',
      formulaId: null,
      expectedRevision: null,
      idempotencyKey: 'idem-2',
      requestHash: 'hash-2',
      name: 'Strict v2',
      source: MANDELBROT,
      experienceHint: null,
      frmSemanticsVersion: 2 satisfies FrmSemanticsVersion,
    });
    expect(capturedBody).toContain('"p_frm_semantics_version":2');
  });
});
