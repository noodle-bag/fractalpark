import { describe, expect, it } from 'vitest';
import { collectEditorErrors } from '@/engine/frm/codemirror-lint';
import { classifyImportedFrmSource } from '@/engine/frm/compat-status';
import {
  compileClassicFrmEntry,
  compileImportedFrm,
} from '@/engine/frm/compile';

const CLASSIC_RUNNABLE = `M1 {
  z=pixel:
  z=z*z+pixel
  |z|<=4
}`;

const CLASSIC_READ_ONLY = `RO {
  z=pixel:
  m=z
  z=z*z+pixel
  m<=4
}`;

const LEGACY_ONLY = `LegacyOnly {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  tanh(|z|) < p1
}`;

describe('FRM CodeMirror lint integration', () => {
  it('surfaces native compatibility notes in real-time diagnostics', () => {
    const errors = collectEditorErrors(`CompatInfo {
loop:
  z = fn1(z) + ismand
bailout:
  |z| < 4
}`);

    const infoMessages = errors
      .filter((error) => error.severity === 'info')
      .map((error) => error.message);

    expect(infoMessages.some((message) => message.includes('ismand'))).toBe(true);
    expect(infoMessages.some((message) => message.includes('fn slot'))).toBe(true);
  });

  it('keeps compatibility, live lint, and Compile aligned for classic source', () => {
    const classification = classifyImportedFrmSource(CLASSIC_RUNNABLE, 2);
    const errors = collectEditorErrors(CLASSIC_RUNNABLE, 2);
    const compiled = compileImportedFrm(CLASSIC_RUNNABLE, 'classic-editor', 2);

    expect(classification.entries[0]).toMatchObject({
      level: 'supported',
      runnable: true,
    });
    expect(errors.filter((error) => error.severity === 'error')).toEqual([]);
    expect(compiled.success).toBe(true);
  });

  it('uses original classic coordinates in lint, status, and Compile prose', () => {
    const classification = classifyImportedFrmSource(CLASSIC_READ_ONLY, 2);
    const diagnostic = classification.entries[0].diagnostics.find(
      (entry) => entry.reasonCode === 'unknown-magnitude-form',
    );
    const lintError = collectEditorErrors(CLASSIC_READ_ONLY, 2).find(
      (entry) => entry.message.includes('unknown-magnitude-form'),
    );
    const compiled = compileImportedFrm(CLASSIC_READ_ONLY, 'classic-read-only', 2);

    expect(diagnostic).toMatchObject({ line: 5, col: 3 });
    expect(diagnostic?.message).toMatch(/^Line 5, column 3:/);
    expect(lintError).toMatchObject({ line: 5, col: 3 });
    expect(lintError?.message).toMatch(/^Line 5, column 3:/);
    expect(compiled.errors[0]).toMatch(/^Line 5, column 3:/);
    expect(compiled.errors.join('\n')).not.toMatch(/Line 8\b/);
  });

  it('maps classic columns and full-file entry offsets, not lowered coordinates', () => {
    const source = `; preface

RO {
\tz=pixel:
\tm=z
\tz=z*z+pixel
\tm<=4
}`;
    const classification = classifyImportedFrmSource(source, 2);
    const diagnostic = classification.entries[0].diagnostics.find(
      (entry) => entry.reasonCode === 'unknown-magnitude-form',
    );
    const lintError = collectEditorErrors(source, 2).find((entry) =>
      entry.message.includes('unknown-magnitude-form'),
    );
    const compiled = compileImportedFrm(source, 'classic-full-source-map', 2);
    const classicCompile = compileClassicFrmEntry(
      source,
      undefined,
      'classic-full-source-map-detail',
      2,
    );

    expect(diagnostic).toMatchObject({ line: 7, col: 2 });
    expect(diagnostic?.message).toMatch(/^Line 7, column 2:/);
    expect(lintError).toMatchObject({ line: 7, col: 2 });
    expect(lintError?.message).toMatch(/^Line 7, column 2:/);
    expect(compiled.errors[0]).toMatch(/^Line 7, column 2:/);
    expect(classicCompile.loweringLocationMap).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ line: 7, col: 2, generatedCol: 3 }),
      ]),
    );
  });

  it('maps diagnostics through length-changing classic rewrites', () => {
    const source = `RewriteColumns {
  z = pixel:
  z = exp(1.,0.) + nope + c
  |z| < 4
}`;
    const compiled = compileClassicFrmEntry(
      source,
      'RewriteColumns',
      'classic-rewrite-columns',
      2,
    );
    const lintError = collectEditorErrors(source, 2).find((entry) =>
      entry.message.includes('Undeclared variable: nope'),
    );

    expect(compiled.errors).toContain(
      'Line 3, column 20: Undeclared variable: nope',
    );
    expect(lintError).toMatchObject({ line: 3, col: 20 });
    expect(lintError?.message).toBe(
      'Line 3, column 20: Undeclared variable: nope',
    );
  });

  it('maps diagnostics on a continued token to the second physical line', () => {
    const source = [
      'ContinuedColumns {',
      '  z=0:',
      '  z=z^2+\\',
      '    nope+c',
      '  |z|<4',
      '}',
    ].join('\n');
    const compiled = compileClassicFrmEntry(
      source,
      'ContinuedColumns',
      'classic-continuation-columns',
      2,
    );
    const lintError = collectEditorErrors(source, 2).find((entry) =>
      entry.message.includes('Undeclared variable: nope'),
    );

    expect(compiled.errors).toContain(
      'Line 4, column 5: Undeclared variable: nope',
    );
    expect(lintError).toMatchObject({ line: 4, col: 5 });
  });

  it('reads the current semantics version without rebuilding the editor', () => {
    let semanticsVersion: 1 | 2 = 1;
    const currentSemanticsVersion = () => semanticsVersion;

    expect(
      collectEditorErrors(LEGACY_ONLY, currentSemanticsVersion).filter(
        (error) => error.severity === 'error',
      ),
    ).toEqual([]);

    semanticsVersion = 2;
    expect(
      collectEditorErrors(LEGACY_ONLY, currentSemanticsVersion).some((error) =>
        error.message.includes('unknown-magnitude-form'),
      ),
    ).toBe(true);
  });
});
