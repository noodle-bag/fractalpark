/**
 * Versioned FRM capability manifest (v0.4.18 Slice 7a).
 *
 * The single source of truth for what the classic-FractInt dialect supports.
 * Downstream consumers (FRM Guide, Editor, Spec, verification report) land
 * in the follow-up units of Slice 7 — this module is the contract they must
 * consume; a second hand-written capability table anywhere else is a defect
 * (plan §13.3).
 *
 * Sourcing discipline:
 * - Dialect and vocabulary facts are DERIVED from the engine's own runtime
 *   constants (builtins registry, parser SYSTEM_VARS, descriptor/reject
 *   vocabularies, smooth-capability vocabulary). The engine arrays carry
 *   bidirectional type assertions, so a union that grows without updating
 *   its runtime vocabulary fails the build; the manifest-level drift test
 *   (frm-capability-manifest.test.ts) then proves every listed fact with a
 *   real compiler probe.
 * - Compatibility counts (588/117, tiers, waivers) are the frozen evidence
 *   of the private F588 verification runs (maps + orbits + WebGL smoke, all
 *   executed against this commit). A private verifier recomputes them from
 *   the fixtures; the public repo stores numbers and reason categories only
 *   — never corpus source text.
 */

import {
  KNOWN_FUNCTION_NAMES,
  FN_SLOT_NAMES,
  PARAMETER_NAMES,
  LEGACY_BUILTIN_NAMES,
} from './builtins';
import {
  BAILOUT_DESCRIPTOR_KINDS,
  BAILOUT_REJECT_REASONS,
  C4R_FORMS,
} from './bailout-descriptor';
import { SYSTEM_VARS } from './parser';
import { SMOOTH_CAPABILITIES } from '../plugins/types';
import {
  DEFAULT_FRM_SEMANTICS_VERSION,
  FRM_SEMANTICS_VERSIONS,
  STRICT_FRM_SEMANTICS_VERSION,
} from './semantics-version';
import { CLASSIC_REBINDABLE_VARIABLES } from './classic-frontend';

export const FRM_CAPABILITY_MANIFEST_VERSION = 1;

const BUILTIN_FUNCTIONS = KNOWN_FUNCTION_NAMES.filter(
  (name) => !(FN_SLOT_NAMES as readonly string[]).includes(name),
);

/** Variables classic sources may rebind — derived from the classic
 * frontend's lowering contract (never restated here). */
const CLASSIC_REBINDABLE = CLASSIC_REBINDABLE_VARIABLES;

/** Write-protected for classic compiles: the parser's protected set minus
 * the classic-rebindable names. Derived — never restated. */
const CLASSIC_WRITE_PROTECTED = [...SYSTEM_VARS].filter(
  (name) => !(CLASSIC_REBINDABLE as readonly string[]).includes(name),
);

export const FRM_CAPABILITY_MANIFEST = {
  manifestVersion: FRM_CAPABILITY_MANIFEST_VERSION,
  semantics: {
    versions: FRM_SEMANTICS_VERSIONS,
    defaultVersion: DEFAULT_FRM_SEMANTICS_VERSION,
    strictVersion: STRICT_FRM_SEMANTICS_VERSION,
  },
  dialect: {
    parameters: PARAMETER_NAMES,
    fnSlots: FN_SLOT_NAMES,
    builtinFunctions: BUILTIN_FUNCTIONS,
    legacyBuiltins: LEGACY_BUILTIN_NAMES,
    /** Raw parser-level write protection (both dialects). */
    parserProtectedVariables: [...SYSTEM_VARS],
    classicRebindable: CLASSIC_REBINDABLE,
    writeProtectedVariables: CLASSIC_WRITE_PROTECTED,
    orbitVariable: 'z',
  },
  bailout: {
    /** Bounded-predicate descriptor kinds under strict v2. */
    descriptorKinds: BAILOUT_DESCRIPTOR_KINDS,
    c4rForms: C4R_FORMS,
    c5Magnitude: 'last-sqr',
    /** Stable reject reasons (also the 117-exclusion vocabulary). */
    rejectReasons: BAILOUT_REJECT_REASONS,
  },
  features: {
    ifElse: true,
    assignmentExpressions: true,
    componentLvalues: true,
    implicitMultiplication: 'adjacent-only',
    scientificNotation: true,
    lineContinuation: 'physical-eol',
    /** After-step bailout timing applies to classic-dialect compiles under
     * strict v2 only (native and v1 keep the historical pre-step path). */
    afterStepTiming: 'classic-v2',
    smoothCapability: SMOOTH_CAPABILITIES,
  },
  compatibility: {
    /** Frozen compatibility target set (strict-v2 passes + documented waivers). */
    target: 588,
    /** Deterministically excluded entries (per-row stable reasons). */
    excluded: 117,
    tiers: {
      t0: { pass: 362, waivers: 0 },
      t1: { pass: 167, waivers: 7 },
      t2: { pass: 50, waivers: 2 },
    },
    /**
     * Waiver inventory: entry names (no source text) + reason category.
     * t1 waivers are documented in the private Slice-5 evidence archive;
     * t2 waivers are strict-v2 (and v1) rejects by design.
     */
    t2Waivers: [
      {
        entry: 'carr2289',
        reasons: ['system-variable-write', 'unsupported-function-asin'],
      },
      {
        entry: 'mandelbrotbc3',
        reasons: ['readonly-constant-write'],
      },
    ] as const,
  },
} as const;

export type FrmCapabilityManifest = typeof FRM_CAPABILITY_MANIFEST;
