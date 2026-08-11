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

  it('extracts an equality predicate instead of corrupting it as an assignment', () => {
    const { native } = lowerClassicEntryToNative('Eq {\n\tz=0:\n\tz=z^2+c\n\tz == 0\n}');
    expect(native).toContain('bailout:\n  z == 0');
    // The equality must not be split into assignments.
    expect(native).not.toContain('z = 0\n  =');
  });

  it('keeps ELSEIF at the same nesting level so the trailing predicate is found', () => {
    const { native, notes } = lowerClassicEntryToNative(
      'Elseif {\n\tz=0:\n\tIF (|z| > 8)\n\t  z = z^2 + c\n\tELSEIF (|z| > 2)\n\t  z = z + c\n\tENDIF\n\t|z| < 4\n}',
    );
    expect(native).toContain('bailout:\n  |z| < 4');
    expect(kinds(notes)).not.toContain('default-bailout');
  });

  it('lowers IF blocks inside the init section identically to the loop section', () => {
    const { native } = lowerClassicEntryToNative(
      'InitIf {\n\tIF (p1)\n\t  z = p1\n\tELSE\n\t  z = 0\n\tENDIF\n\tc = pixel:\n\tz = z^2 + c\n\t|z| < 4\n}',
    );
    expect(native).toMatch(/init:\n  IF \(p1\)/i);
    expect(native).toMatch(/ELSE/i);
    expect(native).toMatch(/ENDIF/i);
  });

  it('records the Julia-mode caveat when removing c = pixel', () => {
    const { notes } = lowerClassicEntryToNative('CIdent {\n\tz=0, c=pixel:\n\tz=z^2+c\n\t|z|<4\n}');
    const note = notes.find((n) => n.kind === 'c-pixel-assignment-removed');
    expect(note?.message).toContain('Julia');
  });

  it('normalizes the bare-z bailout shorthand to magnitude form (Fractint semantics)', () => {
    const { native, notes } = lowerClassicEntryToNative('Short {\n\tz=0:\n\tz=z^2+c\n\tz<=4\n}');
    expect(native).toContain('bailout:\n  |z|<=4');
    expect(kinds(notes)).toContain('bailout-magnitude-normalized');
  });

  it('normalizes the swapped bare-z shorthand with the direction flipped', () => {
    const { native, notes } = lowerClassicEntryToNative('Swap {\n\tz=0:\n\tz=z^2+c\n\t4>=z\n}');
    expect(native).toContain('bailout:\n  |z| <= 4');
    expect(kinds(notes)).toContain('bailout-magnitude-normalized');
  });

  it('does not touch z-prefixed identifiers or non-predicate assignments', () => {
    const { native, notes } = lowerClassicEntryToNative(
      'Zid {\n\tz=0, zPrev=1:\n\tzPrev=z, z=z^2+c\n\t|z|<4\n}',
    );
    // Classic FRM is case-insensitive: identifiers lowercase during
    // lowering, and the z→|z| bailout shorthand must not mangle `zprev`.
    expect(native).toContain('zprev=1');
    expect(native).toContain('zprev=z');
    expect(kinds(notes)).not.toContain('bailout-magnitude-normalized');
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
    // A garbage line that carries a brace may be a corrupted entry header —
    // that stays blocking. (Bare prose no longer blocks; see scanner tests.)
    const source = 'One {\n\tz=0:\n\tz=z^2+c\n\t|z|<4\n}\n\ngarbage line { with a brace';
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

describe('T0 grammar coverage (corpus-evidence forms, project-authored samples)', () => {
  it('removes the c=pixel fragment of a chained `z = c = pixel` init', () => {
    const source = 'ChainProbe {\n  z = c = pixel:\n  z = z*z + c,\n  |z| < 4\n}';
    const { native, notes } = lowerClassicEntryToNative(source);
    expect(native).toContain('init:\n  z = c\n');
    expect(native).not.toContain('c = pixel');
    expect(kinds(notes)).toContain('chained-assignment-split');
    expect(kinds(notes)).toContain('c-pixel-assignment-removed');
    const result = compileClassicFrmEntry(source, 'ChainProbe');
    expect(result.success).toBe(true);
  });

  it('lowercases the body (classic FRM is case-insensitive)', () => {
    const source = 'CaseProbe {\n  Z = C = Pixel:\n  RealZ = Real(Z), Z = Z^2 + C,\n  |Z| < 4\n}';
    const { native } = lowerClassicEntryToNative(source);
    expect(native).toContain('realz = real(z)');
    expect(native).toContain('z = z^2 + c');
    expect(native).not.toContain('RealZ');
    expect(native).not.toContain('Pixel');
    const result = compileClassicFrmEntry(source, 'CaseProbe');
    expect(result.success).toBe(true);
  });

  it('accepts the `Name = {` header form end to end', () => {
    const source = 'EqProbe = {\n  z = 0:\n  z = z*z + c,\n  |z| < 4\n}';
    const result = compileClassicFrmEntry(source, 'EqProbe');
    expect(result.success).toBe(true);
  });

  it('parses header options into fnDefaults with canonicalization', () => {
    const source =
      'FnProbe(XAXIS)[float=y function=sqr/exp] {\n  z = 0:\n  z = fn1(z) + fn2(z) + c,\n  |z| < 4\n}';
    const { options, fnDefaults, notes } = lowerClassicEntryToNative(source);
    expect(options).toBe('float=y function=sqr/exp');
    expect(fnDefaults).toEqual({ fn1: 'sqr', fn2: 'exp' });
    expect(kinds(notes)).toContain('float-option-recorded');
    expect(kinds(notes)).toContain('function-option-recorded');
    const result = compileClassicFrmEntry(source, 'FnProbe');
    expect(result.success).toBe(true);
    expect(result.plugin?.fnDefaults).toEqual({ fn1: 'sqr', fn2: 'exp' });
  });

  it('records unknown function= names raw instead of silently defaulting', () => {
    // cotan is classic-real (fractint.hlp fn list) but not yet an engine
    // option — it must stay raw and annotated, never silently defaulted.
    const source = 'FnUnknown[function=ident/cotan] {\n  z = 0:\n  z = fn1(z) + c,\n  |z| < 4\n}';
    const { fnDefaults, notes } = lowerClassicEntryToNative(source);
    expect(fnDefaults).toEqual({ fn1: 'identity', fn2: 'cotan' });
    expect(kinds(notes)).toContain('function-option-unmapped');
  });

  it('fnDefaults become u_fnN uniform descriptor defaults (executable, overridable)', () => {
    const source =
      'FnExec[function=sqr/exp] {\n  z = 0:\n  z = fn1(z) + fn2(z) + c,\n  |z| < 4\n}';
    const result = compileClassicFrmEntry(source, 'FnExec');
    expect(result.success).toBe(true);
    const uFn1 = result.plugin?.uniforms.find((u) => u.name === 'u_fn1');
    const uFn2 = result.plugin?.uniforms.find((u) => u.name === 'u_fn2');
    expect(uFn1?.default).toBe(8); // sqr
    expect(uFn2?.default).toBe(4); // exp
  });

  it('surfaces non-blocking scan annotations on successful compiles', () => {
    const source =
      'AnnProbe {\n  z = 0:\n  z = z^2 + c,\n  |z| < 4\n}\n\nA bare prose paragraph follows the entry.';
    const result = compileClassicFrmEntry(source, 'AnnProbe');
    expect(result.success).toBe(true);
    expect(result.scanAnnotations?.some((d) => d.code === 'prose-content')).toBe(true);
  });
});

describe('init-only c rebinding rename (T0 evidence)', () => {
  it('renames an init-only non-pixel c binding to a fresh seeded variable', () => {
    const source =
      'RebindProbe {\n  z = 0, x = real(pixel), y = imag(pixel), c = x*(cos(y)+x*sin(y)):\n  z = sqr(z) + c,\n  |z| < 4\n}';
    const { native, notes } = lowerClassicEntryToNative(source);
    expect(native).toContain('cclassic = pixel');
    expect(native).toContain('cclassic = x*(cos(y)+x*sin(y))');
    expect(native).toContain('z = sqr(z) + cclassic');
    expect(kinds(notes)).toContain('c-init-rebinding-renamed');
    const result = compileClassicFrmEntry(source, 'RebindProbe');
    expect(result.success).toBe(true);
  });

  it('c read before the rebinding still sees pixel (seed-first semantics)', () => {
    const source = 'SeedProbe {\n  z = c, c = 2*pixel:\n  z = z^2 + c,\n  |z| < 4\n}';
    const { native } = lowerClassicEntryToNative(source);
    const init = native.split('loop:')[0];
    expect(init.indexOf('cclassic = pixel')).toBeLessThan(init.indexOf('z = cclassic'));
    const result = compileClassicFrmEntry(source, 'SeedProbe');
    expect(result.success).toBe(true);
  });

  it('a c assignment in the LOOP is cross-iteration state — no rename, native rejects', () => {
    const source = 'LoopCProbe {\n  z = pixel:\n  z = sqr(z) + c, c = c + p1,\n  |z| < 4\n}';
    const { native, notes } = lowerClassicEntryToNative(source);
    expect(native).toContain('c = c + p1');
    expect(kinds(notes)).not.toContain('c-init-rebinding-renamed');
    const result = compileClassicFrmEntry(source, 'LoopCProbe');
    expect(result.success).toBe(false);
  });

  it('avoids collisions with an existing cclassic identifier', () => {
    const source = 'CollisionProbe {\n  cclassic = 1, c = 2*pixel:\n  z = z^2 + c + cclassic,\n  |z| < 4\n}';
    const { native } = lowerClassicEntryToNative(source);
    expect(native).toContain('cclassic2 = pixel');
    const result = compileClassicFrmEntry(source, 'CollisionProbe');
    expect(result.success).toBe(true);
  });
});

describe('Codex round-2 regressions', () => {
  it('init c rebind + loop chained z = c = pixel is per-iteration reset — no rename, rejects', () => {
    // Classic resets c to pixel EVERY iteration; the init rebind only
    // shapes iteration 1. Renaming would silently keep the rebound c.
    const source = 'ResetProbe {\n  c = fn1(pixel), z = 0:\n  z = c = pixel, z = z^2 + c,\n  |z| < 4\n}';
    const { notes } = lowerClassicEntryToNative(source);
    expect(kinds(notes)).not.toContain('c-init-rebinding-renamed');
    const result = compileClassicFrmEntry(source, 'ResetProbe');
    expect(result.success).toBe(false);
  });
});

describe('classic dialect text rules (Slice 5b)', () => {
  it('recases camelCase builtins destroyed by the lowercase pass', () => {
    const source = 'T {\n  z = Pixel:\n  z = Sqr(Conj(z)) + c,\n  LASTSQR <= 4\n}';
    const { native, notes } = lowerClassicEntryToNative(source);
    expect(native).toContain('LastSqr');
    expect(native).not.toContain('lastsqr');
    expect(kinds(notes)).toContain('builtin-name-recased');
  });

  it('renames the classic variable `const` (GLSL-reserved) and stays compilable', () => {
    const source =
      'T {\n  z = pixel:\n  const = real(z)*real(z);\n  z = z + const + c,\n  |z| < 4\n}';
    const { native, notes } = lowerClassicEntryToNative(source);
    expect(native).toContain('const_');
    expect(kinds(notes)).toContain('reserved-word-renamed');
    const r = compileClassicFrmEntry(source, 'T', 'const-var', 2);
    expect(r.success).toBe(true);
  });

  it('wraps a bare complex pair in a unary call as a complex literal', () => {
    const source = 'T {\n  s = exp(1.,0.), z = pixel:\n  z = z^s + c,\n  |z| < 100\n}';
    const { native, notes } = lowerClassicEntryToNative(source);
    expect(native).toContain('exp((1.,0.))');
    expect(kinds(notes)).toContain('unary-call-complex-pair');
    const r = compileClassicFrmEntry(source, 'T', 'complex-pair', 2);
    expect(r.success).toBe(true);
  });
});

describe('Slice 5b review fixes', () => {
  it('wraps real/imag pairs and tolerates whitespace before the paren', () => {
    const { native } = lowerClassicEntryToNative(
      'T {\n  a = real(1.,0.), b = exp (1., -2.), z = pixel:\n  z = z + c,\n  |z| < 4\n}',
    );
    expect(native).toContain('real((1.,0.))');
    expect(native).toContain('exp((1.,-2.))');
  });

  it('a nested leftover pair fails loudly at validator arity — never silently dropped', () => {
    // exp(sin(1.,0.),3.) — the inner pair wraps; the outer keeps two args
    // and MUST NOT compile (codegen would drop the second argument).
    const r = compileClassicFrmEntry(
      'T {\n  z = pixel:\n  z = exp(sin(1.,0.),3.) + c,\n  |z| < 4\n}',
      'T',
      'nested-pair',
      2,
    );
    expect(r.success).toBe(false);
    expect(r.errors.join(' ')).toMatch(/takes exactly 1 argument/);
  });

  it('comment text never triggers phantom adaptations', () => {
    const { notes } = lowerClassicEntryToNative(
      'T { ; try exp(1.,0.) here\n  z = pixel:\n  z = z + c, ; and const = 3\n  |z| < 4\n}',
    );
    expect(kinds(notes)).not.toContain('unary-call-complex-pair');
    expect(kinds(notes)).not.toContain('reserved-word-renamed');
  });

  it('notes carry the first affected classic source line, not the header line', () => {
    const { notes } = lowerClassicEntryToNative(
      'T {\n  z = pixel:\n  const = real(z);\n  z = z + const + c,\n  |z| < 4\n}',
    );
    const note = notes.find((n) => n.kind === 'reserved-word-renamed');
    // `const` sits on classic source line 3 (header is line 1).
    expect(note?.line).toBe(3);
  });

  it('validator arity: atan2 stays two-argument, unary rejects extras', () => {
    const ok = compileClassicFrmEntry(
      'T {\n  z = pixel:\n  z = atan2(imag(z), real(z)) + c,\n  |z| < 4\n}',
      'T',
      'atan2-ok',
      2,
    );
    expect(ok.success).toBe(true);
  });
});
