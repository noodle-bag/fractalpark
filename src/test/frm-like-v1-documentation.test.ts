import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import enMessages from '../../messages/en.json';
import { compileFrmLikeV1Backend } from '@/engine/frm/v1-backend';
import {
  FRM_LIKE_V1_CLASSIC_GUARDS,
  FRM_LIKE_V1_DEFAULT_LIMITS,
  canonicalizeFrmLikeV1,
  hashFrmLikeV1,
  parseFrmLikeV1,
  type FrmLikeV1Expression,
  type FrmLikeV1Statement,
} from '@/engine/frm/v1';
import { FRM_V1_STDLIB_NAMES } from '@/engine/frm/frm-v1-stdlib';
import {
  FORMULA_RECORD_COUNT_V1,
  PUBLISHED_FORMULA_RECORD_COUNT_V1,
} from '@/lib/formula-records';

const repoFile = (path: string): string =>
  readFileSync(join(process.cwd(), path), 'utf8');

const normativePath = 'docs/specs/frm-like-language-v1.md';
const manualPath = 'docs/manuals/frm-like-v1.md';
const normative = repoFile(normativePath);
const manual = repoFile(manualPath);

function frmExamples(markdown: string) {
  return [...markdown.matchAll(/```frm\n([\s\S]*?)\n```/g)].map(
    (match) => match[1]
  );
}

function markdownHeadingSlugBases(markdown: string): string[] {
  return [...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) =>
    match[1]
      .trim()
      .toLowerCase()
      .replace(/[`*_~]/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
  );
}

function markdownHeadingSlugs(markdown: string): string[] {
  // Mirrors GitHub-style heading IDs, including duplicate `-1`, `-2` suffixes.
  const seen = new Map<string, number>();
  return markdownHeadingSlugBases(markdown).map((base) => {
    const duplicateIndex = seen.get(base) ?? 0;
    seen.set(base, duplicateIndex + 1);
    return duplicateIndex === 0 ? base : `${base}-${duplicateIndex}`;
  });
}

const NESTED_MAGNITUDE_CANONICAL = /\|\([^|\n]*\|[^|\n]*\)\|/;

function expressionReadsName(
  expression: FrmLikeV1Expression,
  name: string
): boolean {
  switch (expression.kind) {
    case 'identifier':
      return expression.name === name;
    case 'call':
      return expression.args.some((argument) => expressionReadsName(argument, name));
    case 'unary':
    case 'magnitude':
      return expressionReadsName(expression.operand, name);
    case 'binary':
      return (
        expressionReadsName(expression.left, name) ||
        expressionReadsName(expression.right, name)
      );
    default:
      return false;
  }
}

function statementsReadName(
  statements: FrmLikeV1Statement[],
  name: string
): boolean {
  return statements.some((statement) => {
    if (statement.kind === 'if') {
      return (
        expressionReadsName(statement.condition, name) ||
        statementsReadName(statement.then, name) ||
        statement.elseIf.some(
          (branch) =>
            expressionReadsName(branch.condition, name) ||
            statementsReadName(branch.body, name)
        ) ||
        (statement.else !== undefined && statementsReadName(statement.else, name))
      );
    }
    return expressionReadsName(statement.value, name);
  });
}

function expressionContainsNestedMagnitude(
  expression: FrmLikeV1Expression,
  insideMagnitude = false
): boolean {
  if (expression.kind === 'magnitude') {
    if (insideMagnitude) return true;
    return expressionContainsNestedMagnitude(expression.operand, true);
  }
  if (expression.kind === 'call') {
    return expression.args.some((argument) =>
      expressionContainsNestedMagnitude(argument, insideMagnitude)
    );
  }
  if (expression.kind === 'unary') {
    return expressionContainsNestedMagnitude(expression.operand, insideMagnitude);
  }
  if (expression.kind === 'binary') {
    return (
      expressionContainsNestedMagnitude(expression.left, insideMagnitude) ||
      expressionContainsNestedMagnitude(expression.right, insideMagnitude)
    );
  }
  return false;
}

function statementsContainNestedMagnitude(
  statements: FrmLikeV1Statement[]
): boolean {
  return statements.some((statement) => {
    if (statement.kind === 'if') {
      return (
        expressionContainsNestedMagnitude(statement.condition) ||
        statementsContainNestedMagnitude(statement.then) ||
        statement.elseIf.some(
          (branch) =>
            expressionContainsNestedMagnitude(branch.condition) ||
            statementsContainNestedMagnitude(branch.body)
        ) ||
        (statement.else !== undefined &&
          statementsContainNestedMagnitude(statement.else))
      );
    }
    return expressionContainsNestedMagnitude(statement.value);
  });
}

describe('FRM-like v1 English documentation contract', () => {
  it('publishes one normative language reference and one author manual', () => {
    for (const heading of [
      '# FractalPark FRM-like Language v1',
      '## 2. Source grammar',
      '## 3. Values, expressions, and statements',
      '## 4. Parameters and system values',
      '## 5. Standard library v1',
      '## 6. NumericProfile `standard32`',
      '## 7. Termination and safety envelope',
      '## 8. Canonicalization, revisions, and conformance',
      '## 9. Compatibility and availability',
    ]) {
      expect(normative, heading).toContain(heading);
    }

    for (const heading of [
      '# FRM-like v1 Author Manual',
      '## 1. What you can do today',
      '## 2. Read a published Definition',
      '## 3. Write a Definition',
      '## 4. Add parameters',
      '## 5. Use state and control flow',
      '### Standard library quick reference',
      '## 6. Diagnose a rejected Definition',
      '## 7. Revisions, Remix, and portability',
      '## 8. Classic `.frm` and the standalone Editor',
    ]) {
      expect(manual, heading).toContain(heading);
    }

    expect(normative).toContain('- Status: Normative');
    expect(normative).toContain('- Date: 2026-08-20');
    expect(manual).toContain('- Date: 2026-08-20');
    expect(normative).not.toContain('- Published:');
    expect(manual).not.toContain('- Published:');
  });

  it('states current product availability without turning catalog identity into runtime support', () => {
    for (const document of [manual, normative]) {
      expect(document).toMatch(
        new RegExp(`${FORMULA_RECORD_COUNT_V1} Standard(?: Formula)? identities`)
      );
      expect(document).toContain(
        `${PUBLISHED_FORMULA_RECORD_COUNT_V1} published Definitions`
      );
      expect(document).toMatch(
        new RegExp(
          `${FORMULA_RECORD_COUNT_V1 - PUBLISHED_FORMULA_RECORD_COUNT_V1} (?:held )?Records`
        )
      );
    }
    const disclaimer = enMessages.formulas.frmGuide.sections.support.disclaimer;
    expect(disclaimer).toContain(`${FORMULA_RECORD_COUNT_V1}-identity`);
    expect(disclaimer).toContain(
      `${PUBLISHED_FORMULA_RECORD_COUNT_V1} published Definitions`
    );
    expect(disclaimer).toContain(
      `${FORMULA_RECORD_COUNT_V1 - PUBLISHED_FORMULA_RECORD_COUNT_V1} held Records`
    );
    expect(manual).toContain('The standalone FRM Editor remains a Classic-compatible authoring surface.');
    expect(manual).toContain('Canonical FRM-like v1 writer and import activation remains gated.');
    expect(manual).not.toMatch(/(?:all|every) 677[^\n]*(?:runnable|published)/i);
  });

  it('keeps every normative and manual FRM example executable and formatter-stable on the production v1 parser and backend', async () => {
    const examples = [...frmExamples(normative), ...frmExamples(manual)];
    expect(examples).toHaveLength(7);
    expect(
      examples.filter((source) => source.includes('FunctionGarden {'))
    ).toHaveLength(1);
    expect(examples.filter((source) => source.includes('real(z) ='))).toHaveLength(
      2
    );
    expect(examples.filter((source) => source.includes('imag(z) ='))).toHaveLength(
      1
    );

    for (const [index, source] of examples.entries()) {
      const parsed = parseFrmLikeV1(source);
      expect(parsed, `example ${index + 1}: parse`).toMatchObject({ ok: true });
      if (!parsed.ok) continue;

      const canonical = canonicalizeFrmLikeV1(parsed.ir);
      expect(
        canonical,
        `example ${index + 1}: canonical nested magnitude`
      ).not.toMatch(NESTED_MAGNITUDE_CANONICAL);
      const reparsed = parseFrmLikeV1(canonical);
      expect(reparsed, `example ${index + 1}: canonical reparse`).toMatchObject({
        ok: true,
      });
      if (!reparsed.ok) continue;
      expect(reparsed.ir.formulaName).toBe(parsed.ir.formulaName);
      expect(canonicalizeFrmLikeV1(reparsed.ir)).toBe(canonical);
      expect((await hashFrmLikeV1(canonical, reparsed.ir)).semanticHash).toBe(
        (await hashFrmLikeV1(source, parsed.ir)).semanticHash
      );

      const compiled = compileFrmLikeV1Backend(parsed.ir);
      expect(compiled, `example ${index + 1}: backend`).toMatchObject({ ok: true });
      if (!compiled.ok) continue;

      expect(compiled.backend.glsl.generatedBytes).toBeGreaterThan(0);
      expect(compiled.backend.glsl.declarations.split('\n')[0]).toBe(
        '// FRM-like v1 backend candidate.'
      );
      expect(compiled.backend.glsl.declarations).toContain(
        'bool frmV1Truthy(vec2 value) { return value.x != 0.0; }'
      );
      if (source.includes('FunctionGarden {')) {
        expect(compiled.backend.glsl.declarations).toContain(
          'vec2 frmV1Dispatch_transform(vec2 value) {'
        );
        expect(compiled.backend.glsl.loop).toContain('frmV1Dispatch_transform(');
      }
      if (source.includes('real(z) =')) {
        expect(compiled.backend.glsl.loop).toContain('z.x =');
      }
      if (source.includes('imag(z) =')) {
        expect(compiled.backend.glsl.loop).toContain('z.y =');
      }

      const state = compiled.backend.cpu.createState({
        pixel: { re: 0.125, im: 0.25 },
        c: { re: 0.125, im: 0.25 },
        ismand: true,
        maxit: 1000,
      });
      compiled.backend.cpu.init(state);
      const afterInit = { ...state.values.z };
      const firstStep = compiled.backend.cpu.step(state);
      expect(firstStep.state).toBe(state);
      expect(firstStep.event, `example ${index + 1}: first CPU step`).toBeUndefined();
      const afterFirst = { ...state.values.z };
      expect(Number.isFinite(afterFirst.re)).toBe(true);
      expect(Number.isFinite(afterFirst.im)).toBe(true);
      expect(afterFirst, `example ${index + 1}: first orbit progress`).not.toEqual(
        afterInit
      );
      const secondStep = compiled.backend.cpu.step(state);
      expect(secondStep.state).toBe(state);
      expect(secondStep.event, `example ${index + 1}: second CPU step`).toBeUndefined();
      expect(Number.isFinite(state.values.z.re)).toBe(true);
      expect(Number.isFinite(state.values.z.im)).toBe(true);
      expect(state.values.z, `example ${index + 1}: second orbit progress`).not.toEqual(
        afterFirst
      );
      expect(
        typeof compiled.backend.cpu.shouldContinue(state).continue,
        `example ${index + 1}: continue predicate`
      ).toBe('boolean');
    }

    const minimal = parseFrmLikeV1(examples[0]);
    expect(minimal).toMatchObject({ ok: true });
    if (minimal.ok) {
      const compiled = compileFrmLikeV1Backend(minimal.ir);
      expect(compiled).toMatchObject({ ok: true });
      if (compiled.ok) {
        const divergent = compiled.backend.cpu.createState({
          c: { re: 3, im: 0 },
          ismand: true,
        });
        compiled.backend.cpu.init(divergent);
        compiled.backend.cpu.step(divergent);
        expect(compiled.backend.cpu.shouldContinue(divergent)).toMatchObject({
          continue: true,
        });
        compiled.backend.cpu.step(divergent);
        expect(compiled.backend.cpu.shouldContinue(divergent)).toMatchObject({
          continue: false,
        });
      }
    }
  });

  it('binds directive order, namespace, literal, and precedence prose to parser behavior', () => {
    const examples = [...frmExamples(normative), ...frmExamples(manual)];
    const minimal = examples[0];
    const reordered = minimal.replace(
      '; @language: frm-like/1\n; @stdlib: 1\n; @numeric-profile: standard32',
      '; @stdlib: 1\n; @numeric-profile: standard32\n; @language: frm-like/1'
    );
    expect(reordered).not.toBe(minimal);
    const reorderedParsed = parseFrmLikeV1(reordered);
    expect(reorderedParsed).toMatchObject({ ok: true });
    if (reorderedParsed.ok) {
      expect(canonicalizeFrmLikeV1(reorderedParsed.ir)).toMatch(
        /^; @language: frm-like\/1\n; @stdlib: 1\n; @numeric-profile: standard32/
      );
    }

    const guarded = minimal.replace(
      '; @language: frm-like/1\n; @stdlib: 1\n; @numeric-profile: standard32',
      '; @classic-guards: zero-division, hyperbolic-clamp\n; @stdlib: 1\n; @language: frm-like/1\n; @numeric-profile: standard32'
    );
    expect(guarded).not.toBe(minimal);
    const guardedParsed = parseFrmLikeV1(guarded);
    expect(guardedParsed).toMatchObject({ ok: true });
    if (guardedParsed.ok) {
      expect(canonicalizeFrmLikeV1(guardedParsed.ir)).toMatch(
        /^; @language: frm-like\/1\n; @stdlib: 1\n; @numeric-profile: standard32\n; @classic-guards: zero-division, hyperbolic-clamp/
      );
    }

    for (const alternateNewlines of [
      minimal.replace(/\n/g, '\r\n'),
      minimal.replace(/\n/g, '\r'),
    ]) {
      const parsed = parseFrmLikeV1(alternateNewlines);
      expect(parsed).toMatchObject({ ok: true });
      if (parsed.ok) expect(canonicalizeFrmLikeV1(parsed.ir)).not.toContain('\r');
    }

    const emptySectionCases = [
      {
        source: minimal.replace('  init:', '  parameters:\n  init:'),
        canonicalPattern: /MinimalBrot \{\n  init:/,
      },
      {
        source: minimal.replace('    z = 0\n  loop:', '  loop:'),
        canonicalPattern: /  init:\n  loop:/,
      },
      {
        source: minimal.replace('    z = z ^ 2 + c\n  bailout:', '  bailout:'),
        canonicalPattern: /  loop:\n  bailout:/,
      },
    ];
    for (const { source, canonicalPattern } of emptySectionCases) {
      expect(source).not.toBe(minimal);
      const parsed = parseFrmLikeV1(source);
      expect(parsed).toMatchObject({ ok: true });
      if (parsed.ok) {
        expect(canonicalizeFrmLikeV1(parsed.ir)).toMatch(canonicalPattern);
      }
    }

    const reservedFormula = minimal.replace('MinimalBrot {', 'pixel {');
    expect(reservedFormula).not.toBe(minimal);
    expect(parseFrmLikeV1(reservedFormula)).toMatchObject({
      ok: false,
      reason: 'reserved-name',
    });

    const matchingFormulaAndParameter = examples
      .find((source) => source.includes('PowerJulia {'))
      ?.replace('PowerJulia {', 'power {');
    expect(matchingFormulaAndParameter).toBeDefined();
    expect(matchingFormulaAndParameter).not.toContain('PowerJulia {');
    expect(parseFrmLikeV1(matchingFormulaAndParameter ?? '')).toMatchObject({
      ok: true,
    });

    const functionExample = examples.find((source) =>
      source.includes('FunctionGarden {')
    );
    expect(functionExample).toBeDefined();
    expect(
      parseFrmLikeV1(
        (functionExample ?? '').replace(
          'z = transform(z)',
          'alias = transform\n    z = alias(z)'
        )
      )
    ).toMatchObject({ ok: false, reason: 'function-value-not-callable' });
    for (const booleanExpression of ['!z', 'z && 1']) {
      const mutated = minimal.replace('|z| <= 4', booleanExpression);
      expect(mutated).not.toBe(minimal);
      expect(parseFrmLikeV1(mutated)).toMatchObject({
        ok: true,
      });
    }
    const spacedMagnitudeOr = minimal.replace('|z| <= 4', '|z| || |zPrev|');
    expect(spacedMagnitudeOr).not.toBe(minimal);
    expect(parseFrmLikeV1(spacedMagnitudeOr)).toMatchObject({ ok: true });
    const unspacedMagnitudeOr = spacedMagnitudeOr.replace(
      '|z| || |zPrev|',
      '|z|||zPrev|'
    );
    expect(unspacedMagnitudeOr).not.toBe(spacedMagnitudeOr);
    expect(parseFrmLikeV1(unspacedMagnitudeOr)).toMatchObject({ ok: false });
    const functionValueCondition = (functionExample ?? '').replace(
      'LastSqr < 576',
      'transform && 1'
    );
    expect(functionValueCondition).not.toBe(functionExample);
    expect(parseFrmLikeV1(functionValueCondition)).toMatchObject({
      ok: false,
      reason: 'function-value-not-callable',
    });

    const booleanAssignmentSource = minimal.replace(
      'z = z ^ 2 + c',
      'z = ismand'
    );
    expect(booleanAssignmentSource).not.toBe(minimal);
    const booleanAssignment = parseFrmLikeV1(booleanAssignmentSource);
    expect(booleanAssignment).toMatchObject({ ok: true });
    if (booleanAssignment.ok) {
      const compiled = compileFrmLikeV1Backend(booleanAssignment.ir);
      expect(compiled).toMatchObject({ ok: true });
      if (compiled.ok) {
        const state = compiled.backend.cpu.createState({ ismand: true });
        compiled.backend.cpu.init(state);
        compiled.backend.cpu.step(state);
        expect(state.values.z).toEqual({ re: 1, im: 0 });
      }
    }

    const evaluatePower = (expression: string) => {
      const source = minimal.replace('z = z ^ 2 + c', `z = ${expression}`);
      expect(source).not.toBe(minimal);
      const parsed = parseFrmLikeV1(source);
      expect(parsed).toMatchObject({ ok: true });
      if (!parsed.ok) return undefined;
      const compiled = compileFrmLikeV1Backend(parsed.ir);
      expect(compiled).toMatchObject({ ok: true });
      if (!compiled.ok) return undefined;
      const state = compiled.backend.cpu.createState();
      compiled.backend.cpu.init(state);
      compiled.backend.cpu.step(state);
      expect(compiled.backend.glsl.loop).toContain('frmV1Pow(');
      return state.values.z;
    };
    expect(evaluatePower('(0, 0) ^ 0')).toEqual({ re: 0, im: 0 });
    const principalRoot = evaluatePower('(-1, 0) ^ 0.5');
    expect(principalRoot?.re).toBeCloseTo(0, 5);
    expect(principalRoot?.im).toBeCloseTo(1, 5);

    const overflowSource = minimal
      .replace('z = 0', 'z = pixel')
      .replace('z = z ^ 2 + c', 'z = z * z');
    expect(overflowSource).not.toBe(minimal);
    const overflowParsed = parseFrmLikeV1(overflowSource);
    expect(overflowParsed).toMatchObject({ ok: true });
    if (overflowParsed.ok) {
      const overflowCompiled = compileFrmLikeV1Backend(overflowParsed.ir);
      expect(overflowCompiled).toMatchObject({ ok: true });
      if (overflowCompiled.ok) {
        const state = overflowCompiled.backend.cpu.createState({
          pixel: { re: 1e6, im: 0 },
        });
        overflowCompiled.backend.cpu.init(state);
        overflowCompiled.backend.cpu.step(state);
        const second = overflowCompiled.backend.cpu.step(state);
        expect(second.event).toBeUndefined();
        expect(Number.isFinite(state.values.z.re)).toBe(true);
        expect(state.values.LastSqr.re).toBe(Number.POSITIVE_INFINITY);
        expect(overflowCompiled.backend.cpu.shouldContinue(state)).toMatchObject({
          continue: false,
        });
      }
    }

    const overflowReadSource = overflowSource.replace('|z| <= 4', 'LastSqr <= 4');
    expect(overflowReadSource).not.toBe(overflowSource);
    const overflowReadParsed = parseFrmLikeV1(overflowReadSource);
    expect(overflowReadParsed).toMatchObject({ ok: true });
    if (overflowReadParsed.ok) {
      const overflowReadCompiled = compileFrmLikeV1Backend(overflowReadParsed.ir);
      expect(overflowReadCompiled).toMatchObject({ ok: true });
      if (overflowReadCompiled.ok) {
        const state = overflowReadCompiled.backend.cpu.createState({
          pixel: { re: 1e6, im: 0 },
        });
        overflowReadCompiled.backend.cpu.init(state);
        overflowReadCompiled.backend.cpu.step(state);
        overflowReadCompiled.backend.cpu.step(state);
        expect(overflowReadCompiled.backend.cpu.shouldContinue(state)).toMatchObject({
          event: 'nonFinite',
        });
      }
    }
    expect(normative).toContain('saturating post-loop decision channel');
    expect(normative).toContain('including a bailout comparison');

    const imaginaryTruthinessSource = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
ImaginaryTruthiness {
  init:
    z = 0
  loop:
    if (0, 1) && 1
      z = 1
    else
      z = 2
    endif
  bailout:
    z == 2
}`;
    const imaginaryTruthiness = parseFrmLikeV1(imaginaryTruthinessSource);
    expect(imaginaryTruthiness).toMatchObject({ ok: true });
    if (imaginaryTruthiness.ok) {
      const compiled = compileFrmLikeV1Backend(imaginaryTruthiness.ir);
      expect(compiled).toMatchObject({ ok: true });
      if (compiled.ok) {
        const state = compiled.backend.cpu.createState();
        compiled.backend.cpu.init(state);
        compiled.backend.cpu.step(state);
        expect(state.values.z).toEqual({ re: 2, im: 0 });
        expect(compiled.backend.cpu.shouldContinue(state)).toMatchObject({
          continue: true,
        });
      }
    }

    const executableComplexSource = minimal.replace(
      'z = z ^ 2 + c',
      'z = z + (0.05, -0.02)'
    );
    expect(executableComplexSource).not.toBe(minimal);
    const executableComplex = parseFrmLikeV1(executableComplexSource);
    expect(executableComplex).toMatchObject({ ok: true });
    if (executableComplex.ok) {
      expect(compileFrmLikeV1Backend(executableComplex.ir)).toMatchObject({
        ok: true,
      });
    }
    const wrongCaseSection = minimal.replace('  init:', '  Init:');
    expect(wrongCaseSection).not.toBe(minimal);
    expect(parseFrmLikeV1(wrongCaseSection)).toMatchObject({
      ok: false,
      reason: 'statement-before-section',
    });
    const wrongCaseFunction = minimal.replace('z ^ 2 + c', 'SIN(z) + c');
    expect(wrongCaseFunction).not.toBe(minimal);
    expect(parseFrmLikeV1(wrongCaseFunction)).toMatchObject({
      ok: false,
      reason: 'unknown-function',
    });

    const realReturningSelection = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
RealSelection {
  parameters:
    transform: function = real
  init:
    z = (2, 3)
  loop:
    z = transform(z)
  bailout:
    |z| >= 0
}`;
    const realSelectionParsed = parseFrmLikeV1(realReturningSelection);
    expect(realSelectionParsed).toMatchObject({ ok: true });
    if (realSelectionParsed.ok) {
      const compiled = compileFrmLikeV1Backend(realSelectionParsed.ir);
      expect(compiled).toMatchObject({ ok: true });
      if (compiled.ok) {
        const state = compiled.backend.cpu.createState();
        compiled.backend.cpu.init(state);
        compiled.backend.cpu.step(state);
        expect(state.values.z).toEqual({ re: 2, im: 0 });
      }
    }

    const signedDomain = examples.find((source) => source.includes('domain [-1, 1]'));
    expect(parseFrmLikeV1(signedDomain ?? '')).toMatchObject({ ok: true });

    const unaryPower = minimal.replace('|z| <= 4', '-2 ^ 2 == 4');
    expect(unaryPower).not.toBe(minimal);
    const unaryParsed = parseFrmLikeV1(unaryPower);
    expect(unaryParsed).toMatchObject({ ok: true });
    if (unaryParsed.ok) {
      expect(unaryParsed.ir.bailout).toMatchObject({
        kind: 'binary',
        operator: '==',
        left: {
          kind: 'binary',
          operator: '^',
          left: { kind: 'unary', operator: '-' },
        },
      });
    }
  });

  it('distinguishes exact-byte hashing from conforming Definition canonicalization', async () => {
    const source = frmExamples(normative)[0];
    const parsed = parseFrmLikeV1(source);
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;

    const canonical = canonicalizeFrmLikeV1(parsed.ir);
    const crlf = canonical.replace(/\n/g, '\r\n');
    const commented = canonical.replace(
      '; @numeric-profile: standard32',
      '; @numeric-profile: standard32\n; ordinary import comment'
    );
    const respaced = canonical.replace('z = z ^ 2 + c', 'z   =   z^2+c');
    const canonicalHash = await hashFrmLikeV1(canonical, parsed.ir);
    expect(canonicalHash.sourceRevision).toBe(
      createHash('sha256').update(canonical).digest('hex')
    );
    for (const importInput of [crlf, commented, respaced]) {
      const parsedImport = parseFrmLikeV1(importInput);
      expect(parsedImport).toMatchObject({ ok: true });
      if (!parsedImport.ok) continue;
      expect(canonicalizeFrmLikeV1(parsedImport.ir)).toBe(canonical);
      const importHash = await hashFrmLikeV1(importInput, parsedImport.ir);
      expect(importHash.sourceRevision).toBe(
        createHash('sha256').update(importInput).digest('hex')
      );
      expect(importHash.sourceRevision).not.toBe(canonicalHash.sourceRevision);
      expect(importHash.semanticHash).toBe(canonicalHash.semanticHash);
    }

    const terminalSurrogateSource = `${source}\n; ${String.fromCharCode(0xd800)}`;
    const replacementSource = `${source}\n; \uFFFD`;
    const terminalParsed = parseFrmLikeV1(terminalSurrogateSource);
    const replacementParsed = parseFrmLikeV1(replacementSource);
    if (terminalParsed.ok && replacementParsed.ok) {
      const terminalHash = await hashFrmLikeV1(
        terminalSurrogateSource,
        terminalParsed.ir
      );
      const replacementHash = await hashFrmLikeV1(
        replacementSource,
        replacementParsed.ir
      );
      expect(terminalHash.sourceRevision).toBe(replacementHash.sourceRevision);
      expect(normative).toContain('not byte-injective for this invalid input');
    } else {
      expect(normative).not.toContain('not byte-injective for this invalid input');
    }

    expect(normative).toContain('is the byte-exact primitive used by the published');
    expect(normative).toContain('Safety Envelope rejects a writer candidate');
    expect(normative).toContain('`source-not-canonical`');
  });

  it('audits the dated published-source nested-magnitude and round-trip claim', async () => {
    const index = JSON.parse(
      repoFile('public/formula-library/v1/runtime/published/index.json')
    ) as {
      rows: Array<{
        definitionPath: string;
        sourceRevision: string;
        semanticHash: string;
      }>;
    };
    expect(index.rows).toHaveLength(PUBLISHED_FORMULA_RECORD_COUNT_V1);

    const knownNestedDeviation = frmExamples(normative)[0].replace(
      '|z| <= 4',
      '|-(|z|)| <= 4'
    );
    const nestedParsed = parseFrmLikeV1(knownNestedDeviation);
    if (!nestedParsed.ok) {
      expect(normative).not.toMatch(/front-end\s+parser can return IR/);
    } else {
      const nestedReparsed = parseFrmLikeV1(
        canonicalizeFrmLikeV1(nestedParsed.ir)
      );
      if (nestedReparsed.ok) {
        expect(normative).not.toMatch(/formatter cannot\s+round-trip that input/);
      } else {
        expect(normative).toMatch(/formatter cannot\s+round-trip that input/);
      }
    }

    let maximumPublishedSourceBytes = 0;
    for (const row of index.rows) {
      const source = repoFile(
        join(
          'public/formula-library/v1/runtime/published',
          row.definitionPath.replace(/^\/+/, '')
        )
      );
      const sourceBytes = Buffer.byteLength(source, 'utf8');
      maximumPublishedSourceBytes = Math.max(
        maximumPublishedSourceBytes,
        sourceBytes
      );
      expect(sourceBytes, row.definitionPath).toBeLessThanOrEqual(
        FRM_LIKE_V1_DEFAULT_LIMITS.maxSourceBytes
      );
      const parsed = parseFrmLikeV1(source);
      expect(parsed, row.definitionPath).toMatchObject({ ok: true });
      const sourceRevision = createHash('sha256').update(source).digest('hex');
      expect(sourceRevision, row.definitionPath).toBe(row.sourceRevision);
      expect(`${sourceRevision}.frm`, row.definitionPath).toBe(
        row.definitionPath.split('/').at(-1)
      );
      if (!parsed.ok) continue;
      const pinnedHash = await hashFrmLikeV1(source, parsed.ir);
      expect(pinnedHash, row.definitionPath).toEqual({
        sourceRevision: row.sourceRevision,
        semanticHash: row.semanticHash,
      });
      const canonical = canonicalizeFrmLikeV1(parsed.ir);
      expect(canonical, row.definitionPath).not.toMatch(
        NESTED_MAGNITUDE_CANONICAL
      );
      const reparsed = parseFrmLikeV1(canonical);
      expect(reparsed, row.definitionPath).toMatchObject({ ok: true });
      if (reparsed.ok) {
        expect(reparsed.ir.formulaName, row.definitionPath).toBe(parsed.ir.formulaName);
        expect(canonicalizeFrmLikeV1(reparsed.ir), row.definitionPath).toBe(canonical);
        const canonicalHash = await hashFrmLikeV1(canonical, reparsed.ir);
        expect(canonicalHash.semanticHash, row.definitionPath).toBe(
          pinnedHash.semanticHash
        );
      }
      expect(
        statementsContainNestedMagnitude(parsed.ir.init) ||
          statementsContainNestedMagnitude(parsed.ir.loop) ||
          expressionContainsNestedMagnitude(parsed.ir.bailout),
        row.definitionPath
      ).toBe(false);
      for (const slot of ['p1', 'p2', 'p3', 'p4', 'p5']) {
        const isBound = parsed.ir.parameters.some(
          (parameter) => parameter.classicBinding === slot
        );
        if (isBound) continue;
        expect(
          statementsReadName(parsed.ir.init, slot) ||
            statementsReadName(parsed.ir.loop, slot) ||
            expressionReadsName(parsed.ir.bailout, slot),
          `${row.definitionPath}:${slot}`
        ).toBe(false);
      }
    }
    expect(maximumPublishedSourceBytes).toBe(927);

    for (const source of [...frmExamples(normative), ...frmExamples(manual)]) {
      const parsed = parseFrmLikeV1(source);
      expect(parsed).toMatchObject({ ok: true });
      if (!parsed.ok) continue;
      expect(
        statementsContainNestedMagnitude(parsed.ir.init) ||
          statementsContainNestedMagnitude(parsed.ir.loop) ||
          expressionContainsNestedMagnitude(parsed.ir.bailout)
      ).toBe(false);
    }
  });

  it('binds published troubleshooting codes to reachable fail-closed paths', () => {
    const minimal = frmExamples(normative)[0];
    const sourceAtBytes = (target: number) => {
      const marker = 'MinimalBrot {';
      const commentOverhead = Buffer.byteLength('; \n', 'utf8');
      const padding = target - Buffer.byteLength(minimal, 'utf8') - commentOverhead;
      expect(padding).toBeGreaterThanOrEqual(0);
      return minimal.replace(marker, `; ${'x'.repeat(padding)}\n${marker}`);
    };
    const atBoundary = sourceAtBytes(
      FRM_LIKE_V1_DEFAULT_LIMITS.maxSourceBytes
    );
    const aboveBoundary = sourceAtBytes(
      FRM_LIKE_V1_DEFAULT_LIMITS.maxSourceBytes + 1
    );
    expect(Buffer.byteLength(atBoundary, 'utf8')).toBe(
      FRM_LIKE_V1_DEFAULT_LIMITS.maxSourceBytes
    );
    expect(parseFrmLikeV1(atBoundary)).toMatchObject({ ok: true });
    const preNormalizationOver = atBoundary.replace('\n', '\r\n');
    expect(preNormalizationOver).not.toBe(atBoundary);
    expect(Buffer.byteLength(preNormalizationOver, 'utf8')).toBe(
      FRM_LIKE_V1_DEFAULT_LIMITS.maxSourceBytes + 1
    );
    expect(parseFrmLikeV1(preNormalizationOver)).toMatchObject({
      ok: false,
      reason: 'source-too-large',
    });
    expect(parseFrmLikeV1(aboveBoundary)).toMatchObject({
      ok: false,
      reason: 'source-too-large',
    });
    expect(
      parseFrmLikeV1(aboveBoundary, {
        limits: {
          maxSourceBytes: FRM_LIKE_V1_DEFAULT_LIMITS.maxSourceBytes + 1,
        },
      })
    ).toMatchObject({ ok: false, reason: 'source-too-large' });

    const powerExample = frmExamples(normative).find((source) =>
      source.includes('PowerJulia {')
    );
    const functionExample = frmExamples(manual).find((source) =>
      source.includes('FunctionGarden {')
    );
    expect(powerExample).toBeDefined();
    expect(functionExample).toBeDefined();
    const replaceFixture = (
      source: string,
      search: string,
      replacement: string
    ): string => {
      const mutated = source.replace(search, replacement);
      expect(mutated, `fixture anchor: ${search}`).not.toBe(source);
      return mutated;
    };
    const terminalHighSurrogate = `${minimal}\n; ${String.fromCharCode(0xd800)}`;
    const terminalHighSurrogateResult = parseFrmLikeV1(terminalHighSurrogate);
    if (
      terminalHighSurrogateResult.ok === false &&
      terminalHighSurrogateResult.reason === 'invalid-unicode-source'
    ) {
      expect(normative).not.toMatch(/terminal unpaired high\s+surrogate can reach/);
    } else {
      expect(normative).toMatch(/terminal unpaired high\s+surrogate can reach/);
    }
    expect(parseFrmLikeV1(`${minimal}\n\n; trailing ordinary comment`)).toMatchObject({
      ok: true,
    });

    const failures: Array<[string, string]> = [
      [
        replaceFixture(minimal, '; @stdlib: 1', '; @stdlib: 2'),
        'invalid-semantic-directives',
      ],
      [
        replaceFixture(
          minimal,
          '; @stdlib: 1',
          '; @coloring: experimental\n; @stdlib: 1'
        ),
        'unknown-semantic-directive',
      ],
      [
        replaceFixture(
          minimal,
          '  init:\n    z = 0\n  loop:\n    z = z ^ 2 + c',
          '  loop:\n    z = z ^ 2 + c\n  init:\n    z = 0'
        ),
        'invalid-section-order',
      ],
      [replaceFixture(minimal, 'z ^ 2 + c', 'z ^ 2 + missing'), 'undeclared-read'],
      [
        replaceFixture(
          minimal,
          '    z = z ^ 2 + c',
          '    if real(z) > 0\n      branchLocal = z\n    endif\n    z = branchLocal'
        ),
        'possibly-uninitialized-read',
      ],
      [replaceFixture(minimal, 'z ^ 2 + c', 'fn1(z)'), 'unmapped-function-slot'],
      [replaceFixture(minimal, '|z| <= 4', '|z|'), 'bailout-not-boolean'],
      [
        replaceFixture(
          minimal,
          '    z = z ^ 2 + c',
          '    if z\n      z = z ^ 2 + c\n    endif'
        ),
        'if-condition-not-boolean',
      ],
      [
        replaceFixture(
          minimal,
          '    z = z ^ 2 + c',
          '    temp = 1\n    temp = (1, 2)\n    z = z ^ 2 + c'
        ),
        'local-type-mismatch',
      ],
      [
        replaceFixture(
          powerExample ?? '',
          'power: real = 2 domain [1, 16]',
          'power: real = 2 domain [3, 16]'
        ),
        'default-out-of-domain',
      ],
      [
        replaceFixture(
          minimal,
          '; @language: frm-like/1',
          '; @language: frm-like/1\n; @language: frm-like/1'
        ),
        'duplicate-semantic-directive',
      ],
      [
        replaceFixture(minimal, 'MinimalBrot {', 'MinimalBrot {\n; @stdlib: 1'),
        'misplaced-semantic-directive',
      ],
      [`${minimal}\n; @stdlib: 1`, 'misplaced-semantic-directive'],
      [`${minimal}\nz = 1`, 'trailing-executable-tokens'],
      [
        replaceFixture(
          functionExample ?? '',
          'transform: function = sin',
          'transform: function = atan2'
        ),
        'unknown-stdlib-function',
      ],
      [`${String.fromCharCode(0xd800)}${minimal}`, 'invalid-unicode-source'],
    ];
    const documentedReasons = new Set([
      'invalid-semantic-directives',
      'invalid-section-order',
      'undeclared-read',
      'possibly-uninitialized-read',
      'unmapped-function-slot',
      'bailout-not-boolean',
    ]);
    for (const [source, reason] of failures) {
      if (documentedReasons.has(reason)) expect(manual).toContain(`\`${reason}\``);
      expect(parseFrmLikeV1(source), reason).toMatchObject({ ok: false, reason });
    }

    expect(manual).toContain('`source-too-large`');
    expect(manual).toContain('`generated-shader-too-large`');

    expect(
      parseFrmLikeV1(minimal, { limits: { maxSourceBytes: 1 } })
    ).toMatchObject({ ok: false, reason: 'source-too-large' });

    const parsed = parseFrmLikeV1(minimal);
    expect(parsed).toMatchObject({ ok: true });
    if (parsed.ok) {
      expect(
        compileFrmLikeV1Backend(parsed.ir, {
          limits: { maxGeneratedShaderBytes: 0 },
        })
      ).toEqual({ ok: false, reason: 'generated-shader-too-large' });
      expect(
        compileFrmLikeV1Backend(parsed.ir, {
          glsl: {
            identifierPrefix: 'x'.repeat(
              FRM_LIKE_V1_DEFAULT_LIMITS.maxGeneratedShaderBytes
            ),
          },
        })
      ).toEqual({ ok: false, reason: 'generated-shader-too-large' });
    }
  });

  it('keeps state-teaching locals live and bare Classic numeric slots readable', () => {
    const stateExamples = [...frmExamples(normative), ...frmExamples(manual)].filter(
      (source) => source.includes('previous = z')
    );
    expect(stateExamples).toHaveLength(2);
    for (const source of stateExamples) {
      const parsed = parseFrmLikeV1(source);
      expect(parsed).toMatchObject({ ok: true });
      if (parsed.ok) {
        expect(statementsReadName(parsed.ir.loop, 'previous')).toBe(true);
        const firstUpdateIndex = parsed.ir.loop.findIndex(
          (statement) => statement.kind === 'assignment' && statement.target === 'z'
        );
        const branchIndex = parsed.ir.loop.findIndex(
          (statement) => statement.kind === 'if'
        );
        const snapshotIndex = parsed.ir.loop.findIndex(
          (statement) =>
            statement.kind === 'assignment' && statement.target === 'previous'
        );
        expect(firstUpdateIndex).toBeGreaterThanOrEqual(0);
        expect(snapshotIndex).toBeGreaterThan(firstUpdateIndex);
        expect(branchIndex).toBeGreaterThan(snapshotIndex);
        expect(
          statementsReadName(parsed.ir.loop.slice(branchIndex + 1), 'previous')
        ).toBe(true);
      }
    }

    const minimal = frmExamples(normative)[0];
    const bareSlot = parseFrmLikeV1(minimal.replace('z ^ 2 + c', 'z ^ 2 + p3'));
    expect(bareSlot).toMatchObject({ ok: true });
    if (bareSlot.ok) {
      const compiled = compileFrmLikeV1Backend(bareSlot.ir);
      expect(compiled).toMatchObject({ ok: true });
      if (compiled.ok) {
        expect(compiled.backend.cpu.createState().values.p3).toEqual({ re: 0, im: 0 });
        expect(compiled.backend.glsl.declarations).toContain('uniform vec2 p3;');
        expect(normative).toContain('uniform as complex zero');
      }
    }

    const boundSource = frmExamples(normative).find((source) =>
      source.includes('classic p1')
    );
    expect(boundSource).toBeDefined();
    const bound = parseFrmLikeV1(boundSource ?? '');
    expect(bound).toMatchObject({ ok: true });
    if (bound.ok) {
      const compiled = compileFrmLikeV1Backend(bound.ir);
      expect(compiled).toMatchObject({ ok: true });
      if (compiled.ok) {
        const state = compiled.backend.cpu.createState();
        expect(state.values.p1).toEqual(state.values.power);
      }
    }

    const persistentLocalSource = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
PersistentLocal {
  init:
    carry = 1
    z = 0
  loop:
    z = z + carry
    carry = carry + 1
  bailout:
    carry < 4
}`;
    const persistentLocal = parseFrmLikeV1(persistentLocalSource);
    expect(persistentLocal).toMatchObject({ ok: true });
    if (persistentLocal.ok) {
      const compiled = compileFrmLikeV1Backend(persistentLocal.ir);
      expect(compiled).toMatchObject({ ok: true });
      if (compiled.ok) {
        const state = compiled.backend.cpu.createState();
        compiled.backend.cpu.init(state);
        expect(state.values.carry).toEqual({ re: 1, im: 0 });
        compiled.backend.cpu.step(state);
        compiled.backend.cpu.step(state);
        expect(state.values.carry).toEqual({ re: 3, im: 0 });
        expect(compiled.backend.cpu.shouldContinue(state)).toMatchObject({
          continue: true,
        });
      }
    }
  });

  it('derives the normative stdlib, guards, and full Safety Envelope from code', () => {
    const stdlibBlock = normative.match(
      /The complete frozen function-name surface is:\n\n```text\n([\s\S]*?)\n```/
    );
    expect(stdlibBlock).not.toBeNull();
    expect(stdlibBlock?.[1].trim().split(/\s+/)).toEqual([
      ...FRM_V1_STDLIB_NAMES,
    ]);

    const manualStdlib = manual.match(/The stdlib includes:\n\n([\s\S]*?)\n\nRemember/);
    expect(manualStdlib).not.toBeNull();
    const manualNames = [
      ...(manualStdlib?.[1].matchAll(/`([a-z][a-z0-9]*)`/g) ?? []),
    ].map((match) => match[1]);
    expect([...new Set(manualNames)].sort()).toEqual(
      [...FRM_V1_STDLIB_NAMES].sort()
    );
    expect(manualNames).toHaveLength(FRM_V1_STDLIB_NAMES.length);

    for (const guard of FRM_LIKE_V1_CLASSIC_GUARDS) {
      expect(normative).toContain(`- \`${guard}\`:`);
    }

    const safetyRows: Array<
      [string, keyof typeof FRM_LIKE_V1_DEFAULT_LIMITS]
    > = [
      ['Source input and pinned Definition source', 'maxSourceBytes'],
      ['Generated shader', 'maxGeneratedShaderBytes'],
      ['Parameters', 'maxParameters'],
      ['Locals', 'maxLocals'],
      ['AST nodes', 'maxAstNodes'],
      ['Expression depth', 'maxExpressionDepth'],
      ['Statements', 'maxStatements'],
      ['Control-flow nodes', 'maxControlFlowNodes'],
      ['Control-flow depth', 'maxControlFlowDepth'],
    ];
    expect(safetyRows.map(([, key]) => key).sort()).toEqual(
      Object.keys(FRM_LIKE_V1_DEFAULT_LIMITS).sort()
    );
    for (const [label, key] of safetyRows) {
      expect(normative).toContain(
        `| ${label} | ${FRM_LIKE_V1_DEFAULT_LIMITS[key].toLocaleString('en-US')}`
      );
    }
  });

  it('resolves every relative link in the new and delegating English documents', () => {
    for (const path of [
      normativePath,
      manualPath,
      'docs/README.md',
      'docs/specs/unified-formula-library-v1.md',
    ]) {
      const markdown = repoFile(path);
      const headingSlugBases = markdownHeadingSlugBases(markdown);
      expect(new Set(headingSlugBases).size, `${path}: heading IDs`).toBe(
        headingSlugBases.length
      );
      const targets = [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(
        (match) => match[1]
      );
      expect(targets.length, path).toBeGreaterThan(0);
      for (const target of targets) {
        if (/^(?:https?:|mailto:)/.test(target)) continue;
        const [fileTarget, fragment] = target.split('#', 2);
        const resolvedTarget = fileTarget
          ? resolve(dirname(join(process.cwd(), path)), fileTarget)
          : join(process.cwd(), path);
        expect(existsSync(resolvedTarget), `${path} -> ${target}`).toBe(true);
        if (fragment) {
          expect(
            markdownHeadingSlugs(readFileSync(resolvedTarget, 'utf8')),
            `${path} -> ${target}`
          ).toContain(decodeURIComponent(fragment));
        }
      }
    }
  });

  it('keeps the public English guide explicit about the two active surfaces', () => {
    const guide = enMessages.formulas.frmGuide;
    expect(guide.intro).toContain('FRM-like v1');
    expect(guide.sections['what-is-frm'].body.join(' ')).toContain(
      'Classic-compatible standalone Editor'
    );
    expect(guide.sections.support.intro).toContain(
      'Classic-compatible Editor and import path'
    );
    expect(guide.sections.support.disclaimer).toContain(
      'not the 677-identity Standard publication ledger'
    );
    expect(guide.sections.syntax.intro).toContain(
      "published Formula Record's Source action"
    );
    expect(guide.sections.syntax.intro).not.toContain('normative v1 reference');
    expect(guide.sections.tutorials.intro).toContain(
      'Classic-compatible Editor examples'
    );
    expect(guide.sections['next-steps'].editorNote).toContain(
      'does not accept canonical FRM-like v1 source'
    );
    expect(enMessages.formulas.index.frm.description).toContain(
      'Published Standard Definitions use pinned FRM-like v1 source'
    );
    expect(enMessages.formulas.index.frm.description).toContain(
      'standalone Editor uses the Classic-compatible source contract'
    );
    expect(enMessages.formulas.index.intro).toContain(
      "FractalPark's 94 built-in Explorer formulas"
    );
    expect(enMessages.formulas.index.intro).toContain(
      'learn how FRM source works and choose the matching authoring surface'
    );
    expect(enMessages.explore.landing.links.frmGuide).toContain(
      'published FRM-like v1 and Classic-compatible Editor source'
    );
    expect(enMessages.formulas.index.intro).not.toContain('complete catalog');
    expect(enMessages.formulas.index.intro).not.toContain(
      'write your own formula with FRM'
    );
    expect(enMessages.metadata.formulaAtlas.description).toContain(
      'learn how FRM source works'
    );
    expect(enMessages.formulas.index.cta.description).toContain(
      'Classic-compatible custom-iteration subset'
    );
    expect(enMessages.frmEditor.description).toContain(
      'Classic-compatible FRM subset'
    );
    expect(enMessages.metadata.frmEditor.description).toContain(
      'Classic-compatible FRM subset'
    );
    expect(enMessages.about.aiDescription).toContain(
      '513 published Standard Definitions with pinned FRM-like v1 source'
    );
    expect(enMessages.about.aiDescription).toContain(
      'separate Classic-compatible custom formula Editor'
    );
    expect(enMessages.about.techStack.formula).toContain(
      'published FRM-like v1 parser/backend'
    );
    expect(enMessages.about.techStack.formula).toContain(
      'separate Classic-compatible CodeMirror 6 Editor'
    );
    for (const copy of [
      enMessages.explore.landing.whatIsAnswer,
      enMessages.metadata.explore.description,
      enMessages.metadata.explore.ogDescription,
      enMessages.publicProject.definition,
      enMessages.publicProject.aiDescription,
      enMessages.publicProject.boundaries.current['0'],
    ]) {
      expect(copy).toContain('FRM-like v1');
      expect(copy).toContain('Classic-compatible');
    }
    expect(enMessages.publicProject.tagline).toContain(
      'published formula source you can read and run'
    );
    expect(enMessages.publicProject.tagline).toContain(
      'Classic-compatible formula editor'
    );
    expect(manual).toContain('z = transform(z) * scale + offset + c / maxit');
    expect(manual).toContain('LastSqr < 576');
    expect(manual).toContain('preserve any reviewed optional `@classic-guards`');
    expect(normative).toContain('MUST NOT be added, removed, or edited without');

    const readme = repoFile('README.md');
    expect(readme).toContain(
      `${PUBLISHED_FORMULA_RECORD_COUNT_V1} published Definitions`
    );
    expect(readme).toContain(
      `${FORMULA_RECORD_COUNT_V1 - PUBLISHED_FORMULA_RECORD_COUNT_V1} held Records without runnable source`
    );
  });

  it('binds limits, vocabulary, and document navigation to implementation facts', () => {
    expect(normative).toContain(
      `source input above ${FRM_LIKE_V1_DEFAULT_LIMITS.maxSourceBytes.toLocaleString('en-US')} UTF-8 bytes before parsing`
    );
    expect(normative).toContain('`sourceRevision`');
    expect(normative).toContain('`semanticHash`');
    expect(normative).toContain('`nonFinite`');
    expect(normative).toContain('source-order and left-to-right');
    for (const frozenClause of [
      '`acosh(z) = log(z + sqrt(z - 1) * sqrt(z + 1))`',
      '`sqrt(re^2 + im^2)`',
      '`x / Inf === 0`',
      '`src/engine/formulas/v1/classic-dialect-guards.ts`',
      'new stdlib version and Upgrade & Compare',
      'MUST NOT delegate this rule to host-dependent or GLSL-native',
      '**Open Compatible Copy** creates a new compatible copy',
      'The canonical formatter form MUST NOT nest',
      'When `ismand` is true, the host supplies the current `pixel` as `c`',
      'non-conformance with §1',
      '`permutationWithTrivia(a, b, c, d?)`',
      'immediately after `@numeric-profile`',
      '`zero-division, floored-log, hyperbolic-clamp`',
      'There are no function-typed locals',
      'not external host inputs',
      'MUST NOT escape as host exceptions',
      'read-only with metadata and any existing',
      '`cosxx(x + i*y)`',
      '`cos(x) * cosh(y) + i * sin(x) * sinh(y)`',
      'Except for the magnitude/OR boundary below, ASCII spaces or',
      'bailout         = "bailout", ":", NEWLINE, booleanExpression, NEWLINE',
      '`&&`, `||`, and unary `!`',
      '**pinned Definition source**',
      '**canonical formatter form**',
      'are case-sensitive',
      'Complex literals are valid in',
      'All locals live in one per-pixel state frame',
      'Known v0.4.19 host-integration limitation',
      'per-component binary32 rounding',
      'fails with `undeclared-read`',
      'zero imaginary component',
      'regression gate C10 remains pending',
    ]) {
      expect(normative).toContain(frozenClause);
    }

    expect(manual).toContain('The canonical v1 formatter form');
    expect(manual).toContain('MUST NOT nest magnitude bars');
    expect(manual).toContain('use `cabs(...)` for the inner modulus');
    expect(manual).toContain('regression gate C10 remains pending');
    expect(manual).toContain('not claimed as exercised product behavior today');
    expect(manual).toContain('`zPrev` and `LastSqr` are not external host inputs');
    expect(manual).toContain('MUST NOT be overridden');
    expect(manual).toContain('MUST be held by publication');
    expect(manual).toContain('Classic squared-magnitude threshold of `4`');
    expect(manual).toContain('corresponds to `|z| <= 2`');

    const regressionMatrix = repoFile(
      'docs/testing/v0.4.19-regression-matrix.md'
    );
    expect(regressionMatrix).toContain(
      'front end still accepts parenthesized nested magnitude'
    );
    expect(regressionMatrix).toContain(
      'writer activation remains blocked on parser rejection'
    );
    expect(regressionMatrix).toContain(
      'six non-English manual/message projections are model-reviewed'
    );
    expect(regressionMatrix).toContain(
      'document production parser/backend behavior plus disclosed deviations'
    );
    expect(regressionMatrix).toContain('2026-08-20 A3 clarification');
    expect(regressionMatrix).toContain(
      'comments/format only affect sourceRevision'
    );
    expect(regressionMatrix).toContain('prior Formula Record scope retained');
    expect(regressionMatrix).toContain('927-byte maximum');
    expect(regressionMatrix).toContain('partial: contract-test portion passes');

    const assembler = repoFile('src/engine/shaders/assembler.ts');
    const stdlibPrelude = repoFile('src/engine/frm/frm-v1-glsl-prelude.ts');
    const publishedAdapter = repoFile(
      'src/engine/formulas/v1/published-adapter.ts'
    );
    expect(assembler).toContain('vec2 c = u_isJulia ? u_juliaC : point');
    expect(assembler).toContain('${resetFunction}(point, c, u_maxIterations, !u_isJulia)');
    expect(publishedAdapter).toContain(
      'frmV1ResetState(vec2 point, vec2 orbitC, int maxIterations, bool parameterPlane)'
    );
    expect(publishedAdapter).toContain('glslName("c")} = orbitC');
    expect(stdlibPrelude).toContain(
      'vec2 sinCos = frmV1StableSinCos(z.x);'
    );
    expect(stdlibPrelude).toContain(
      'vec2(sinCos.y * frmV1CoshReal(z.y), sinCos.x * frmV1SinhReal(z.y))'
    );

    const docsIndex = repoFile('docs/README.md');
    const unifiedContract = repoFile(
      'docs/specs/unified-formula-library-v1.md'
    );
    expect(docsIndex).toContain('(specs/frm-like-language-v1.md)');
    expect(docsIndex).toContain('(manuals/frm-like-v1.md)');
    expect(unifiedContract).toContain('(frm-like-language-v1.md)');
    expect(unifiedContract).toContain('Active published bodies are immutable byte-pinned');
    expect(unifiedContract).toContain('The gated writer path is stricter');
    expect(unifiedContract).not.toContain(
      'must already equal the canonical formatter output'
    );
    expect(unifiedContract).toContain('`profileRevision`');
    expect(unifiedContract).toContain('lone surrogates');
    expect(unifiedContract).toContain('`backendRevision`');
    expect(unifiedContract).toContain('`artifactSha256`');
  });
});
