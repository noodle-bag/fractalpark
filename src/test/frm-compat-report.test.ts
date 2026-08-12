/**
 * Level-2 compatibility report schema + verifier (v0.4.18 Slice 7d).
 * Clean-room synthetic fixtures only — no corpus content. The verifier
 * must catch tampering, shape drift, and aggregate inconsistency.
 */

import { describe, it, expect } from 'vitest';
import {
  computeContentHash,
  verifyCompatReport,
  FRM_COMPAT_REPORT_SCHEMA,
  type CompatReport,
} from '../engine/frm/compat-report';

function fixtureReport(): Omit<CompatReport, 'contentHash'> {
  return {
    schema: FRM_COMPAT_REPORT_SCHEMA,
    reportVersion: 'level2/2026-08-12',
    compilerCommit: '0'.repeat(40),
    corpusSnapshotHash: 'a'.repeat(64),
    selectorVersion: 'sentinel-v2',
    environment: { node: 'v22.0.0', platform: 'linux', device: 'test' },
    generatedAt: '2026-08-12T00:00:00.000Z',
    durationMs: 1234,
    layers: {
      files: { evaluated: 588, passed: 588, reasonBreakdown: {} },
      syntax: { evaluated: 588, passed: 579, reasonBreakdown: { 'documented-waiver': 9 } },
      semantics: { evaluated: 588, passed: 588, reasonBreakdown: {} },
      orbits: { evaluated: 579, passed: 579, reasonBreakdown: {} },
      webgl: { evaluated: 581, passed: 581, reasonBreakdown: { 'off-by-one': 2 } },
    },
    totals: { target: 588, excluded: 117, waivers: 9 },
  };
}

function signed(): CompatReport {
  const payload = fixtureReport();
  return { ...payload, contentHash: computeContentHash(payload) };
}

describe('compat report verifier', () => {
  it('accepts a well-formed signed report', () => {
    const result = verifyCompatReport(signed());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects tampering with any payload field', () => {
    const tampered = signed();
    tampered.layers.orbits.passed = 1;
    const result = verifyCompatReport(tampered);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('contentHash mismatch');
  });

  it('rejects a wrong schema tag', () => {
    const bad = { ...signed(), schema: 'frm-compat-report/v1' } as unknown as CompatReport;
    const result = verifyCompatReport(bad);
    expect(result.ok).toBe(false);
  });

  it('rejects aggregate inconsistency (syntax must cover the target set)', () => {
    const payload = fixtureReport();
    payload.totals.target = 999;
    const report = { ...payload, contentHash: computeContentHash(payload) };
    const result = verifyCompatReport(report);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('totals.target');
  });

  it('rejects malformed hashes and non-object input', () => {
    expect(verifyCompatReport(null).ok).toBe(false);
    expect(verifyCompatReport('x').ok).toBe(false);
    const bad = signed();
    bad.compilerCommit = 'notasha';
    expect(verifyCompatReport(bad).ok).toBe(false);
  });

  it('rejects malformed-but-rehashed reports (hash alone is not enough)', () => {
    // Negative counts
    const neg = fixtureReport();
    neg.layers.orbits.passed = -1;
    const negSigned = { ...neg, contentHash: computeContentHash(neg) };
    expect(verifyCompatReport(negSigned).ok).toBe(false);
    // Null environment
    const noEnv = { ...fixtureReport(), environment: null } as unknown as Omit<CompatReport, 'contentHash'>;
    const noEnvSigned = { ...noEnv, contentHash: computeContentHash(noEnv) };
    expect(verifyCompatReport(noEnvSigned).ok).toBe(false);
    // waiver arithmetic broken
    const badW = fixtureReport();
    badW.totals.waivers = 3;
    const badWSigned = { ...badW, contentHash: computeContentHash(badW) };
    const badWResult = verifyCompatReport(badWSigned);
    expect(badWResult.ok).toBe(false);
    expect(badWResult.errors.join('\n')).toContain('waivers');
    // non-integer reason counts
    const badReason = fixtureReport();
    badReason.layers.webgl.reasonBreakdown = { 'off-by-one': 1.5 };
    const badReasonSigned = { ...badReason, contentHash: computeContentHash(badReason) };
    expect(verifyCompatReport(badReasonSigned).ok).toBe(false);
    // Infinity duration is not a valid finite count
    const inf = fixtureReport();
    inf.durationMs = Infinity;
    const infSigned = { ...inf, contentHash: computeContentHash(inf) };
    expect(verifyCompatReport(infSigned).ok).toBe(false);
    // unexpected top-level fields break the frozen schema
    const extra = { ...fixtureReport(), unexpected: 'x' } as Omit<CompatReport, 'contentHash'>;
    const extraSigned = { ...extra, contentHash: computeContentHash(extra) };
    const extraResult = verifyCompatReport(extraSigned);
    expect(extraResult.ok).toBe(false);
    expect(extraResult.errors.join('\n')).toContain('unexpected');
  });

  it('canonical ordering is locale-independent (code-unit order)', () => {
    // Non-ASCII keys must sort by code unit, not by locale collation.
    const a = { z: 1, ä: 2, a: 3 };
    const b = { a: 3, ä: 2, z: 1 };
    const hashA = computeContentHash({ ...fixtureReport(), layers: { ...fixtureReport().layers, files: { evaluated: 588, passed: 588, reasonBreakdown: a } } });
    const hashB = computeContentHash({ ...fixtureReport(), layers: { ...fixtureReport().layers, files: { evaluated: 588, passed: 588, reasonBreakdown: b } } });
    expect(hashA).toBe(hashB);
  });

  it('hash is key-order independent (canonical form)', () => {
    const a = fixtureReport();
    const reordered = {
      totals: a.totals,
      layers: a.layers,
      durationMs: a.durationMs,
      generatedAt: a.generatedAt,
      environment: a.environment,
      selectorVersion: a.selectorVersion,
      corpusSnapshotHash: a.corpusSnapshotHash,
      compilerCommit: a.compilerCommit,
      reportVersion: a.reportVersion,
      schema: a.schema,
    } as Omit<CompatReport, 'contentHash'>;
    expect(computeContentHash(reordered)).toBe(computeContentHash(a));
  });
});
