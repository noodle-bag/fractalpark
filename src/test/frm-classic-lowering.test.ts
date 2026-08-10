/**
 * Classic FRM lowering tests (v0.4.18 Slice 1, commit 4).
 *
 * Covers the IR rows of docs/testing/v0.4.18-regression-matrix.md: classic
 * header/structure/separator lowering into native syntax, with round-trip
 * evidence that every lowered entry compiles through the untouched
 * production pipeline. All fixtures are inline, project-authored clean-room
 * samples (no corpus text).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  lowerClassicEntryToNative,
  type LoweringNote,
} from '../engine/frm/classic-frontend';
import { compileClassicFrmEntry } from '../engine/frm/compile';
import { frmParserCache } from '../engine/frm/cache';

const kinds = (notes: LoweringNote[]) => notes.map((n) => n.kind);

describe('lowerClassicEntryToNative: section mapping', () => {
  it('lowers comma-separated init, colon loop transition, and trailing predicate', () => {
    const { native } = lowerClassicEntryToNative(
      'Mini {\n\tz=0, c=pixel:\n\tz=z^2+c\n\t|z| <= 4\n}',
    );
    expect(native).toContain('init:\n  z=0');
    expect(native).toContain('loop:\n  z=z^2+c');
    expect(native).toContain('bailout:\n  |z| <= 4');
  });

  it('splits multi-statement lines on commas across the loop section', () => {
    const { native } = lowerClassicEntryToNative(
      'Multi {\n\tz=pixel, g=0:\n\tg=g+1, z=z^2+c\n\t|z| < 64\n}',
    );
    expect(native).toContain('z=pixel');
    expect(native).toContain('g=0');
    expect(native).toContain('g=g+1');
    expect(native).toContain('z=z^2+c');
  });

  it('keeps a bailout= variable assignment out of the predicate section', () => {
    const { native, notes } = lowerClassicEntryToNative(
      'BailVar {\n\tz=0, bailout=1e12:\n\tz=z^2+c\n\t|z| < bailout\n}',
    );
    // The assignment survives (renamed so the native parser does not read it
    // as a section header); the predicate line is the real comparison.
    expect(native).toContain('bailout:\n  |z| <');
    expect(native).not.toContain('bailout:\n  z=0');
    expect(kinds(notes)).toContain('bailout-variable-renamed');
  });

  it('supplies the Fractint default bailout when the predicate is absent', () => {
    const { native, notes } = lowerClassicEntryToNative('NoPred {\n\tz=0:\n\tz=z^2+c\n}');
    expect(native).toContain('bailout:\n  |z| < 4');
    expect(kinds(notes)).toContain('default-bailout');
  });
});

describe('lowerClassicEntryToNative: header and text hygiene', () => {
  it('sanitises hyphenated names and records symmetry', () => {
    const { native, notes } = lowerClassicEntryToNative(
      'Hy-1 (XAXIS) {\n\tz=0:\n\tz=z^2+c\n\t|z|<4\n}',
    );
    expect(native.startsWith('Hy_1 {')).toBe(true);
    expect(kinds(notes)).toContain('name-sanitised');
    expect(kinds(notes)).toContain('symmetry-recorded');
  });

  it('normalizes CRLF and strips semicolon comments (including brace bait)', () => {
    const { native, notes } = lowerClassicEntryToNative(
      'Crlf {\r\n\tz=0: ; init { not a brace\r\n\tz=z^2+c\r\n\t|z|<4\r\n}',
    );
    expect(native).not.toContain('\r');
    expect(native).not.toContain('not a brace');
    expect(kinds(notes)).toContain('crlf-normalized');
    expect(kinds(notes)).toContain('comment-stripped');
  });

  it('removes the redundant c=pixel identity assignment', () => {
    const { native, notes } = lowerClassicEntryToNative(
      'CIdent {\n\tz=0, c=pixel:\n\tz=z^2+c\n\t|z|<4\n}',
    );
    expect(native).not.toContain('c=pixel');
    expect(kinds(notes)).toContain('c-pixel-assignment-removed');
  });

  it('splits chained assignments into ordered single assignments', () => {
    const { native, notes } = lowerClassicEntryToNative(
      'Chain {\n\tz=0, a=b=2:\n\tz=z^2+a\n\t|z|<4\n}',
    );
    expect(native).toContain('b = 2');
    expect(native).toContain('a = b');
    expect(kinds(notes)).toContain('chained-assignment-split');
  });

  it('lowers keyword-case IF blocks to native if/else/endif', () => {
    const { native } = lowerClassicEntryToNative(
      'Ify {\n\tz=0:\n\tIF (|z| > 1)\n\t  z = z^2 + c\n\tELSE\n\t  z = z + c\n\tENDIF\n\t|z|<4\n}',
    );
    // The native parser is case-insensitive for these keywords, so the
    // lowering preserves the classic spelling verbatim.
    expect(native).toMatch(/IF \(\|z\| > 1\)/i);
    expect(native).toMatch(/ELSE/i);
    expect(native).toMatch(/ENDIF/i);
  });

  it('produces a line map pointing back at classic lines', () => {
    const { native, lineMap } = lowerClassicEntryToNative(
      'Mapped {\n\tz=0:\n\tz=z^2+c\n\t|z|<4\n}',
    );
    const nativeLines = native.split('\n');
    expect(lineMap).toHaveLength(nativeLines.length);
    expect(lineMap[0]).toBe(1); // header line
    for (const line of lineMap) {
      expect(line).toBeGreaterThanOrEqual(1);
      expect(line).toBeLessThanOrEqual(5); // fixture spans 5 classic lines
    }
  });
});

describe('compileClassicFrmEntry: round-trip through production compiler', () => {
  beforeEach(() => {
    frmParserCache.clear();
  });

  it('compiles a classic single-entry source implicitly', () => {
    const result = compileClassicFrmEntry('LL-Style {\n\tz=0, c=pixel:\n\tz=z^2+c\n\tz<=4\n}');
    expect(result.success).toBe(true);
    expect(result.loweringNotes?.length).toBeGreaterThan(0);
    expect(result.loweredNative).toContain('bailout:');
  });

  it('compiles an explicitly selected entry of a multi-entry classic file', () => {
    const source =
      'MiniA {\n\tz=0:\n\tz=z^2+c\n\t|z| <= 4\n}\n\nMiniB {\n\tz=pixel:\n\tz=sqr(z)+c\n\t|z| < 16\n}';
    const result = compileClassicFrmEntry(source, 'MiniB');
    expect(result.success).toBe(true);
    expect(result.entry?.key).toBe('MiniB');
    expect(result.plugin?.name).toBe('MiniB');
  });

  it('rejects unselected multi-entry sources with selection-required', () => {
    const source = 'One {\n\tz=0:\n\tz=z^2+c\n\t|z|<4\n}\n\nTwo {\n\tz=0:\n\tz=z^2+c\n\t|z|<4\n}';
    const result = compileClassicFrmEntry(source);
    expect(result.success).toBe(false);
    expect(result.selectionError?.code).toBe('selection-required');
  });

  it('rejects unknown entry keys', () => {
    const result = compileClassicFrmEntry('One {\n\tz=0:\n\tz=z^2+c\n\t|z|<4\n}', 'Nope');
    expect(result.success).toBe(false);
    expect(result.selectionError?.code).toBe('unknown-entry');
  });

  it('rejects sources with blocking diagnostics (trailing tokens)', () => {
    const source = 'One {\n\tz=0:\n\tz=z^2+c\n\t|z|<4\n}\n\ngarbage after the entry';
    const result = compileClassicFrmEntry(source, 'One');
    expect(result.success).toBe(false);
    expect(result.selectionError?.code).toBe('invalid-source');
  });

  it('exposes the lowering line map and notes for diagnostics back-reference', () => {
    const result = compileClassicFrmEntry('LL-1 (YAXIS) {; note\n\tz=0:\n\tz=z^2+c\n\tz<=4\n}');
    expect(result.success).toBe(true);
    expect(result.loweringLineMap?.[0]).toBe(1);
    expect(kinds(result.loweringNotes ?? [])).toContain('symmetry-recorded');
  });
});
