import type { FormulaExperienceHint } from '../authoring';
import type { PluginParamRecord } from '../../types';

export type FormulaGeneratorFamily =
  | 'Polynomial'
  | 'Rational'
  | 'Root-Finding'
  | 'Transcendental Entire'
  | 'Transcendental Meromorphic'
  | 'Anti-Holomorphic'
  | 'Non-Holomorphic / Piecewise'
  | 'Memory / Recurrence';

export type FormulaGeneratorMechanism =
  | 'core-iteration'
  | 'parameter-shift'
  | 'pixel-coupling-light'
  | 'quotient-core'
  | 'rational-shift'
  | 'singular-perturbation-light'
  | 'newton-step'
  | 'nova-perturbation-light'
  | 'halley-like-step'
  | 'transcendental-core'
  | 'transcendental-shift'
  | 'gentle-entire-variation'
  | 'pole-driven-core'
  | 'meromorphic-shift'
  | 'reciprocal-meromorphic-core'
  | 'conjugate-core'
  | 'conjugate-shift'
  | 'conjugate-pixel-coupled'
  | 'abs-core'
  | 'fold-core'
  | 'piecewise-switch'
  | 'feedback'
  | 'echo'
  | 'slot-driven-memory';

export type FormulaGeneratorBlueprintId =
  | 'poly.core.quadratic'
  | 'poly.core.shifted'
  | 'poly.core.affine-shift'
  | 'poly.core.pixel-coupled'
  | 'poly.core.pixel-orbit'
  | 'rat.quotient.core'
  | 'rat.inversion.quadratic'
  | 'rat.rings.perturb'
  | 'rat.mcmullen.light'
  | 'hybrid.spider.recip'
  | 'rat.singular.perturb.light'
  | 'root.newton.poly'
  | 'root.nova.shifted'
  | 'root.halley.poly'
  | 'trans.sin.drift'
  | 'trans.sqrt.core'
  | 'trans.wave.fold'
  | 'trans.rot.swirl'
  | 'mero.tan.core'
  | 'mero.coth.shift'
  | 'anti.conj.core'
  | 'anti.conj.shift'
  | 'anti.conj.affine'
  | 'anti.conj.reciprocal'
  | 'anti.conj.pixel'
  | 'nonholo.abs.core'
  | 'nonholo.abs.reciprocal'
  | 'nonholo.fold.switch'
  | 'nonholo.flip.abs'
  | 'memory.echo.quadratic'
  | 'memory.echo.shifted'
  | 'memory.echo.inversion'
  | 'memory.slot.weave'
  | 'memory.slot.orbit'
  | 'memory.mirror.echo'
  | 'memory.transcendental.echo';

export type FormulaGeneratorStarterProfile =
  | 'brot-like'
  | 'julia-like'
  | 'small-offset'
  | 'imag-drift'
  | 'real-drift'
  | 'gentle-coupling'
  | 'tilted-field'
  | 'balanced-quotient'
  | 'compressed-orbit'
  | 'bubble-light'
  | 'ring-tension'
  | 'clean-basin'
  | 'balanced-root'
  | 'nova-gentle'
  | 'ornamental-basin'
  | 'spiral-basin'
  | 'dense-basin'
  | 'halley-balanced'
  | 'soft-wave'
  | 'curl-light'
  | 'balanced-drift'
  | 'soft-branch'
  | 'gentle-fork'
  | 'near-neutral'
  | 'pole-tense'
  | 'filament-wave'
  | 'spike-balanced'
  | 'radial-volatile'
  | 'tricorn-like'
  | 'sharp-balance'
  | 'offset-tricorn'
  | 'imag-bias'
  | 'real-bias'
  | 'radiant-conjugate'
  | 'field-tricorn'
  | 'burning-lite'
  | 'hard-fold'
  | 'angular-drift'
  | 'balanced-branch'
  | 'hard-split'
  | 'radial-switch'
  | 'twisted-fold'
  | 'geometric-mirror'
  | 'soft-echo'
  | 'sharp-echo'
  | 'slow-drift'
  | 'sin-conj'
  | 'identity-sin'
  | 'cos-flip'
  | 'sqrt-identity'
  | 'mirror-drift'
  | 'tense-echo'
  | 'dark-fold'
  | 'living-wave'
  | 'echo-soft'
  | 'imag-flow';

export type FormulaGeneratorFeatureFlag =
  | 'pixel_on'
  | 'p2_on'
  | 'wrapper_flip_on'
  | 'wrapper_conj_on'
  | 'secondary_offset_on';

export type FormulaGeneratorCoefficientProfile = 'gentle' | 'balanced' | 'tense' | 'wild-lite';
export type FormulaGeneratorInitMode = 'z0' | 'pixel' | 'pixel-light-offset' | 'z0-light-offset';

export interface FormulaGenerationDecodedSelection {
  family: FormulaGeneratorFamily;
  mechanism: FormulaGeneratorMechanism;
  blueprint: FormulaGeneratorBlueprintId;
  starterProfile: FormulaGeneratorStarterProfile;
  coefficientProfile: FormulaGeneratorCoefficientProfile;
  initMode: FormulaGeneratorInitMode;
  requestedFeatureFlags: FormulaGeneratorFeatureFlag[];
  appliedFeatureFlags: FormulaGeneratorFeatureFlag[];
  featureBudget: number;
  bailout: number;
}

export interface GeneratedFormula {
  seed: string;
  bytes: number[];
  formulaName: string;
  source: string;
  starterParams: PluginParamRecord;
  experienceHint?: FormulaExperienceHint;
  selection: FormulaGenerationDecodedSelection;
}

export interface FormulaGenerationHistoryEntry {
  seed: string;
  family: FormulaGeneratorFamily;
  blueprint: FormulaGeneratorBlueprintId;
}
