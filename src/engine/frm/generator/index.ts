import type { FormulaExperienceHint } from '../authoring';
import { FN_SLOT_OPTIONS } from '../builtins';
import type { PluginParamRecord, PluginParamVector2 } from '../../types';
import {
  createFormulaGenerationSeedFromBytes,
  decodeCoefficientProfile,
  decodeInitMode,
  parseFormulaGenerationSeed,
} from './seed';
import type {
  FormulaGeneratorBlueprintId,
  FormulaGeneratorCoefficientProfile,
  FormulaGeneratorFamily,
  FormulaGeneratorFeatureFlag,
  FormulaGenerationHistoryEntry,
  FormulaGeneratorInitMode,
  FormulaGeneratorMechanism,
  FormulaGeneratorStarterProfile,
  GeneratedFormula,
} from './types';

interface WeightedEntry<T> {
  weight: number;
  value: T;
}

interface BlueprintConfig {
  id: FormulaGeneratorBlueprintId;
  family: FormulaGeneratorFamily;
  mechanism: FormulaGeneratorMechanism;
  starterProfiles: WeightedEntry<FormulaGeneratorStarterProfile>[];
  allowedFlags: FormulaGeneratorFeatureFlag[];
  wrapperSafe?: boolean;
}

const FAMILY_WEIGHTS: WeightedEntry<FormulaGeneratorFamily>[] = [
  { value: 'Polynomial', weight: 14 },
  { value: 'Rational', weight: 13 },
  { value: 'Root-Finding', weight: 9 },
  { value: 'Transcendental Entire', weight: 15 },
  { value: 'Transcendental Meromorphic', weight: 11 },
  { value: 'Anti-Holomorphic', weight: 13 },
  { value: 'Non-Holomorphic / Piecewise', weight: 14 },
  { value: 'Memory / Recurrence', weight: 15 },
];

const MECHANISM_WEIGHTS: Record<FormulaGeneratorFamily, WeightedEntry<FormulaGeneratorMechanism>[]> = {
  'Polynomial': [
    { value: 'core-iteration', weight: 42 },
    { value: 'parameter-shift', weight: 33 },
    { value: 'pixel-coupling-light', weight: 25 },
  ],
  'Rational': [
    { value: 'quotient-core', weight: 36 },
    { value: 'rational-shift', weight: 26 },
    { value: 'singular-perturbation-light', weight: 38 },
  ],
  'Root-Finding': [
    { value: 'newton-step', weight: 50 },
    { value: 'nova-perturbation-light', weight: 35 },
    { value: 'halley-like-step', weight: 15 },
  ],
  'Transcendental Entire': [
    { value: 'transcendental-core', weight: 30 },
    { value: 'transcendental-shift', weight: 28 },
    { value: 'gentle-entire-variation', weight: 42 },
  ],
  'Transcendental Meromorphic': [
    { value: 'pole-driven-core', weight: 50 },
    { value: 'meromorphic-shift', weight: 35 },
    { value: 'reciprocal-meromorphic-core', weight: 15 },
  ],
  'Anti-Holomorphic': [
    { value: 'conjugate-core', weight: 42 },
    { value: 'conjugate-shift', weight: 48 },
    { value: 'conjugate-pixel-coupled', weight: 10 },
  ],
  'Non-Holomorphic / Piecewise': [
    { value: 'abs-core', weight: 46 },
    { value: 'fold-core', weight: 22 },
    { value: 'piecewise-switch', weight: 32 },
  ],
  'Memory / Recurrence': [
    { value: 'feedback', weight: 48 },
    { value: 'echo', weight: 16 },
    { value: 'slot-driven-memory', weight: 36 },
  ],
};

const BLUEPRINTS: Record<FormulaGeneratorBlueprintId, BlueprintConfig> = {
  'poly.core.quadratic': {
    id: 'poly.core.quadratic',
    family: 'Polynomial',
    mechanism: 'core-iteration',
    starterProfiles: [
      { value: 'brot-like', weight: 55 },
      { value: 'julia-like', weight: 45 },
    ],
    allowedFlags: [],
  },
  'poly.core.shifted': {
    id: 'poly.core.shifted',
    family: 'Polynomial',
    mechanism: 'parameter-shift',
    starterProfiles: [
      { value: 'small-offset', weight: 45 },
      { value: 'imag-drift', weight: 30 },
      { value: 'real-drift', weight: 25 },
    ],
    allowedFlags: ['secondary_offset_on'],
  },
  'poly.core.affine-shift': {
    id: 'poly.core.affine-shift',
    family: 'Polynomial',
    mechanism: 'parameter-shift',
    starterProfiles: [
      { value: 'small-offset', weight: 35 },
      { value: 'imag-drift', weight: 35 },
      { value: 'real-drift', weight: 30 },
    ],
    allowedFlags: [],
  },
  'poly.core.pixel-coupled': {
    id: 'poly.core.pixel-coupled',
    family: 'Polynomial',
    mechanism: 'pixel-coupling-light',
    starterProfiles: [
      { value: 'gentle-coupling', weight: 60 },
      { value: 'tilted-field', weight: 40 },
    ],
    allowedFlags: ['secondary_offset_on'],
  },
  'poly.core.pixel-orbit': {
    id: 'poly.core.pixel-orbit',
    family: 'Polynomial',
    mechanism: 'pixel-coupling-light',
    starterProfiles: [
      { value: 'gentle-coupling', weight: 50 },
      { value: 'tilted-field', weight: 50 },
    ],
    allowedFlags: [],
  },
  'rat.quotient.core': {
    id: 'rat.quotient.core',
    family: 'Rational',
    mechanism: 'quotient-core',
    starterProfiles: [
      { value: 'balanced-quotient', weight: 55 },
      { value: 'compressed-orbit', weight: 45 },
    ],
    allowedFlags: [],
  },
  'rat.inversion.quadratic': {
    id: 'rat.inversion.quadratic',
    family: 'Rational',
    mechanism: 'rational-shift',
    starterProfiles: [
      { value: 'bubble-light', weight: 55 },
      { value: 'ring-tension', weight: 45 },
    ],
    allowedFlags: [],
  },
  'rat.rings.perturb': {
    id: 'rat.rings.perturb',
    family: 'Rational',
    mechanism: 'singular-perturbation-light',
    starterProfiles: [
      { value: 'bubble-light', weight: 45 },
      { value: 'ring-tension', weight: 55 },
    ],
    allowedFlags: [],
  },
  'rat.mcmullen.light': {
    id: 'rat.mcmullen.light',
    family: 'Rational',
    mechanism: 'singular-perturbation-light',
    starterProfiles: [
      { value: 'bubble-light', weight: 60 },
      { value: 'ring-tension', weight: 40 },
    ],
    allowedFlags: [],
  },
  'hybrid.spider.recip': {
    id: 'hybrid.spider.recip',
    family: 'Rational',
    mechanism: 'quotient-core',
    starterProfiles: [
      { value: 'balanced-quotient', weight: 55 },
      { value: 'compressed-orbit', weight: 45 },
    ],
    allowedFlags: [],
  },
  'rat.singular.perturb.light': {
    id: 'rat.singular.perturb.light',
    family: 'Rational',
    mechanism: 'singular-perturbation-light',
    starterProfiles: [
      { value: 'bubble-light', weight: 55 },
      { value: 'ring-tension', weight: 45 },
    ],
    allowedFlags: ['secondary_offset_on'],
  },
  'root.newton.poly': {
    id: 'root.newton.poly',
    family: 'Root-Finding',
    mechanism: 'newton-step',
    starterProfiles: [
      { value: 'clean-basin', weight: 60 },
      { value: 'balanced-root', weight: 40 },
    ],
    allowedFlags: [],
  },
  'root.nova.shifted': {
    id: 'root.nova.shifted',
    family: 'Root-Finding',
    mechanism: 'nova-perturbation-light',
    starterProfiles: [
      { value: 'nova-gentle', weight: 40 },
      { value: 'ornamental-basin', weight: 35 },
      { value: 'spiral-basin', weight: 25 },
    ],
    allowedFlags: ['secondary_offset_on'],
  },
  'root.halley.poly': {
    id: 'root.halley.poly',
    family: 'Root-Finding',
    mechanism: 'halley-like-step',
    starterProfiles: [
      { value: 'dense-basin', weight: 55 },
      { value: 'halley-balanced', weight: 45 },
    ],
    allowedFlags: [],
  },
  'trans.sin.drift': {
    id: 'trans.sin.drift',
    family: 'Transcendental Entire',
    mechanism: 'transcendental-core',
    starterProfiles: [
      { value: 'soft-wave', weight: 40 },
      { value: 'curl-light', weight: 30 },
      { value: 'balanced-drift', weight: 30 },
    ],
    allowedFlags: ['pixel_on', 'wrapper_flip_on'],
    wrapperSafe: true,
  },
  'trans.sqrt.core': {
    id: 'trans.sqrt.core',
    family: 'Transcendental Entire',
    mechanism: 'transcendental-shift',
    starterProfiles: [
      { value: 'soft-branch', weight: 40 },
      { value: 'gentle-fork', weight: 35 },
      { value: 'near-neutral', weight: 25 },
    ],
    allowedFlags: ['p2_on'],
  },
  'trans.wave.fold': {
    id: 'trans.wave.fold',
    family: 'Transcendental Entire',
    mechanism: 'gentle-entire-variation',
    starterProfiles: [
      { value: 'soft-wave', weight: 35 },
      { value: 'curl-light', weight: 40 },
      { value: 'balanced-drift', weight: 25 },
    ],
    allowedFlags: ['pixel_on', 'wrapper_flip_on'],
    wrapperSafe: true,
  },
  'trans.rot.swirl': {
    id: 'trans.rot.swirl',
    family: 'Transcendental Entire',
    mechanism: 'gentle-entire-variation',
    starterProfiles: [
      { value: 'soft-wave', weight: 30 },
      { value: 'curl-light', weight: 45 },
      { value: 'balanced-drift', weight: 25 },
    ],
    allowedFlags: ['pixel_on'],
  },
  'mero.tan.core': {
    id: 'mero.tan.core',
    family: 'Transcendental Meromorphic',
    mechanism: 'pole-driven-core',
    starterProfiles: [
      { value: 'pole-tense', weight: 55 },
      { value: 'filament-wave', weight: 45 },
    ],
    allowedFlags: [],
  },
  'mero.coth.shift': {
    id: 'mero.coth.shift',
    family: 'Transcendental Meromorphic',
    mechanism: 'meromorphic-shift',
    starterProfiles: [
      { value: 'spike-balanced', weight: 55 },
      { value: 'radial-volatile', weight: 45 },
    ],
    allowedFlags: ['pixel_on'],
  },
  'anti.conj.core': {
    id: 'anti.conj.core',
    family: 'Anti-Holomorphic',
    mechanism: 'conjugate-core',
    starterProfiles: [
      { value: 'tricorn-like', weight: 60 },
      { value: 'sharp-balance', weight: 40 },
    ],
    allowedFlags: [],
  },
  'anti.conj.shift': {
    id: 'anti.conj.shift',
    family: 'Anti-Holomorphic',
    mechanism: 'conjugate-shift',
    starterProfiles: [
      { value: 'offset-tricorn', weight: 45 },
      { value: 'imag-bias', weight: 30 },
      { value: 'real-bias', weight: 25 },
    ],
    allowedFlags: ['secondary_offset_on'],
  },
  'anti.conj.affine': {
    id: 'anti.conj.affine',
    family: 'Anti-Holomorphic',
    mechanism: 'conjugate-shift',
    starterProfiles: [
      { value: 'offset-tricorn', weight: 35 },
      { value: 'imag-bias', weight: 35 },
      { value: 'real-bias', weight: 30 },
    ],
    allowedFlags: [],
  },
  'anti.conj.reciprocal': {
    id: 'anti.conj.reciprocal',
    family: 'Anti-Holomorphic',
    mechanism: 'conjugate-shift',
    starterProfiles: [
      { value: 'offset-tricorn', weight: 40 },
      { value: 'imag-bias', weight: 35 },
      { value: 'real-bias', weight: 25 },
    ],
    allowedFlags: [],
  },
  'anti.conj.pixel': {
    id: 'anti.conj.pixel',
    family: 'Anti-Holomorphic',
    mechanism: 'conjugate-pixel-coupled',
    starterProfiles: [
      { value: 'radiant-conjugate', weight: 55 },
      { value: 'field-tricorn', weight: 45 },
    ],
    allowedFlags: [],
  },
  'nonholo.abs.core': {
    id: 'nonholo.abs.core',
    family: 'Non-Holomorphic / Piecewise',
    mechanism: 'abs-core',
    starterProfiles: [
      { value: 'burning-lite', weight: 40 },
      { value: 'hard-fold', weight: 35 },
      { value: 'angular-drift', weight: 25 },
    ],
    allowedFlags: ['pixel_on'],
  },
  'nonholo.abs.reciprocal': {
    id: 'nonholo.abs.reciprocal',
    family: 'Non-Holomorphic / Piecewise',
    mechanism: 'abs-core',
    starterProfiles: [
      { value: 'burning-lite', weight: 35 },
      { value: 'hard-fold', weight: 40 },
      { value: 'angular-drift', weight: 25 },
    ],
    allowedFlags: [],
  },
  'nonholo.fold.switch': {
    id: 'nonholo.fold.switch',
    family: 'Non-Holomorphic / Piecewise',
    mechanism: 'piecewise-switch',
    starterProfiles: [
      { value: 'balanced-branch', weight: 45 },
      { value: 'hard-split', weight: 30 },
      { value: 'radial-switch', weight: 25 },
    ],
    allowedFlags: ['secondary_offset_on'],
  },
  'nonholo.flip.abs': {
    id: 'nonholo.flip.abs',
    family: 'Non-Holomorphic / Piecewise',
    mechanism: 'fold-core',
    starterProfiles: [
      { value: 'twisted-fold', weight: 55 },
      { value: 'geometric-mirror', weight: 45 },
    ],
    allowedFlags: ['pixel_on'],
  },
  'memory.echo.quadratic': {
    id: 'memory.echo.quadratic',
    family: 'Memory / Recurrence',
    mechanism: 'feedback',
    starterProfiles: [
      { value: 'soft-echo', weight: 40 },
      { value: 'sharp-echo', weight: 35 },
      { value: 'slow-drift', weight: 25 },
    ],
    allowedFlags: ['pixel_on', 'wrapper_flip_on'],
    wrapperSafe: true,
  },
  'memory.echo.shifted': {
    id: 'memory.echo.shifted',
    family: 'Memory / Recurrence',
    mechanism: 'feedback',
    starterProfiles: [
      { value: 'soft-echo', weight: 35 },
      { value: 'sharp-echo', weight: 35 },
      { value: 'slow-drift', weight: 30 },
    ],
    allowedFlags: ['pixel_on'],
  },
  'memory.echo.inversion': {
    id: 'memory.echo.inversion',
    family: 'Memory / Recurrence',
    mechanism: 'feedback',
    starterProfiles: [
      { value: 'soft-echo', weight: 35 },
      { value: 'sharp-echo', weight: 40 },
      { value: 'slow-drift', weight: 25 },
    ],
    allowedFlags: [],
  },
  'memory.slot.weave': {
    id: 'memory.slot.weave',
    family: 'Memory / Recurrence',
    mechanism: 'slot-driven-memory',
    starterProfiles: [
      { value: 'sin-conj', weight: 30 },
      { value: 'identity-sin', weight: 25 },
      { value: 'cos-flip', weight: 25 },
      { value: 'sqrt-identity', weight: 20 },
    ],
    allowedFlags: ['pixel_on', 'wrapper_flip_on', 'wrapper_conj_on'],
    wrapperSafe: true,
  },
  'memory.slot.orbit': {
    id: 'memory.slot.orbit',
    family: 'Memory / Recurrence',
    mechanism: 'slot-driven-memory',
    starterProfiles: [
      { value: 'sin-conj', weight: 30 },
      { value: 'identity-sin', weight: 25 },
      { value: 'cos-flip', weight: 25 },
      { value: 'sqrt-identity', weight: 20 },
    ],
    allowedFlags: ['pixel_on'],
  },
  'memory.mirror.echo': {
    id: 'memory.mirror.echo',
    family: 'Memory / Recurrence',
    mechanism: 'echo',
    starterProfiles: [
      { value: 'mirror-drift', weight: 40 },
      { value: 'tense-echo', weight: 35 },
      { value: 'dark-fold', weight: 25 },
    ],
    allowedFlags: ['pixel_on'],
  },
  'memory.transcendental.echo': {
    id: 'memory.transcendental.echo',
    family: 'Memory / Recurrence',
    mechanism: 'feedback',
    starterProfiles: [
      { value: 'living-wave', weight: 40 },
      { value: 'echo-soft', weight: 35 },
      { value: 'imag-flow', weight: 25 },
    ],
    allowedFlags: ['pixel_on', 'wrapper_flip_on'],
    wrapperSafe: true,
  },
};

const BLUEPRINT_WEIGHTS: Record<FormulaGeneratorMechanism, WeightedEntry<FormulaGeneratorBlueprintId>[]> = {
  'core-iteration': [{ value: 'poly.core.quadratic', weight: 100 }],
  'parameter-shift': [
    { value: 'poly.core.shifted', weight: 58 },
    { value: 'poly.core.affine-shift', weight: 42 },
  ],
  'pixel-coupling-light': [
    { value: 'poly.core.pixel-coupled', weight: 55 },
    { value: 'poly.core.pixel-orbit', weight: 45 },
  ],
  'quotient-core': [
    { value: 'rat.quotient.core', weight: 40 },
    { value: 'hybrid.spider.recip', weight: 60 },
  ],
  'rational-shift': [
    { value: 'rat.quotient.core', weight: 10 },
    { value: 'rat.singular.perturb.light', weight: 20 },
    { value: 'rat.inversion.quadratic', weight: 70 },
  ],
  'singular-perturbation-light': [
    { value: 'rat.singular.perturb.light', weight: 20 },
    { value: 'rat.rings.perturb', weight: 35 },
    { value: 'rat.mcmullen.light', weight: 45 },
  ],
  'newton-step': [{ value: 'root.newton.poly', weight: 100 }],
  'nova-perturbation-light': [{ value: 'root.nova.shifted', weight: 100 }],
  'halley-like-step': [{ value: 'root.halley.poly', weight: 100 }],
  'transcendental-core': [{ value: 'trans.sin.drift', weight: 100 }],
  'transcendental-shift': [
    { value: 'trans.sqrt.core', weight: 82 },
    { value: 'trans.sin.drift', weight: 18 },
  ],
  'gentle-entire-variation': [
    { value: 'trans.wave.fold', weight: 25 },
    { value: 'trans.sqrt.core', weight: 18 },
    { value: 'trans.sin.drift', weight: 7 },
    { value: 'trans.rot.swirl', weight: 50 },
  ],
  'pole-driven-core': [{ value: 'mero.tan.core', weight: 100 }],
  'meromorphic-shift': [
    { value: 'mero.coth.shift', weight: 70 },
    { value: 'mero.tan.core', weight: 30 },
  ],
  'reciprocal-meromorphic-core': [{ value: 'mero.coth.shift', weight: 100 }],
  'conjugate-core': [{ value: 'anti.conj.core', weight: 100 }],
  'conjugate-shift': [
    { value: 'anti.conj.shift', weight: 24 },
    { value: 'anti.conj.affine', weight: 20 },
    { value: 'anti.conj.reciprocal', weight: 56 },
  ],
  'conjugate-pixel-coupled': [{ value: 'anti.conj.pixel', weight: 100 }],
  'abs-core': [
    { value: 'nonholo.abs.core', weight: 40 },
    { value: 'nonholo.abs.reciprocal', weight: 60 },
  ],
  'fold-core': [{ value: 'nonholo.flip.abs', weight: 100 }],
  'piecewise-switch': [{ value: 'nonholo.fold.switch', weight: 100 }],
  'feedback': [
    { value: 'memory.echo.quadratic', weight: 20 },
    { value: 'memory.echo.shifted', weight: 15 },
    { value: 'memory.transcendental.echo', weight: 20 },
    { value: 'memory.echo.inversion', weight: 45 },
  ],
  'echo': [{ value: 'memory.mirror.echo', weight: 100 }],
  'slot-driven-memory': [
    { value: 'memory.slot.weave', weight: 58 },
    { value: 'memory.slot.orbit', weight: 42 },
  ],
};

const PREFIXES = ['Orb', 'Mirror', 'Ribbon', 'Glass', 'Spiral', 'Branch', 'Echo', 'Drift', 'Nova', 'Basin'];
const SUFFIXES = ['Weave', 'Fold', 'Bloom', 'Lattice', 'Current', 'Filament', 'Crest', 'Garden', 'Wave', 'Core'];
const BAILOUTS = [16, 24, 32, 48] as const;

const COMPLEX_PARAM_VALUES: Record<FormulaGeneratorCoefficientProfile, PluginParamVector2[]> = {
  gentle: [
    [0.02, 0.0],
    [0.03, -0.01],
    [0.0, 0.03],
    [-0.02, 0.02],
  ],
  balanced: [
    [0.05, -0.02],
    [0.08, 0.03],
    [-0.06, 0.04],
    [0.03, -0.05],
  ],
  tense: [
    [0.12, -0.04],
    [0.14, 0.05],
    [-0.1, 0.08],
    [0.06, -0.12],
  ],
  'wild-lite': [
    [0.18, -0.06],
    [0.2, 0.08],
    [-0.15, 0.1],
    [0.08, -0.18],
  ],
};

const MEMORY_FEEDBACK_VALUES: Record<FormulaGeneratorCoefficientProfile, PluginParamVector2[]> = {
  gentle: [
    [0.06, 0.0],
    [0.08, 0.02],
    [0.1, -0.03],
  ],
  balanced: [
    [0.12, 0.03],
    [0.16, -0.04],
    [0.18, 0.05],
  ],
  tense: [
    [0.2, -0.05],
    [0.22, 0.06],
    [0.24, -0.08],
  ],
  'wild-lite': [
    [0.26, 0.08],
    [0.28, -0.1],
  ],
};

const PIXEL_VALUES: Record<FormulaGeneratorCoefficientProfile, PluginParamVector2[]> = {
  gentle: [
    [0.03, 0.0],
    [0.04, 0.01],
  ],
  balanced: [
    [0.06, 0.0],
    [0.08, -0.02],
  ],
  tense: [
    [0.1, 0.0],
    [0.12, -0.03],
  ],
  'wild-lite': [[0.14, 0.0]],
};

const ROOT_OFFSET_VALUES: Record<FormulaGeneratorCoefficientProfile, PluginParamVector2[]> = {
  gentle: [
    [0.01, 0.0],
    [0.02, -0.01],
  ],
  balanced: [
    [0.03, 0.01],
    [-0.03, 0.02],
  ],
  tense: [
    [0.05, -0.02],
    [0.06, 0.03],
  ],
  'wild-lite': [[0.08, -0.03]],
};

const DEFAULT_HISTORY_WINDOW = 12;
const DEFAULT_DIVERSIFIED_CANDIDATE_COUNT = 6;

const FN_SLOT_KEY_TO_VALUE = new Map(FN_SLOT_OPTIONS.map((option) => [option.key, option.value]));

function weightedPick<T>(byte: number, entries: WeightedEntry<T>[]): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = Math.floor((byte / 256) * total);

  for (const entry of entries) {
    if (cursor < entry.weight) {
      return entry.value;
    }
    cursor -= entry.weight;
  }

  return entries[entries.length - 1].value;
}

function pickFromList<T>(byte: number, values: T[]): T {
  return values[byte % values.length];
}

function inferFeatureBudget(byte: number): number {
  const budgetCode = (byte >> 6) & 0x03;
  if (budgetCode === 0) return 0;
  if (budgetCode === 1) return 1;
  if (budgetCode === 2) return 2;
  return 2;
}

function decodeRequestedFeatureFlags(byte: number): FormulaGeneratorFeatureFlag[] {
  const flags: FormulaGeneratorFeatureFlag[] = [];
  if (byte & 0b0010_0000) flags.push('pixel_on');
  if (byte & 0b0001_0000) flags.push('p2_on');
  if (byte & 0b0000_1000) flags.push('wrapper_flip_on');
  if (byte & 0b0000_0100) flags.push('wrapper_conj_on');
  if (byte & 0b0000_0010) flags.push('secondary_offset_on');
  return flags;
}

function applyFeatureConstraints(
  blueprint: BlueprintConfig,
  requested: FormulaGeneratorFeatureFlag[],
  budget: number,
): FormulaGeneratorFeatureFlag[] {
  const allowed = requested.filter((flag) => blueprint.allowedFlags.includes(flag));
  const result: FormulaGeneratorFeatureFlag[] = [];
  let wrapperUsed = false;

  for (const flag of allowed) {
    if ((flag === 'wrapper_flip_on' || flag === 'wrapper_conj_on')) {
      if (!blueprint.wrapperSafe || wrapperUsed) {
        continue;
      }
      wrapperUsed = true;
    }
    if (result.length >= budget) {
      break;
    }
    result.push(flag);
  }

  return result;
}

function formatReal(value: number): string {
  return value.toFixed(2).replace(/\.00$/, '.0');
}

function formatComplex(value: PluginParamVector2): string {
  return `(${formatReal(value[0])}, ${formatReal(value[1])})`;
}

function applyInitMode(base: '0' | 'pixel', initMode: FormulaGeneratorInitMode, offset: PluginParamVector2): string {
  if (base === 'pixel') {
    if (initMode === 'pixel-light-offset') {
      return `pixel + ${formatComplex(offset)}`;
    }
    return 'pixel';
  }

  if (initMode === 'z0-light-offset') {
    return formatComplex(offset);
  }

  return '0';
}

function selectName(byte6: number, byte7: number): string {
  const prefix = pickFromList(byte6, PREFIXES);
  const suffix = pickFromList(byte7, SUFFIXES);
  return `${prefix}${suffix}`;
}

function selectBailout(byte: number): number {
  return BAILOUTS[byte % BAILOUTS.length];
}

function pickComplex(profile: FormulaGeneratorCoefficientProfile, byte: number): PluginParamVector2 {
  return pickFromList(byte, COMPLEX_PARAM_VALUES[profile]);
}

function pickFeedback(profile: FormulaGeneratorCoefficientProfile, byte: number): PluginParamVector2 {
  return pickFromList(byte, MEMORY_FEEDBACK_VALUES[profile]);
}

function pickPixel(profile: FormulaGeneratorCoefficientProfile, byte: number): PluginParamVector2 {
  return pickFromList(byte, PIXEL_VALUES[profile]);
}

function pickRootOffset(profile: FormulaGeneratorCoefficientProfile, byte: number): PluginParamVector2 {
  return pickFromList(byte, ROOT_OFFSET_VALUES[profile]);
}

function clampFeedbackForBlueprint(
  blueprint: FormulaGeneratorBlueprintId,
  coefficientProfile: FormulaGeneratorCoefficientProfile,
  candidate: PluginParamVector2,
): PluginParamVector2 {
  if (blueprint !== 'memory.transcendental.echo') {
    return candidate;
  }

  if (coefficientProfile === 'gentle') return candidate;
  if (coefficientProfile === 'balanced') return [0.1, 0.02];
  if (coefficientProfile === 'tense') return [0.14, -0.03];
  return [0.16, 0.04];
}

function buildExperienceHint(
  family: FormulaGeneratorFamily,
  blueprint?: FormulaGeneratorBlueprintId,
): FormulaExperienceHint {
  switch (blueprint) {
    case 'rat.inversion.quadratic':
      return {
        bounds: { centerX: -0.16, centerY: 0.0, zoom: 0.78, rotation: 0 },
        coloring: { outsideColoringId: 'smooth', insideColoringId: 'black', paletteIndex: 1 },
      };
    case 'rat.rings.perturb':
      return {
        bounds: { centerX: -0.22, centerY: 0.0, zoom: 0.58, rotation: 0 },
        coloring: { outsideColoringId: 'smooth', insideColoringId: 'black', paletteIndex: 1 },
      };
    case 'rat.mcmullen.light':
      return {
        bounds: { centerX: 0.0, centerY: 0.0, zoom: 0.88, rotation: 0 },
        coloring: { outsideColoringId: 'stripe', insideColoringId: 'black', paletteIndex: 4 },
      };
    case 'hybrid.spider.recip':
      return {
        bounds: { centerX: -0.36, centerY: 0.0, zoom: 0.62, rotation: 0 },
        coloring: { outsideColoringId: 'smooth', insideColoringId: 'black', paletteIndex: 1 },
      };
    case 'trans.rot.swirl':
      return {
        bounds: { centerX: 0.18, centerY: 0.0, zoom: 1.08, rotation: 0.14 },
        coloring: { outsideColoringId: 'stripe', insideColoringId: 'black', paletteIndex: 3 },
      };
    case 'anti.conj.reciprocal':
      return {
        bounds: { centerX: -0.18, centerY: 0.0, zoom: 0.74, rotation: 0 },
        coloring: { outsideColoringId: 'smooth', insideColoringId: 'black', paletteIndex: 1 },
      };
    case 'nonholo.abs.reciprocal':
      return {
        bounds: { centerX: -0.36, centerY: 0.0, zoom: 0.34, rotation: 0 },
        coloring: { outsideColoringId: 'smooth', insideColoringId: 'black', paletteIndex: 0 },
      };
    case 'memory.echo.inversion':
      return {
        bounds: { centerX: -0.14, centerY: 0.0, zoom: 0.92, rotation: 0 },
        coloring: { outsideColoringId: 'stripe', insideColoringId: 'finalOrbit', paletteIndex: 2 },
      };
  }

  switch (family) {
    case 'Polynomial':
      return {
        bounds: { centerX: -0.5, centerY: 0, zoom: 0.4, rotation: 0 },
        coloring: { outsideColoringId: 'smooth', insideColoringId: 'black', paletteIndex: 0 },
      };
    case 'Rational':
      return {
        bounds: { centerX: -0.12, centerY: 0.0, zoom: 0.72, rotation: 0 },
        coloring: { outsideColoringId: 'smooth', insideColoringId: 'black', paletteIndex: 1 },
      };
    case 'Root-Finding':
      return {
        bounds: { centerX: 0.0, centerY: 0.0, zoom: 1.3, rotation: 0 },
        coloring: { outsideColoringId: 'smooth', insideColoringId: 'finalOrbit', paletteIndex: 2 },
      };
    case 'Transcendental Entire':
      return {
        bounds: { centerX: -0.08, centerY: 0.0, zoom: 0.92, rotation: 0 },
        coloring: { outsideColoringId: 'stripe', insideColoringId: 'black', paletteIndex: 3 },
      };
    case 'Transcendental Meromorphic':
      return {
        bounds: { centerX: 0.02, centerY: 0.0, zoom: 0.86, rotation: 0 },
        coloring: { outsideColoringId: 'stripe', insideColoringId: 'finalOrbit', paletteIndex: 4 },
      };
    case 'Anti-Holomorphic':
      return {
        bounds: { centerX: -0.12, centerY: 0.0, zoom: 0.65, rotation: 0 },
        coloring: { outsideColoringId: 'smooth', insideColoringId: 'black', paletteIndex: 1 },
      };
    case 'Non-Holomorphic / Piecewise':
      return {
        bounds: { centerX: -0.4, centerY: 0.0, zoom: 0.42, rotation: 0 },
        coloring: { outsideColoringId: 'smooth', insideColoringId: 'black', paletteIndex: 0 },
      };
    case 'Memory / Recurrence':
      return {
        bounds: { centerX: 0.0, centerY: 0.0, zoom: 1.02, rotation: 0 },
        coloring: { outsideColoringId: 'stripe', insideColoringId: 'finalOrbit', paletteIndex: 2 },
      };
  }
}

function buildSource(
  name: string,
  blueprint: BlueprintConfig,
  starterProfile: FormulaGeneratorStarterProfile,
  coefficientProfile: FormulaGeneratorCoefficientProfile,
  initMode: FormulaGeneratorInitMode,
  flags: FormulaGeneratorFeatureFlag[],
  bailout: number,
  seedByte: number,
): { source: string; starterParams: PluginParamRecord } {
  const starterParams: PluginParamRecord = {};
  const p1 = pickComplex(coefficientProfile, seedByte);
  const p2 = pickComplex(coefficientProfile, (seedByte + 17) & 0xff);
  const pixelValue = pickPixel(coefficientProfile, (seedByte + 29) & 0xff);
  const rootOffset = pickRootOffset(coefficientProfile, (seedByte + 41) & 0xff);
  const feedback = clampFeedbackForBlueprint(
    blueprint.id,
    coefficientProfile,
    pickFeedback(coefficientProfile, (seedByte + 53) & 0xff),
  );
  const reciprocalOffset = formatComplex([0.02, 0.0]);

  const usesP2 =
    flags.includes('p2_on') ||
    [
      'rat.quotient.core',
      'rat.singular.perturb.light',
      'rat.mcmullen.light',
      'hybrid.spider.recip',
      'trans.rot.swirl',
      'anti.conj.reciprocal',
      'nonholo.fold.switch',
      'nonholo.abs.reciprocal',
      'memory.echo.inversion',
    ].includes(blueprint.id);
  const pixelClause = flags.includes('pixel_on') ? ` + pixel * ${usesP2 ? 'p2' : formatComplex(pixelValue)}` : '';
  const secondaryOffsetClause = flags.includes('secondary_offset_on') ? ` + p2 * ${formatComplex([0.05, -0.02])}` : '';
  const withWrapper = (expr: string) => {
    if (flags.includes('wrapper_flip_on')) return `flip(${expr})`;
    if (flags.includes('wrapper_conj_on')) return `conj(${expr})`;
    return expr;
  };

  let loopExpr = 'z';

  switch (blueprint.id) {
    case 'poly.core.quadratic':
      loopExpr = 'z^2 + c';
      break;
    case 'poly.core.shifted':
      starterParams.u_p1 = p1;
      if (flags.includes('secondary_offset_on')) {
        starterParams.u_p2 = p2;
      }
      loopExpr = `z^2 + p1${secondaryOffsetClause}`;
      break;
    case 'poly.core.affine-shift':
      starterParams.u_p1 = p1;
      starterParams.u_p2 = p2;
      loopExpr = `z^2 + p1 + p2 * z`;
      break;
    case 'poly.core.pixel-coupled':
      starterParams.u_p1 = p1;
      loopExpr = `z^2 + c + pixel * p1`;
      break;
    case 'poly.core.pixel-orbit':
      starterParams.u_p1 = p1;
      loopExpr = `sqr(z + pixel * p1) + c`;
      break;
    case 'rat.quotient.core':
      starterParams.u_p1 = p1;
      starterParams.u_p2 = p2;
      loopExpr = `(z^2 + p1) / (1 + p2 * z)`;
      break;
    case 'rat.inversion.quadratic':
      starterParams.u_p1 = p1;
      loopExpr = `(1, 0) / (z^2 + p1 + ${reciprocalOffset}) + c`;
      break;
    case 'rat.rings.perturb':
      starterParams.u_p1 = p1;
      loopExpr = `z^2 + c + p1 / (z + ${reciprocalOffset})`;
      break;
    case 'rat.mcmullen.light':
      starterParams.u_p1 = p1;
      starterParams.u_p2 = p2;
      loopExpr = `z^3 + p1 / (z^2 + p2 + ${reciprocalOffset})`;
      break;
    case 'hybrid.spider.recip':
      starterParams.u_p1 = p1;
      loopExpr = `z^2 + c / (z + p1 + ${reciprocalOffset})`;
      break;
    case 'rat.singular.perturb.light':
      starterParams.u_p1 = p1;
      starterParams.u_p2 = p2;
      loopExpr = `z^2 + c + p1 / (z^2 + p2)`;
      break;
    case 'root.newton.poly':
      loopExpr = `z - (z^3 - 1) / (3 * z^2)`;
      break;
    case 'root.nova.shifted':
      starterParams.u_p1 = rootOffset;
      if (flags.includes('secondary_offset_on')) {
        starterParams.u_p2 = p2;
      }
      loopExpr = `z - (z^3 - 1) / (3 * z^2) + p1${secondaryOffsetClause}`;
      break;
    case 'root.halley.poly':
      loopExpr = `z - (2 * (z^3 - 1) * (3 * z^2)) / (2 * (3 * z^2)^2 - (z^3 - 1) * (6 * z))`;
      break;
    case 'trans.sin.drift':
      starterParams.u_p1 = p1;
      loopExpr = `${starterProfile === 'soft-wave' || starterProfile === 'balanced-drift' ? 'sin' : 'cos'}(${withWrapper('z')}) + p1${pixelClause}`;
      if (flags.includes('pixel_on') && usesP2) starterParams.u_p2 = p2;
      break;
    case 'trans.sqrt.core':
      starterParams.u_p1 = p1;
      if (usesP2) starterParams.u_p2 = p2;
      loopExpr = `sqrt(${withWrapper('z')} * ${withWrapper('z')} + p1)${secondaryOffsetClause}`;
      break;
    case 'trans.wave.fold':
      starterParams.u_p1 = p1;
      if (flags.includes('pixel_on')) starterParams.u_p2 = p2;
      loopExpr = `cos(${withWrapper('z')}) + p1${pixelClause}`;
      break;
    case 'trans.rot.swirl':
      starterParams.u_p1 = p1;
      starterParams.u_p2 = p2;
      loopExpr = `(z + p1 * sin(z)) * p2${pixelClause}`;
      if (flags.includes('pixel_on') && !starterParams.u_p2) starterParams.u_p2 = p2;
      break;
    case 'mero.tan.core':
      starterParams.u_p1 = p1;
      loopExpr = `tan(z) + p1`;
      break;
    case 'mero.coth.shift':
      starterParams.u_p1 = p1;
      if (flags.includes('pixel_on')) starterParams.u_p2 = p2;
      loopExpr = `recip(tanh(z)) + p1${pixelClause}`;
      break;
    case 'anti.conj.core':
      loopExpr = `conj(z)^2 + c`;
      break;
    case 'anti.conj.shift':
      starterParams.u_p1 = p1;
      if (flags.includes('secondary_offset_on')) starterParams.u_p2 = p2;
      loopExpr = `conj(z)^2 + p1${secondaryOffsetClause}`;
      break;
    case 'anti.conj.affine':
      starterParams.u_p1 = p1;
      starterParams.u_p2 = p2;
      loopExpr = `conj(z)^2 + p1 + p2 * conj(z)`;
      break;
    case 'anti.conj.reciprocal':
      starterParams.u_p1 = p1;
      starterParams.u_p2 = p2;
      loopExpr = `conj(z)^2 + p1 / (z + p2 + ${reciprocalOffset})`;
      break;
    case 'anti.conj.pixel':
      starterParams.u_p1 = p1;
      loopExpr = `conj(z)^2 + pixel * p1`;
      break;
    case 'nonholo.abs.core':
      starterParams.u_p1 = p1;
      if (flags.includes('pixel_on')) starterParams.u_p2 = p2;
      loopExpr = `sqr(abs(z)) + p1${pixelClause}`;
      break;
    case 'nonholo.abs.reciprocal':
      starterParams.u_p1 = p1;
      starterParams.u_p2 = p2;
      loopExpr = `sqr(abs(z)) + p1 / (z + p2 + ${reciprocalOffset})`;
      break;
    case 'nonholo.fold.switch':
      starterParams.u_p1 = p1;
      starterParams.u_p2 = p2;
      loopExpr = `if ${starterProfile === 'radial-switch' ? '|z| > 0.50' : starterProfile === 'hard-split' ? 'imag(z) > 0' : 'real(z) > 0'}
    z = z^2 + p1
  else
    z = conj(z) + p2
  endif`;
      break;
    case 'nonholo.flip.abs':
      starterParams.u_p1 = p1;
      loopExpr = `flip(abs(z)) + p1${pixelClause}`;
      if (flags.includes('pixel_on')) starterParams.u_p2 = p2;
      break;
    case 'memory.echo.quadratic':
      starterParams.u_p1 = p1;
      if (flags.includes('pixel_on')) starterParams.u_p2 = p2;
      loopExpr = `sqr(${withWrapper('z')}) + zPrev * ${formatComplex(feedback)} + p1${pixelClause}`;
      break;
    case 'memory.echo.shifted':
      starterParams.u_p1 = p1;
      if (flags.includes('pixel_on')) starterParams.u_p2 = p2;
      loopExpr = `sqr(z + p1) + zPrev * ${formatComplex(feedback)}${pixelClause}`;
      break;
    case 'memory.echo.inversion':
      starterParams.u_p1 = p1;
      starterParams.u_p2 = p2;
      loopExpr = `sqr(z) + zPrev * ${formatComplex(feedback)} + p1 / (z + p2 + ${reciprocalOffset})`;
      break;
    case 'memory.slot.weave': {
      const slotMap: Record<FormulaGeneratorStarterProfile, [string, string]> = {
        'sin-conj': ['sin', 'conj'],
        'identity-sin': ['identity', 'sin'],
        'cos-flip': ['cos', 'flip'],
        'sqrt-identity': ['sqrt', 'identity'],
        'soft-echo': ['identity', 'identity'],
        'sharp-echo': ['identity', 'identity'],
        'slow-drift': ['identity', 'identity'],
        'living-wave': ['cos', 'identity'],
        'echo-soft': ['cos', 'identity'],
        'imag-flow': ['cos', 'identity'],
        'brot-like': ['identity', 'identity'],
        'julia-like': ['identity', 'identity'],
        'small-offset': ['identity', 'identity'],
        'imag-drift': ['identity', 'identity'],
        'real-drift': ['identity', 'identity'],
        'gentle-coupling': ['identity', 'identity'],
        'tilted-field': ['identity', 'identity'],
        'balanced-quotient': ['identity', 'identity'],
        'compressed-orbit': ['identity', 'identity'],
        'bubble-light': ['identity', 'identity'],
        'ring-tension': ['identity', 'identity'],
        'clean-basin': ['identity', 'identity'],
        'balanced-root': ['identity', 'identity'],
        'nova-gentle': ['identity', 'identity'],
        'ornamental-basin': ['identity', 'identity'],
        'spiral-basin': ['identity', 'identity'],
        'dense-basin': ['identity', 'identity'],
        'halley-balanced': ['identity', 'identity'],
        'soft-wave': ['sin', 'identity'],
        'curl-light': ['cos', 'identity'],
        'balanced-drift': ['sin', 'identity'],
        'soft-branch': ['identity', 'identity'],
        'gentle-fork': ['identity', 'identity'],
        'near-neutral': ['identity', 'identity'],
        'pole-tense': ['identity', 'identity'],
        'filament-wave': ['identity', 'identity'],
        'spike-balanced': ['identity', 'identity'],
        'radial-volatile': ['identity', 'identity'],
        'tricorn-like': ['identity', 'identity'],
        'sharp-balance': ['identity', 'identity'],
        'offset-tricorn': ['identity', 'identity'],
        'imag-bias': ['identity', 'identity'],
        'real-bias': ['identity', 'identity'],
        'radiant-conjugate': ['identity', 'identity'],
        'field-tricorn': ['identity', 'identity'],
        'burning-lite': ['identity', 'identity'],
        'hard-fold': ['identity', 'identity'],
        'angular-drift': ['identity', 'identity'],
        'balanced-branch': ['identity', 'identity'],
        'hard-split': ['identity', 'identity'],
        'radial-switch': ['identity', 'identity'],
        'twisted-fold': ['identity', 'identity'],
        'geometric-mirror': ['identity', 'identity'],
        'mirror-drift': ['identity', 'identity'],
        'tense-echo': ['identity', 'identity'],
        'dark-fold': ['identity', 'identity'],
      };
      const [fn1, fn2] = slotMap[starterProfile] ?? ['identity', 'identity'];
      starterParams.u_fn1 = FN_SLOT_KEY_TO_VALUE.get(fn1) ?? 0;
      starterParams.u_fn2 = FN_SLOT_KEY_TO_VALUE.get(fn2) ?? 0;
      starterParams.u_p1 = p1;
      if (flags.includes('pixel_on')) starterParams.u_p2 = p2;
      loopExpr = `fn1(${withWrapper('z')}) + fn2(zPrev) * ${formatComplex(feedback)} + p1${pixelClause}`;
      break;
    }
    case 'memory.slot.orbit': {
      const orbitSlotMap: Record<FormulaGeneratorStarterProfile, [string, string]> = {
        'sin-conj': ['sin', 'conj'],
        'identity-sin': ['identity', 'sin'],
        'cos-flip': ['cos', 'flip'],
        'sqrt-identity': ['sqrt', 'identity'],
        'soft-echo': ['identity', 'identity'],
        'sharp-echo': ['identity', 'identity'],
        'slow-drift': ['identity', 'identity'],
        'living-wave': ['cos', 'identity'],
        'echo-soft': ['cos', 'identity'],
        'imag-flow': ['cos', 'identity'],
        'brot-like': ['identity', 'identity'],
        'julia-like': ['identity', 'identity'],
        'small-offset': ['identity', 'identity'],
        'imag-drift': ['identity', 'identity'],
        'real-drift': ['identity', 'identity'],
        'gentle-coupling': ['identity', 'identity'],
        'tilted-field': ['identity', 'identity'],
        'balanced-quotient': ['identity', 'identity'],
        'compressed-orbit': ['identity', 'identity'],
        'bubble-light': ['identity', 'identity'],
        'ring-tension': ['identity', 'identity'],
        'clean-basin': ['identity', 'identity'],
        'balanced-root': ['identity', 'identity'],
        'nova-gentle': ['identity', 'identity'],
        'ornamental-basin': ['identity', 'identity'],
        'spiral-basin': ['identity', 'identity'],
        'dense-basin': ['identity', 'identity'],
        'halley-balanced': ['identity', 'identity'],
        'soft-wave': ['sin', 'identity'],
        'curl-light': ['cos', 'identity'],
        'balanced-drift': ['sin', 'identity'],
        'soft-branch': ['identity', 'identity'],
        'gentle-fork': ['identity', 'identity'],
        'near-neutral': ['identity', 'identity'],
        'pole-tense': ['identity', 'identity'],
        'filament-wave': ['identity', 'identity'],
        'spike-balanced': ['identity', 'identity'],
        'radial-volatile': ['identity', 'identity'],
        'tricorn-like': ['identity', 'identity'],
        'sharp-balance': ['identity', 'identity'],
        'offset-tricorn': ['identity', 'identity'],
        'imag-bias': ['identity', 'identity'],
        'real-bias': ['identity', 'identity'],
        'radiant-conjugate': ['identity', 'identity'],
        'field-tricorn': ['identity', 'identity'],
        'burning-lite': ['identity', 'identity'],
        'hard-fold': ['identity', 'identity'],
        'angular-drift': ['identity', 'identity'],
        'balanced-branch': ['identity', 'identity'],
        'hard-split': ['identity', 'identity'],
        'radial-switch': ['identity', 'identity'],
        'twisted-fold': ['identity', 'identity'],
        'geometric-mirror': ['identity', 'identity'],
        'mirror-drift': ['identity', 'identity'],
        'tense-echo': ['identity', 'identity'],
        'dark-fold': ['identity', 'identity'],
      };
      const [fn1, fn2] = orbitSlotMap[starterProfile] ?? ['identity', 'identity'];
      starterParams.u_fn1 = FN_SLOT_KEY_TO_VALUE.get(fn1) ?? 0;
      starterParams.u_fn2 = FN_SLOT_KEY_TO_VALUE.get(fn2) ?? 0;
      starterParams.u_p1 = p1;
      if (flags.includes('pixel_on')) starterParams.u_p2 = p2;
      loopExpr = `fn1(flip(z)) + fn2(conj(zPrev)) * ${formatComplex(feedback)} + p1${pixelClause}`;
      break;
    }
    case 'memory.mirror.echo':
      starterParams.u_p1 = p1;
      if (flags.includes('pixel_on')) starterParams.u_p2 = p2;
      loopExpr = `sqr(conj(z)) + zPrev * ${formatComplex(feedback)} + p1${pixelClause}`;
      break;
    case 'memory.transcendental.echo':
      starterParams.u_p1 = p1;
      if (flags.includes('pixel_on')) starterParams.u_p2 = p2;
      loopExpr = `${starterProfile === 'living-wave' ? 'cos' : 'sin'}(${withWrapper('z')}) + zPrev * ${formatComplex(feedback)} + p1${pixelClause}`;
      break;
  }

  const initLine = blueprint.id === 'poly.core.quadratic' && starterProfile === 'brot-like'
    ? applyInitMode('0', initMode, [0.02, -0.01])
    : applyInitMode('pixel', initMode, [0.02, -0.01]);

  const loopBlock = blueprint.id === 'nonholo.fold.switch' ? loopExpr : `z = ${loopExpr}`;
  const source = `${name} {
init:
  z = ${initLine}
loop:
  ${loopBlock.replace(/\n/g, '\n  ')}
bailout:
  |z| < ${bailout}
}`;

  return { source, starterParams };
}

export function generateFormulaFromSeed(seed: string): GeneratedFormula {
  const bytes = parseFormulaGenerationSeed(seed);
  const family = weightedPick(bytes[0], FAMILY_WEIGHTS);
  const mechanism = weightedPick(bytes[1], MECHANISM_WEIGHTS[family]);
  const blueprintId = weightedPick(bytes[2], BLUEPRINT_WEIGHTS[mechanism]);
  const blueprint = BLUEPRINTS[blueprintId];
  const starterProfile = weightedPick(bytes[3], blueprint.starterProfiles);
  const featureBudget = inferFeatureBudget(bytes[4]);
  const requestedFeatureFlags = decodeRequestedFeatureFlags(bytes[4]);
  const appliedFeatureFlags = applyFeatureConstraints(blueprint, requestedFeatureFlags, featureBudget);
  const coefficientProfile = decodeCoefficientProfile(bytes[5]);
  const initMode = decodeInitMode(bytes[5]);
  const bailout = selectBailout(bytes[6]);
  const formulaName = selectName(bytes[6], bytes[7]);
  const { source, starterParams } = buildSource(
    formulaName,
    blueprint,
    starterProfile,
    coefficientProfile,
    initMode,
    appliedFeatureFlags,
    bailout,
    bytes[7],
  );

  return {
    seed,
    bytes,
    formulaName,
    source,
    starterParams,
    experienceHint: buildExperienceHint(family, blueprint.id),
    selection: {
      family,
      mechanism,
      blueprint: blueprint.id,
      starterProfile,
      coefficientProfile,
      initMode,
      requestedFeatureFlags,
      appliedFeatureFlags,
      featureBudget,
      bailout,
    },
  };
}

function scoreGeneratedFormulaAgainstHistory(
  generated: GeneratedFormula,
  history: FormulaGenerationHistoryEntry[],
): number {
  const recent = history.slice(0, DEFAULT_HISTORY_WINDOW);
  let score = 0;

  recent.forEach((entry, index) => {
    const ageWeight = DEFAULT_HISTORY_WINDOW - index;

    if (entry.blueprint === generated.selection.blueprint) {
      score -= 24 + ageWeight * 4;
    }

    if (entry.family === generated.selection.family) {
      score -= 8 + ageWeight * 2;
    }
  });

  if (!recent.some((entry) => entry.blueprint === generated.selection.blueprint)) {
    score += 48;
  }

  if (!recent.some((entry) => entry.family === generated.selection.family)) {
    score += 18;
  }

  if (recent[0]?.blueprint === generated.selection.blueprint) {
    score -= 36;
  }

  if (recent[0]?.family === generated.selection.family) {
    score -= 12;
  }

  return score;
}

export function selectDiversifiedGeneratedFormula(
  candidates: GeneratedFormula[],
  history: FormulaGenerationHistoryEntry[],
): GeneratedFormula {
  if (candidates.length === 0) {
    throw new Error('selectDiversifiedGeneratedFormula requires at least one candidate');
  }

  let best = candidates[0];
  let bestScore = scoreGeneratedFormulaAgainstHistory(best, history);

  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const score = scoreGeneratedFormulaAgainstHistory(candidate, history);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
      continue;
    }

    if (score === bestScore && candidate.seed < best.seed) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

export function generateDiversifiedFormula(args?: {
  history?: FormulaGenerationHistoryEntry[];
  candidateCount?: number;
  randomByte?: () => number;
}): GeneratedFormula {
  const history = args?.history ?? [];
  const candidateCount = Math.max(1, args?.candidateCount ?? DEFAULT_DIVERSIFIED_CANDIDATE_COUNT);
  const randomByte = args?.randomByte;
  const candidates: GeneratedFormula[] = [];

  for (let index = 0; index < candidateCount; index += 1) {
    const seed = createRandomFormulaGenerationSeed(randomByte);
    candidates.push(generateFormulaFromSeed(seed));
  }

  return selectDiversifiedGeneratedFormula(candidates, history);
}

export function createRandomFormulaGenerationSeed(randomByte: () => number = () => Math.floor(Math.random() * 256)): string {
  const bytes = Array.from({ length: 8 }, () => {
    const value = randomByte();
    return Math.max(0, Math.min(255, value | 0));
  });
  return createFormulaGenerationSeedFromBytes(bytes);
}

export { createFormulaGenerationSeedFromBytes, parseFormulaGenerationSeed, normalizeFormulaGenerationSeed } from './seed';
export type {
  FormulaGeneratorBlueprintId,
  FormulaGeneratorCoefficientProfile,
  FormulaGeneratorFamily,
  FormulaGeneratorFeatureFlag,
  FormulaGenerationHistoryEntry,
  FormulaGeneratorInitMode,
  FormulaGeneratorMechanism,
  FormulaGeneratorStarterProfile,
  GeneratedFormula,
} from './types';
