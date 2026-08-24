import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { STANDARD_MANIFEST_INDEX_V1 } from '@/engine/formulas/v1/standard-manifest';
import {
  FORMULA_RECORD_COUNT_V1,
  FORMULA_RECORD_PREVIEW_HEIGHT_V1,
  FORMULA_RECORD_PREVIEW_WIDTH_V1,
  PUBLISHED_FORMULA_RECORD_COUNT_V1,
  buildFormulaRecordV1,
} from '@/lib/formula-records';

const PUBLIC_ROOT = join(process.cwd(), 'public');
const PREVIEW_ROOT = join(PUBLIC_ROOT, 'formula-library/v1/previews');

describe('public Formula Record v1', () => {
  const records = STANDARD_MANIFEST_INDEX_V1.formulaIds.map((formulaId) => {
    const record = buildFormulaRecordV1(formulaId, 'en');
    if (!record) throw new Error(`missing-formula-record:${formulaId}`);
    return record;
  });

  it('accounts for every Standard identity and the frozen decision set', () => {
    expect(FORMULA_RECORD_COUNT_V1).toBe(677);
    expect(PUBLISHED_FORMULA_RECORD_COUNT_V1).toBe(534);
    expect(records).toHaveLength(677);
    expect(new Set(records.map((record) => record.formulaId))).toHaveLength(677);

    expect(
      records.filter((record) => record.publicationDecision === 'publish')
    ).toHaveLength(534);
    expect(
      records.filter((record) => record.publicationDecision === 'hold')
    ).toHaveLength(143);
    expect(
      records.filter((record) => record.publicationDecision === 'exclude')
    ).toHaveLength(0);
    expect(
      Object.fromEntries(
        [
          'project-owned',
          'source-declared-public-domain-assumption',
          'gpl-3.0-only',
          'no-explicit-permission',
        ].map((status) => [
          status,
          records.filter((record) => record.rightsStatus === status).length,
        ])
      )
    ).toEqual({
      'project-owned': 89,
      'source-declared-public-domain-assumption': 137,
      'gpl-3.0-only': 73,
      'no-explicit-permission': 378,
    });
    const gplRecords = records.filter(
      (record) => record.rightsStatus === 'gpl-3.0-only'
    );
    expect(gplRecords).toHaveLength(73);
    expect(
      gplRecords.every((record) => record.publicationDecision === 'hold')
    ).toBe(true);
    expect(
      records.reduce((count, record) => count + record.aliases.length, 0)
    ).toBe(797);
    expect(
      records
        .flatMap((record) => record.aliases)
        .filter((alias) => alias.kind === 'guide-slug')
    ).toHaveLength(21);
  });

  it('gives every published Record canonical source, deterministic preview, and working action destinations', () => {
    const published = records.filter(
      (record) => record.publicationDecision === 'publish'
    );

    for (const record of published) {
      expect(record.availability).toBe('published');
      if (record.availability !== 'published') throw new Error('unreachable');

      expect(record.source.href).toMatch(
        /^\/formula-library\/v1\/runtime\/published\/definitions\/[a-f0-9]{64}\.frm$/
      );
      expect(record.source.sourceRevision).toMatch(/^[a-f0-9]{64}$/);
      expect(record.source.semanticHash).toMatch(/^[a-f0-9]{64}$/);
      expect(record.source.languageVersion).toBe('frm-like/1');
      expect(record.source.stdlibVersion).toBe(1);
      expect(record.source.parameters).toBeInstanceOf(Array);
      expect(record.defaultProfile.mode).toMatch(/^(parameter-plane|julia)$/);
      expect(record.defaultProfile.center).toHaveLength(2);
      expect(record.defaultProfile.center.every(Number.isFinite)).toBe(true);
      expect(record.defaultProfile.zoom).toBeGreaterThan(0);
      expect(record.defaultProfile.iterations).toBeGreaterThan(0);
      expect(record.defaultProfile.quality).toMatch(/^(mechanical|family)$/);

      expect(record.preview.src).toBe(
        `/formula-library/v1/previews/${record.formulaId}.png`
      );
      expect(record.preview.width).toBe(FORMULA_RECORD_PREVIEW_WIDTH_V1);
      expect(record.preview.height).toBe(FORMULA_RECORD_PREVIEW_HEIGHT_V1);
      expect(record.preview.pngSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(record.preview.status).toBe(
        record.preview.anomalies.length === 0 ? 'ready' : 'diagnostic'
      );
      expect(existsSync(join(PUBLIC_ROOT, record.preview.src))).toBe(true);
      expect(readFileSync(join(PUBLIC_ROOT, record.preview.src)).subarray(1, 4).toString()).toBe('PNG');

      expect(record.actions.openExploreHref).toBe(
        `/en/explore?open=standard-formula&formula=${record.formulaId}`
      );
      expect(record.actions.remixHref).toBe(
        `/en/formulas/editor?open=standard-formula&formula=${record.formulaId}&intent=remix`
      );
    }
  });

  it('pins the exact preview output set and every PNG byte string', () => {
    const manifest = JSON.parse(
      readFileSync(join(PREVIEW_ROOT, 'manifest.json'), 'utf8')
    ) as {
      schema: string;
      width: number;
      height: number;
      rowCount: number;
      rows: Array<{ formulaId: string; file: string; pngSha256: string }>;
      manifestContentHash: string;
    };
    expect(manifest.schema).toBe('fractalpark-formula-record-previews/v1');
    expect(manifest.width).toBe(FORMULA_RECORD_PREVIEW_WIDTH_V1);
    expect(manifest.height).toBe(FORMULA_RECORD_PREVIEW_HEIGHT_V1);
    expect(manifest.rowCount).toBe(PUBLISHED_FORMULA_RECORD_COUNT_V1);
    expect(manifest.rows).toHaveLength(PUBLISHED_FORMULA_RECORD_COUNT_V1);
    expect(
      records.filter(
        (record) =>
          record.availability === 'published' && record.preview.status === 'ready'
      )
    ).toHaveLength(357);
    expect(
      records.filter(
        (record) =>
          record.availability === 'published' && record.preview.status === 'diagnostic'
      )
    ).toHaveLength(177);
    expect(new Set(manifest.rows.map((row) => row.formulaId))).toEqual(
      new Set(
        records
          .filter((record) => record.publicationDecision === 'publish')
          .map((record) => record.formulaId)
      )
    );
    expect(readdirSync(PREVIEW_ROOT).sort()).toEqual(
      [...manifest.rows.map((row) => row.file), 'manifest.json'].sort()
    );

    for (const row of manifest.rows) {
      const bytes = readFileSync(join(PREVIEW_ROOT, row.file));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        row.pngSha256
      );
    }
    const { manifestContentHash, ...withoutHash } = manifest;
    expect(
      createHash('sha256').update(JSON.stringify(withoutHash)).digest('hex')
    ).toBe(manifestContentHash);
  });

  it('keeps held and excluded Records factual and renders no runnable CTA payload', () => {
    const unavailable = records.filter(
      (record) => record.publicationDecision !== 'publish'
    );

    for (const record of unavailable) {
      expect(record.availability).toBe(record.publicationDecision);
      expect(record.decisionReason).toBeTruthy();
      expect(record).not.toHaveProperty('source');
      expect(record).not.toHaveProperty('preview');
      expect(record).not.toHaveProperty('defaultProfile');
      expect(record).not.toHaveProperty('actions');
    }
  });

  it('discloses rights and takedown facts without exposing private provenance or third-party source', () => {
    for (const record of records) {
      expect(record.canonicalName).toBeTruthy();
      expect(record.originalName).toBeTruthy();
      expect(record.authorStatus).toBe('unconfirmed');
      expect(record.originalResourceStatus).toBe('unconfirmed');
      expect(record.originalVersionStatus).toBe('unconfirmed');
      expect(record.aliases.length).toBeGreaterThan(0);
      expect(record.provenanceCollection).toMatch(/^(F588|B94)$/);
      expect(record.rightsStatus).toMatch(
        /^(project-owned|source-declared-public-domain-assumption|gpl-3\.0-only|no-explicit-permission)$/
      );
      expect(record.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(record.takedown.email).toBe('contact@fractalpark.com');
      expect(record.takedown.subject).toContain(record.formulaId);

      const serialized = JSON.stringify(record);
      expect(serialized).not.toContain('originalSource');
      expect(serialized).not.toContain('sourceFile');
      expect(serialized).not.toContain('private');
      expect(serialized).not.toContain('credential');
    }
  });

  it('keeps all localized Record message keys compatible with next-intl namespaces', () => {
    const dottedKeys: string[] = [];
    const visit = (value: unknown, path: string) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      for (const [key, child] of Object.entries(value)) {
        if (key.includes('.')) dottedKeys.push(`${path}.${key}`);
        visit(child, `${path}.${key}`);
      }
    };
    for (const locale of ['en', 'zh', 'pt', 'ko', 'ru', 'es', 'fr']) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8')
      ) as { formulas: { record: unknown } };
      visit(messages.formulas.record, `${locale}.formulas.record`);
    }
    expect(dottedKeys).toEqual([]);
  });

  it('fails closed for unknown IDs and invalid locales', () => {
    const formulaId = STANDARD_MANIFEST_INDEX_V1.formulaIds[0];
    expect(buildFormulaRecordV1(formulaId, '')).toBeUndefined();
    expect(
      buildFormulaRecordV1(
        '00000000-0000-5000-8000-000000000000' as typeof formulaId,
        'en'
      )
    ).toBeUndefined();
  });
});
