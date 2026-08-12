/**
 * Four-level compatibility classification (v0.4.18 Slice 7e1).
 * Clean-room sources only. The level must be decided mechanically by the
 * failing stage, adaptations must match the engine's own declared facts,
 * and no path may silently guess.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { frmParserCache } from '../engine/frm/cache';
import {
  classifyFrmSource,
  FRM_COMPAT_LEVELS,
  type FrmCompatLevel,
} from '../engine/frm/compat-status';
import { FRM_CAPABILITY_MANIFEST } from '../engine/frm/capability-manifest';

beforeEach(() => frmParserCache.clear());

function levelOf(source: string, key?: string): FrmCompatLevel {
  const r = classifyFrmSource(source);
  if (key === undefined) {
    expect(r.entries).toHaveLength(1);
    return r.entries[0].level;
  }
  const entry = r.entries.find((e) => e.key === key);
  expect(entry, `entry ${key}`).toBeDefined();
  return entry!.level;
}

describe('compat-status levels', () => {
  it('supported: plain C1 polynomial, smooth supported, no adaptations', () => {
    const r = classifyFrmSource('M {\n  z=pixel:\n  z=z*z+pixel\n  |z|<=4\n}');
    expect(r.entries[0].level).toBe('supported');
    expect(r.entries[0].runnable).toBe(true);
    expect(r.entries[0].adaptations).toEqual([]);
  });

  it('adapted via transcendental smooth capability', () => {
    const r = classifyFrmSource('S {\n  z=pixel:\n  z=sin(z)+pixel\n  |z|<=4\n}');
    expect(r.entries[0].level).toBe('adapted');
    expect(r.entries[0].adaptations).toContain('smooth-adapted');
  });

  it('adapted via exotic descriptor kinds (C2/C4R/C5)', () => {
    const c2 = classifyFrmSource('C2 {\n  z=pixel:\n  z=z*z+pixel\n  |z|<=p2\n}');
    expect(c2.entries[0].adaptations).toContain('exotic-bailout-C2');
    expect(c2.entries[0].level).toBe('adapted');
    const c4 = classifyFrmSource('C4 {\n  z=pixel:\n  z=z*z+pixel\n  |real(z)|<=4\n}');
    expect(c4.entries[0].adaptations).toContain('exotic-bailout-C4R');
    expect(c4.entries[0].adaptations).toContain('smooth-fallback-escape-time');
    const c5 = classifyFrmSource('C5 {\n  z=pixel:\n  z=z*z+pixel\n  LastSqr<=4\n}');
    expect(c5.entries[0].adaptations).toContain('exotic-bailout-C5');
  });

  it('adapted when the lowering injects the default bailout', () => {
    // Classic entry with NO predicate line — the frontend injects the
    // default contract and records a lowering note.
    const r = classifyFrmSource('NoBail {\n  z=pixel:\n  z=z*z+pixel\n}');
    expect(r.entries[0].level).toBe('adapted');
    expect(r.entries[0].adaptations).toContain('default-bailout-injected');
    expect(r.entries[0].diagnostics.some((d) => d.reasonCode === 'lowering-default-bailout')).toBe(true);
  });

  it('read-only: parsed entry rejected by the descriptor contract', () => {
    // m is loop-assigned but never a proven |z| alias → unknown-magnitude-form
    const r = classifyFrmSource('RO {\n  z=pixel:\n  m=z\n  z=z*z+pixel\n  m<=4\n}');
    expect(r.entries[0].level).toBe('read-only');
    expect(r.entries[0].runnable).toBe(false);
    const codes = r.entries[0].diagnostics.map((d) => d.reasonCode);
    expect(codes).toContain('unknown-magnitude-form');
    expect(r.entries[0].diagnostics.every((d) => d.blocking === (d.severity === 'error'))).toBe(true);
  });

  it('read-only: parsed entry failing validation (undeclared variable)', () => {
    const r = classifyFrmSource('UV {\n  z=pixel:\n  z=z*z+nope\n  |z|<=4\n}');
    expect(r.entries[0].level).toBe('read-only');
  });

  it('invalid: structural fatality (unparseable body)', () => {
    const r = classifyFrmSource('Bad {\n  z=pixel:\n  z=z*z+\n  |z|<=4\n}');
    expect(r.entries[0].level).toBe('invalid');
    expect(r.entries[0].runnable).toBe(false);
    expect(r.entries[0].diagnostics.some((d) => d.reasonCode === 'parse-error' && d.blocking)).toBe(true);
  });

  it('invalid: write-protected system variable assignment', () => {
    const r = classifyFrmSource('WP {\n  pixel=z, z=pixel:\n  z=z*z+pixel\n  |z|<=4\n}');
    expect(r.entries[0].level).toBe('invalid');
  });

  it('no recognizable entries → empty entries + blocking source diagnostic', () => {
    const r = classifyFrmSource('; just a comment\nnothing here\n');
    expect(r.entries).toEqual([]);
    expect(r.sourceDiagnostics.some((d) => d.reasonCode === 'scan-no-entries' && d.blocking)).toBe(true);
  });
});

describe('compat-status multi-entry and diagnostics discipline', () => {
  it('classifies each entry independently (mixed levels)', () => {
    const source = [
      'Good {\n  z=pixel:\n  z=z*z+pixel\n  |z|<=4\n}',
      'AlsoGood {\n  z=pixel:\n  z=sin(z)+pixel\n  |z|<=4\n}',
      'Broken {\n  z=pixel:\n  m=z\n  z=z*z+pixel\n  m<=4\n}',
    ].join('\n');
    expect(levelOf(source, 'Good')).toBe('supported');
    expect(levelOf(source, 'AlsoGood')).toBe('adapted');
    expect(levelOf(source, 'Broken')).toBe('read-only');
  });

  it('dedupes diagnostics by reasonCode + location', () => {
    const r = classifyFrmSource('D {\n  z=pixel:\n  m=z\n  z=z*z+pixel\n  m<=4\n}');
    const keys = r.entries[0].diagnostics.map((d) => `${d.reasonCode}@${d.line ?? ''}:${d.col ?? ''}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never emits an adaptation outside the declared vocabulary', () => {
    const sources = [
      'A1 {\n  z=pixel:\n  z=z*z+pixel\n  |z|<=p2\n}',
      'A2 {\n  z=pixel:\n  z=sin(z)+pixel\n  |z|<=4\n}',
      'A3 {\n  z=pixel:\n  z=z*z+pixel\n  |real(z)|<=4\n}',
      'A4 {\n  z=pixel:\n  z=z*z+pixel\n  LastSqr<=4\n}',
    ];
    const allowed = new Set([
      ...FRM_CAPABILITY_MANIFEST.bailout.descriptorKinds.map((k) => `exotic-bailout-${k}`),
      'smooth-adapted',
      'smooth-fallback-escape-time',
      'default-bailout-injected',
      'c-init-rebinding',
    ]);
    for (const s of sources) {
      for (const a of classifyFrmSource(s).entries[0].adaptations) {
        expect(allowed.has(a), `adaptation ${a}`).toBe(true);
      }
    }
  });

  it('level vocabulary matches the manifest-facing four-level contract', () => {
    expect(FRM_COMPAT_LEVELS).toEqual(['supported', 'adapted', 'read-only', 'invalid']);
  });
});

describe('compat-status review-hardening (Codex 7e1 round-1)', () => {
  it('keeps DISTINCT same-code semantic errors at different locations', () => {
    // Two undeclared variables: both diagnostics must survive dedupe, and
    // each must carry a mapped classic line.
    const r = classifyFrmSource(
      'TwoVars {\n  z=pixel:\n  u=nope\n  v=wat\n  z=z*z+pixel\n  |z|<=4\n}',
    );
    const semantic = r.entries[0].diagnostics.filter((d) => d.reasonCode === 'compile-error');
    expect(semantic.length).toBeGreaterThanOrEqual(2);
    expect(semantic.every((d) => typeof d.line === 'number' && d.line >= 3 && d.line <= 4)).toBe(true);
  });

  it('does not reintroduce parse warnings as blocking compile errors', () => {
    // Unterminated if (warning) + descriptor reject: the warning must stay
    // a non-blocking warning, and no phantom blocking 'compile-error'
    // duplicate of it may appear (the ⚠️-prefixed formatted warning must
    // match the structured one and be skipped).
    const r = classifyFrmSource(
      'Warn {\n  z=pixel:\n  if(real(z)<1)\n  z=z+pixel\n  m=z\n  z=z*z+pixel\n  m<=4\n}',
    );
    const d = r.entries[0].diagnostics;
    // The endif warning appears exactly once, as a non-blocking warning:
    const endifMentions = d.filter((x) => /endif/i.test(x.message));
    expect(endifMentions).toHaveLength(1);
    expect(endifMentions[0].severity).toBe('warning');
    expect(endifMentions[0].blocking).toBe(false);
    // The descriptor reject still blocks, with a mapped classic line:
    const reject = d.find((x) => x.reasonCode === 'unknown-magnitude-form');
    expect(reject?.blocking).toBe(true);
    expect(reject?.line).toBe(7);
    expect(r.entries[0].level).toBe('read-only');
  });

  it('does not remap lowering-note lines (they are classic coordinates)', () => {
    // NoBail: predicate line missing → default-bailout note at the classic
    // loop line (3), not a remapped native line.
    const r = classifyFrmSource('NoBail2 {\n  z=pixel:\n  z=z*z+pixel\n}');
    const note = r.entries[0].diagnostics.find((d) => d.reasonCode === 'lowering-default-bailout');
    expect(note).toBeDefined();
    expect(note!.line).toBe(3);
  });

  it('c-init rebinding drives the adapted level', () => {
    const r = classifyFrmSource('Rebind {\n  c=pixel, z=0:\n  z=z*z+c\n  |z|<=4\n}');
    expect(r.entries[0].level).toBe('adapted');
    expect(r.entries[0].adaptations).toContain('c-init-rebinding');
  });

  it('a structurally broken sibling entry makes entries invalid, not read-only', () => {
    const source = [
      'Fine {\n  z=pixel:\n  z=z*z+pixel\n  |z|<=4\n}',
      'Unclosed {\n  z=pixel:\n  z=z*z+pixel\n  |z|<=4',
    ].join('\n');
    const r = classifyFrmSource(source);
    const unclosed = r.entries.find((e) => e.key === 'Unclosed');
    expect(unclosed).toBeDefined();
    expect(unclosed!.level).toBe('invalid');
  });

  it('two function= slot defaults on one header line both survive as notes', () => {
    // Classic bracket-option syntax: function=<fn1>/<fn2>/...
    const r = classifyFrmSource(
      'FnDef (XAXIS_NOPARM)[function=sin/cos] {\n  z=pixel:\n  z=fn1(z)+fn2(z)+pixel\n  |z|<=4\n}',
    );
    const notes = r.entries[0].diagnostics.filter(
      (d) => d.reasonCode === 'lowering-function-option-recorded',
    );
    expect(notes.length).toBe(2);
  });
});
