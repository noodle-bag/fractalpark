/**
 * Capability-manifest drift gate (v0.4.18 Slice 7a).
 *
 * The manifest is the contract that Guide/Editor/Spec/report consume.
 * These tests fail whenever the engine and the manifest disagree: dialect
 * constants are compared both ways against the engine's runtime
 * vocabularies (which carry build-time exhaustiveness assertions), and
 * every descriptor kind / reject reason / feature flag / smooth tier is
 * exercised through the REAL compiler with clean-room probes — never
 * asserted from the manifest itself.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FRM_CAPABILITY_MANIFEST } from '../engine/frm/capability-manifest';
import {
  KNOWN_FUNCTION_NAMES,
  FN_SLOT_NAMES,
  PARAMETER_NAMES,
  LEGACY_BUILTIN_NAMES,
} from '../engine/frm/builtins';
import {
  BAILOUT_DESCRIPTOR_KINDS,
  BAILOUT_REJECT_REASONS,
  C4R_FORMS,
} from '../engine/frm/bailout-descriptor';
import { SYSTEM_VARS } from '../engine/frm/parser';
import { SMOOTH_CAPABILITIES } from '../engine/plugins/types';
import {
  DEFAULT_FRM_SEMANTICS_VERSION,
  FRM_SEMANTICS_VERSIONS,
  STRICT_FRM_SEMANTICS_VERSION,
} from '../engine/frm/semantics-version';
import { CLASSIC_REBINDABLE_VARIABLES } from '../engine/frm/classic-frontend';
import { compileClassicFrmEntry } from '../engine/frm/compile';
import { frmParserCache } from '../engine/frm/cache';

beforeEach(() => frmParserCache.clear());

const compile = (source: string) =>
  compileClassicFrmEntry(source, source.slice(0, source.indexOf(' ')), 'manifest-probe', 2);

const M = FRM_CAPABILITY_MANIFEST;

describe('manifest dialect facts match the engine constants', () => {
  it('builtin functions = KNOWN_FUNCTION_NAMES minus fn slots', () => {
    const expected = KNOWN_FUNCTION_NAMES.filter(
      (n) => !(FN_SLOT_NAMES as readonly string[]).includes(n),
    );
    expect([...M.dialect.builtinFunctions]).toEqual(expected);
  });

  it('parameters, fn slots, legacy builtins mirror builtins.ts', () => {
    expect([...M.dialect.parameters]).toEqual([...PARAMETER_NAMES]);
    expect([...M.dialect.fnSlots]).toEqual([...FN_SLOT_NAMES]);
    expect([...M.dialect.legacyBuiltins]).toEqual([...LEGACY_BUILTIN_NAMES]);
  });

  it('write protection is derived from the parser SYSTEM_VARS both ways', () => {
    expect([...M.dialect.parserProtectedVariables].sort()).toEqual(
      [...SYSTEM_VARS].sort(),
    );
    expect([...M.dialect.writeProtectedVariables].sort()).toEqual(
      [...SYSTEM_VARS]
        .filter((n) => !(M.dialect.classicRebindable as readonly string[]).includes(n))
        .sort(),
    );
    // Behavioral: every classic-protected name rejects as an assignment
    // target; every rebindable name compiles via the seed lowering.
    for (const name of M.dialect.writeProtectedVariables) {
      const r = compile(`WP${name} {\n  ${name}=p1, z=pixel:\n  z=z*z\n  |z|<=4\n}`);
      expect(r.success, `${name} must be write-protected`).toBe(false);
    }
    for (const name of M.dialect.classicRebindable) {
      const r = compile(`WR${name} {\n  ${name}=p1, z=pixel:\n  z=z*z+${name}\n  |z|<=4\n}`);
      expect(r.success, `${name} must rebind via the classic seed lowering`).toBe(true);
    }
    // The orbit variable itself stays assignable.
    const ok = compile(`WPOk {\n  ${M.dialect.orbitVariable}=pixel:\n  z=z*z\n  |z|<=4\n}`);
    expect(ok.success).toBe(true);
  });
});

describe('descriptor kinds, reject reasons, and forms are exactly the engine set', () => {
  it('manifest re-exports the engine vocabularies (reference equality)', () => {
    expect(M.bailout.descriptorKinds).toBe(BAILOUT_DESCRIPTOR_KINDS);
    expect(M.bailout.rejectReasons).toBe(BAILOUT_REJECT_REASONS);
    expect(M.bailout.c4rForms).toBe(C4R_FORMS);
    expect(M.features.smoothCapability).toBe(SMOOTH_CAPABILITIES);
    expect(M.semantics.versions).toBe(FRM_SEMANTICS_VERSIONS);
    expect(M.semantics.defaultVersion).toBe(DEFAULT_FRM_SEMANTICS_VERSION);
    expect(M.semantics.strictVersion).toBe(STRICT_FRM_SEMANTICS_VERSION);
    expect(M.dialect.classicRebindable).toBe(CLASSIC_REBINDABLE_VARIABLES);
  });

  it('every descriptor kind is produced by a real compile', () => {
    const probes: Record<string, string> = {
      C1: 'K1 {\n  z=pixel:\n  z=z*z+pixel\n  |z|<=4\n}',
      C2: 'K2 {\n  z=pixel:\n  z=z*z+pixel\n  |z|<=p2\n}',
      C4R: 'K4 {\n  z=pixel:\n  z=z*z+pixel\n  |real(z)|<=4\n}',
      C5: 'K5 {\n  z=pixel:\n  z=z*z+pixel\n  LastSqr <= 4\n}',
    };
    const produced = new Set<string>();
    for (const [kind, source] of Object.entries(probes)) {
      const r = compile(source);
      expect(r.success, `${kind} probe should compile`).toBe(true);
      expect(r.bailoutDescriptor?.kind).toBe(kind);
      produced.add(kind);
    }
    expect([...produced].sort()).toEqual([...BAILOUT_DESCRIPTOR_KINDS].sort());
  });

  it('c4r forms are pinned behaviorally (real and abs-real)', () => {
    const absReal = compile('F4a {\n  z=pixel:\n  z=z*z+pixel\n  |real(z)|<=4\n}');
    expect(absReal.bailoutDescriptor).toMatchObject({ kind: 'C4R', form: 'abs-real' });
    const real = compile('F4r {\n  z=pixel:\n  z=z*z+pixel\n  real(z)<=4\n}');
    expect(real.bailoutDescriptor).toMatchObject({ kind: 'C4R', form: 'real' });
    expect([...M.bailout.c4rForms].sort()).toEqual(['abs-real', 'real']);
  });

  it('c5 magnitude is pinned to the documented contract', () => {
    const r = compile('F5 {\n  z=pixel:\n  z=z*z+pixel\n  LastSqr <= 4\n}');
    expect(r.bailoutDescriptor).toMatchObject({
      kind: 'C5',
      magnitude: M.bailout.c5Magnitude,
    });
    expect(M.bailout.c5Magnitude).toBe('last-sqr');
  });

  it('every documented reject reason is produced by a real compile', () => {
    const probes: Record<string, string> = {
      'unknown-predicate': 'R1 {\n  z=pixel:\n  z=z*z+pixel\n  sqr(z)\n}',
      'unknown-magnitude-form': 'R2 {\n  z=pixel:\n  z=z*z+pixel\n  |pixel|<=4\n}',
      'threshold-not-loop-invariant': 'R3 {\n  z=pixel:\n  z=z*z+pixel\n  |z|<=sqrt(z)\n}',
      'chained-logical': 'R4 {\n  z=pixel:\n  z=z*z+pixel\n  |z|<=4 && |z|>=1\n}',
    };
    const produced = new Set<string>();
    for (const [reason, source] of Object.entries(probes)) {
      const r = compile(source);
      expect(r.success, `${reason} probe should reject`).toBe(false);
      expect(r.errors.join('\n')).toContain(`[${reason}]`);
      produced.add(reason);
    }
    expect([...produced].sort()).toEqual([...BAILOUT_REJECT_REASONS].sort());
  });

  it('every smooth capability tier is produced by a real compile', () => {
    const probes: Record<string, string> = {
      supported: 'S1 {\n  z=pixel:\n  z=z*z+pixel\n  |z|<=4\n}',
      adapted: 'S2 {\n  z=pixel:\n  z=sin(z)+pixel\n  |z|<=4\n}',
      unavailable: 'S3 {\n  z=pixel:\n  z=z*z+pixel\n  |real(z)|<=4\n}',
    };
    const produced = new Set<string>();
    for (const [tier, source] of Object.entries(probes)) {
      const r = compile(source);
      expect(r.success, `${tier} probe should compile`).toBe(true);
      expect(r.plugin?.smoothCapability, `${tier} probe tier`).toBe(tier);
      produced.add(tier);
    }
    expect([...produced].sort()).toEqual([...SMOOTH_CAPABILITIES].sort());
  });
});

describe('manifest feature flags pin real behavior (unconditional)', () => {
  it('flags are enabled with the documented modes', () => {
    expect(M.features.ifElse).toBe(true);
    expect(M.features.assignmentExpressions).toBe(true);
    expect(M.features.componentLvalues).toBe(true);
    expect(M.features.implicitMultiplication).toBe('adjacent-only');
    expect(M.features.scientificNotation).toBe(true);
    expect(M.features.lineContinuation).toBe('physical-eol');
    expect(M.features.afterStepTiming).toBe('classic-v2');
  });

  it('if/else compiles', () => {
    const r = compile(
      'FI {\n  z=pixel:\n  if(real(z)<0)\n    z=z*z+pixel\n  else\n    z=z*z+1\n  endif\n  |z|<=4\n}',
    );
    expect(r.success).toBe(true);
  });

  it('assignment expressions compile (guarded-write idiom)', () => {
    const r = compile(
      'FA {\n  z=pixel,x=1:\n  (z=z*z+pixel)*(x<10)\n  x=x+1\n  |z|<=4\n}',
    );
    expect(r.success).toBe(true);
  });

  it('component lvalues compile', () => {
    const r = compile(
      'FC {\n  z=pixel:\n  tmp=z\n  real(tmp)=real(z)+1\n  z=tmp\n  |z|<=4\n}',
    );
    expect(r.success).toBe(true);
  });

  it('adjacent implicit multiplication compiles (and spaced does not)', () => {
    expect(compile('FM {\n  z=pixel:\n  z=z*z+3pixel\n  |z|<=4\n}').success).toBe(true);
    expect(compile('FMS {\n  z=pixel:\n  z=z*z+3 pixel\n  |z|<=4\n}').success).toBe(false);
  });

  it('scientific notation compiles as one number', () => {
    expect(compile('FS {\n  z=pixel:\n  z=z*1e-12+pixel\n  |z|<=4\n}').success).toBe(true);
  });

  it('physical-EOL line continuation compiles', () => {
    const r = compile('FL {\n  z=pixel:\n  z=z*z+\\\npixel\n  |z|<=4\n}');
    expect(r.success).toBe(true);
  });

  it('classic v2 compiles report after-step timing', () => {
    const r = compile('FT {\n  z=pixel:\n  z=z*z+pixel\n  |z|<=4\n}');
    expect(r.success).toBe(true);
    expect(r.plugin?.afterStepTiming).toBe(true);
  });
});

describe('compatibility counts', () => {
  it('are internally consistent', () => {
    const c = M.compatibility;
    const pass = c.tiers.t0.pass + c.tiers.t1.pass + c.tiers.t2.pass;
    const waivers = c.tiers.t0.waivers + c.tiers.t1.waivers + c.tiers.t2.waivers;
    expect(pass + waivers).toBe(c.target);
    expect(c.t2Waivers).toHaveLength(c.tiers.t2.waivers);
  });
});
