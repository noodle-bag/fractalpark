/**
 * Authoritative classic FRM entry scanner tests (v0.4.18 Slice 1).
 *
 * Covers the scanner contract in docs/specs/frm-compatibility-v1.md §2 and
 * the SC-1..SC-6 rows of docs/testing/v0.4.18-regression-matrix.md:
 * implicit single-entry selection, explicit multi-entry selection,
 * unselected multi-entry rejection, trailing tokens, duplicate and broken
 * boundaries, header variants (symmetry, hyphen/digit names, comma/newline
 * bodies), empty sources, and comment-hidden braces. Fixtures live in
 * src/test/fixtures/frm-scanner/ and are project-authored clean-room
 * samples (no corpus text).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  scanFrmEntries,
  requiresSelection,
  selectFrmEntry,
  type FrmScanResult,
} from '../engine/frm/scanner';
import { compileFrmEntry, compileFrmRange, compileFrm } from '../engine/frm/compile';
import { frmParserCache } from '../engine/frm/cache';

const fixture = (name: string): string =>
  readFileSync(resolve(process.cwd(), 'src/test/fixtures/frm-scanner', name), 'utf8');

const scanFixture = (name: string): FrmScanResult => scanFrmEntries(fixture(name));

describe('scanFrmEntries: entry boundaries', () => {
  it('locates a single entry with exact ranges (SC-1)', () => {
    const source = fixture('single-entry.frm');
    const scan = scanFrmEntries(source);

    expect(scan.entries).toHaveLength(1);
    expect(scan.diagnostics).toEqual([]);
    expect(requiresSelection(scan)).toBe(false);

    const entry = scan.entries[0];
    expect(entry.key).toBe('ScanMandel');
    expect(entry.name).toBe('ScanMandel');
    expect(entry.symmetry).toBeUndefined();

    // Ranges slice the original source exactly: entry text and header text.
    expect(source.slice(entry.range.startOffset, entry.range.endOffset)).toBe(source.trimEnd());
    expect(source.slice(entry.headerRange.startOffset, entry.headerRange.endOffset)).toBe(
      'ScanMandel {'
    );
  });

  it('extracts symmetry metadata and classic comma bodies (SC-6)', () => {
    const source = fixture('single-entry-classic.frm');
    const scan = scanFrmEntries(source);

    expect(scan.entries).toHaveLength(1);
    expect(scan.diagnostics).toEqual([]);

    const entry = scan.entries[0];
    expect(entry.name).toBe('Mini-01');
    expect(entry.key).toBe('Mini-01');
    expect(entry.symmetry).toBe('XAXIS');
    expect(source.slice(entry.headerRange.startOffset, entry.headerRange.endOffset)).toBe(
      'Mini-01 (XAXIS) {'
    );
    expect(source.slice(entry.range.startOffset, entry.range.endOffset)).toBe(source.trimEnd());
    // The classic body (comma separators, `:` loop transition) is preserved verbatim.
    expect(source.slice(entry.range.startOffset, entry.range.endOffset)).toContain('z=0, c=pixel:');
  });

  it('finds multiple sequential entries (SC-3)', () => {
    const source = fixture('multi-entry.frm');
    const scan = scanFrmEntries(source);

    expect(scan.entries.map((e) => e.key)).toEqual(['ScanMandel', 'ScanJulia']);
    expect(scan.diagnostics).toEqual([]);
    expect(requiresSelection(scan)).toBe(true);

    const parts = source.split('\n\n');
    expect(source.slice(scan.entries[0].range.startOffset, scan.entries[0].range.endOffset)).toBe(
      parts[0]
    );
    expect(source.slice(scan.entries[1].range.startOffset, scan.entries[1].range.endOffset)).toBe(
      parts[1].trimEnd()
    );
  });

  it('keeps sibling entries untouched when one is selected (SC-3)', () => {
    const scan = scanFixture('multi-entry-classic.frm');

    expect(scan.entries.map((e) => e.key)).toEqual(['Mini-01', 'Mini-02']);
    expect(scan.entries[0].symmetry).toBe('XAXIS');
    expect(scan.entries[1].symmetry).toBeUndefined();

    const first = selectFrmEntry(scan, 'Mini-01');
    const second = selectFrmEntry(scan, 'Mini-02');
    expect(first?.name).toBe('Mini-01');
    expect(second?.name).toBe('Mini-02');
  });

  it('handles comma vs newline body separators identically at the boundary level (SC-6)', () => {
    const source = fixture('comma-newline.frm');
    const scan = scanFrmEntries(source);

    expect(scan.entries.map((e) => e.key)).toEqual(['CommaBody', 'NewlineBody']);
    expect(scan.diagnostics).toEqual([]);

    const comma = scan.entries[0];
    const newline = scan.entries[1];
    expect(source.slice(comma.range.startOffset, comma.range.endOffset)).toContain(
      'z=0, c=pixel: z=z^2+c, |z| <= 4'
    );
    expect(source.slice(newline.range.startOffset, newline.range.endOffset)).toContain(
      'z=0\n\tc=pixel:'
    );
  });

  it('supports header variants: attached symmetry, leading digits, indentation, hyphens (SC-6)', () => {
    const source = fixture('header-variants.frm');
    const scan = scanFrmEntries(source);

    expect(scan.entries.map((e) => e.key)).toEqual(['TightSym', '39demo', 'Hyphen-Demo-2']);
    expect(scan.diagnostics).toEqual([]);

    const [tight, digits, hyphen] = scan.entries;
    expect(tight.symmetry).toBe('XAXIS');
    expect(source.slice(tight.headerRange.startOffset, tight.headerRange.endOffset)).toBe(
      'TightSym(XAXIS) {'
    );

    expect(digits.name).toBe('39demo');
    expect(source.slice(digits.headerRange.startOffset, digits.headerRange.endOffset)).toBe(
      '39demo {'
    );

    expect(hyphen.name).toBe('Hyphen-Demo-2');
    expect(source.slice(hyphen.headerRange.startOffset, hyphen.headerRange.endOffset)).toBe(
      'Hyphen-Demo-2 {'
    );
  });

  it('ignores braces inside comments and brace-led separator blocks', () => {
    const scan = scanFixture('comment-brace.frm');

    expect(scan.entries.map((e) => e.key)).toEqual(['BraceProof', 'BraceProof2']);
    // Unbalanced braces hide inside comments; the separator block is noise.
    expect(scan.diagnostics).toEqual([]);
  });
});

describe('scanFrmEntries: selection contract', () => {
  it('implicitly selects the only entry of a single-entry file (SC-1)', () => {
    const scan = scanFixture('single-entry-classic.frm');
    expect(requiresSelection(scan)).toBe(false);
    expect(selectFrmEntry(scan)).not.toBeNull();
    expect(selectFrmEntry(scan)?.key).toBe('Mini-01');
    expect(selectFrmEntry(scan, 'Mini-01')?.key).toBe('Mini-01');
  });

  it('rejects multi-entry files without explicit selection (SC-2)', () => {
    const scan = scanFixture('multi-entry.frm');
    expect(requiresSelection(scan)).toBe(true);
    expect(selectFrmEntry(scan)).toBeNull();
    expect(selectFrmEntry(scan, undefined)).toBeNull();
  });

  it('resolves explicit keys and rejects unknown ones', () => {
    const scan = scanFixture('multi-entry-classic.frm');
    expect(selectFrmEntry(scan, 'Mini-01')?.name).toBe('Mini-01');
    expect(selectFrmEntry(scan, 'Mini-02')?.name).toBe('Mini-02');
    expect(selectFrmEntry(scan, 'Missing')).toBeNull();
  });
});

describe('scanFrmEntries: diagnostics', () => {
  it('reports trailing tokens after a complete entry (SC-4)', () => {
    const source = fixture('trailing-tokens.frm');
    const scan = scanFrmEntries(source);

    expect(scan.entries).toHaveLength(1);
    const trailing = scan.diagnostics.filter((d) => d.code === 'trailing-tokens');
    expect(trailing).toHaveLength(1);
    expect(trailing[0].offset).toBe(source.indexOf('this is not a formula'));
    expect(trailing[0].endOffset).toBe(source.length - 1);
  });

  it('assigns stable keys and flags duplicate names (SC-5)', () => {
    const source = fixture('duplicate-names.frm');
    const scan = scanFrmEntries(source);

    expect(scan.entries.map((e) => e.key)).toEqual(['Dup', 'Dup#2']);
    expect(scan.entries[0].name).toBe('Dup');
    expect(scan.entries[1].name).toBe('Dup');

    const dup = scan.diagnostics.find((d) => d.code === 'duplicate-name');
    expect(dup).toBeDefined();
    expect(dup?.entryKey).toBe('Dup#2');
    expect(dup?.offset).toBe(source.indexOf('Dup {', source.indexOf('Dup {') + 1));

    // Both duplicates stay selectable by their stable keys.
    expect(selectFrmEntry(scan, 'Dup')?.key).toBe('Dup');
    expect(selectFrmEntry(scan, 'Dup#2')?.key).toBe('Dup#2');
  });

  it('truncates an unclosed entry to end of file with a broken-boundary diagnostic (SC-5)', () => {
    const source = fixture('unclosed-brace.frm');
    const scan = scanFrmEntries(source);

    expect(scan.entries).toHaveLength(1);
    const entry = scan.entries[0];
    expect(entry.key).toBe('Broken');
    expect(entry.range.startOffset).toBe(0);
    expect(entry.range.endOffset).toBe(source.length);

    const broken = scan.diagnostics.find((d) => d.code === 'unclosed-brace');
    expect(broken).toBeDefined();
    expect(broken?.entryKey).toBe('Broken');
  });

  it('reports no-entries for empty and comment-only sources', () => {
    const empty = scanFrmEntries(fixture('empty.frm'));
    expect(empty.entries).toEqual([]);
    expect(empty.diagnostics.map((d) => d.code)).toEqual(['no-entries']);
    expect(requiresSelection(empty)).toBe(false);
    expect(selectFrmEntry(empty)).toBeNull();

    const commentOnly = scanFrmEntries('; nothing here\n; still nothing\n');
    expect(commentOnly.entries).toEqual([]);
    expect(commentOnly.diagnostics.map((d) => d.code)).toEqual(['no-entries']);

    const noiseOnly = scanFrmEntries('{ ===== separator noise ===== }\n');
    expect(noiseOnly.entries).toEqual([]);
    expect(noiseOnly.diagnostics.map((d) => d.code)).toEqual(['no-entries']);
  });
});

describe('compileFrmEntry: selected-entry compilation', () => {
  beforeEach(() => {
    // Clear cache before each test to avoid interference.
    frmParserCache.clear();
  });

  it('compiles the only entry of a single-entry file implicitly', () => {
    const result = compileFrmEntry(fixture('single-entry.frm'));

    expect(result.success).toBe(true);
    expect(result.selectionError).toBeUndefined();
    expect(result.entry?.key).toBe('ScanMandel');
    expect(result.plugin?.name).toBe('ScanMandel');
  });

  it('forwards the caller id to the compiled plugin', () => {
    const result = compileFrmEntry(fixture('single-entry.frm'), undefined, 'custom-scan-id');

    expect(result.success).toBe(true);
    expect(result.plugin?.id).toBe('custom-scan-id');
  });

  it('rejects multi-entry sources without an explicit key (SC-2)', () => {
    const result = compileFrmEntry(fixture('multi-entry.frm'));

    expect(result.success).toBe(false);
    expect(result.entry).toBeUndefined();
    expect(result.selectionError?.code).toBe('selection-required');
    expect(result.selectionError?.entryKeys).toEqual(['ScanMandel', 'ScanJulia']);
  });

  it('compiles exactly the selected entry of a multi-entry source (SC-3)', () => {
    const source = fixture('multi-entry.frm');

    const first = compileFrmEntry(source, 'ScanMandel');
    expect(first.success).toBe(true);
    expect(first.plugin?.name).toBe('ScanMandel');

    const second = compileFrmEntry(source, 'ScanJulia');
    expect(second.success).toBe(true);
    expect(second.plugin?.name).toBe('ScanJulia');
  });

  it('rejects unknown entry keys with a structured error', () => {
    const result = compileFrmEntry(fixture('multi-entry.frm'), 'Nope');

    expect(result.success).toBe(false);
    expect(result.selectionError?.code).toBe('unknown-entry');
    expect(result.selectionError?.entryKeys).toEqual(['ScanMandel', 'ScanJulia']);
  });

  it('rejects sources without entries with a structured error', () => {
    const result = compileFrmEntry(fixture('empty.frm'));

    expect(result.success).toBe(false);
    expect(result.selectionError?.code).toBe('no-entries');
    expect(result.selectionError?.entryKeys).toEqual([]);
  });

  it('selects the entry before the native pipeline lowers the body (classic bodies not yet lowered)', () => {
    const result = compileFrmEntry(fixture('single-entry-classic.frm'));

    // Selection succeeded; the classic comma body is not lowered by the
    // native pipeline yet (body lowering is a later Slice 1 commit).
    expect(result.entry?.name).toBe('Mini-01');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('compileFrm: legacy behavior untouched', () => {
  beforeEach(() => {
    frmParserCache.clear();
  });

  it('still compiles a single-entry source with its legacy whole-source path', () => {
    const result = compileFrm(fixture('single-entry.frm'));
    expect(result.success).toBe(true);
    expect(result.plugin?.name).toBe('ScanMandel');
  });

  it('keeps the legacy first-entry behavior on multi-entry sources', () => {
    // Pinned: compileFrm (no entry key) is unchanged by the scanner; the
    // strict selected-entry path is opt-in via compileFrmEntry.
    const result = compileFrm(fixture('multi-entry.frm'));
    expect(result.success).toBe(true);
    expect(result.plugin?.name).toBe('ScanMandel');
  });
});

describe('entry contract hardening (Codex review)', () => {
  beforeEach(() => {
    frmParserCache.clear();
  });

  it('reports preamble content as non-blocking and still compiles the entry', () => {
    const source = `From: someone@example.com\nSubject: formulas\n\nScanMandel {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  |z| < 4\n}\n`;
    const scan = scanFrmEntries(source);
    expect(scan.entries).toHaveLength(1);
    expect(scan.diagnostics.map((d) => d.code)).toEqual(['preamble-content']);

    const result = compileFrmEntry(source, 'ScanMandel');
    expect(result.selectionError).toBeUndefined();
    expect(result.success).toBe(true);
  });

  it('rejects compilation when trailing tokens are present (no silent slicing)', () => {
    const source = fixture('trailing-tokens.frm');
    const result = compileFrmEntry(source, 'ScanMandel');
    expect(result.success).toBe(false);
    expect(result.selectionError?.code).toBe('invalid-source');
  });

  it('rejects compilation when duplicate names are present', () => {
    const result = compileFrmEntry(fixture('duplicate-names.frm'), 'Dup');
    expect(result.success).toBe(false);
    expect(result.selectionError?.code).toBe('invalid-source');
  });

  it('rejects compilation when an entry boundary is broken', () => {
    const result = compileFrmEntry(fixture('unclosed-brace.frm'), 'Broken');
    expect(result.success).toBe(false);
    expect(result.selectionError?.code).toBe('invalid-source');
  });

  it('keeps entry keys unique when a literal name collides with a generated suffix', () => {
    const source = [
      'A#2 {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  |z| < 4\n}',
      'A {\ninit:\n  z = 0\nloop:\n  z = z^2 + c\nbailout:\n  |z| < 4\n}',
      'A {\ninit:\n  z = 1\nloop:\n  z = z^2 + c\nbailout:\n  |z| < 4\n}',
    ].join('\n\n');
    const scan = scanFrmEntries(source);
    const keys = scan.entries.map((e) => e.key);
    expect(new Set(keys).size).toBe(3);
    // Every entry remains selectable by its unique key.
    for (const key of keys) {
      expect(selectFrmEntry(scan, key)?.key).toBe(key);
    }
  });
});

describe('compileFrmRange: range-based selection (spec §2)', () => {
  beforeEach(() => {
    frmParserCache.clear();
  });

  it('compiles the entry matching an exact scanner range', () => {
    const source = fixture('multi-entry.frm');
    const scan = scanFrmEntries(source);
    const target = scan.entries[1];
    const result = compileFrmRange(source, target.range);
    expect(result.selectionError).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.entry?.key).toBe(target.key);
  });

  it('rejects arbitrary slices that do not match a scanned entry range', () => {
    const source = fixture('multi-entry.frm');
    const result = compileFrmRange(source, { startOffset: 0, endOffset: 12 });
    expect(result.success).toBe(false);
    expect(result.selectionError?.code).toBe('unknown-range');
  });
});
