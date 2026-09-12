import type { PublishedFormulaParameterDescriptorV1 } from '@/engine/formulas/v1';

export interface PlanarParameterAxis {
  min: number;
  max: number;
}

export interface PublishedFormulaPlanarControl {
  real: PlanarParameterAxis;
  imaginary: PlanarParameterAxis;
  step: number;
  displayPrecision: number;
}

interface PublishedFormulaPlanarControlRow extends PublishedFormulaPlanarControl {
  formulaId: string;
  slotName: string;
  uniformName: string;
}

export const PSEUDOLAMBDA_FORMULA_ID = '9e7250d0-f815-521a-9cf6-6c4d68598b2c';

const PSEUDOLAMBDA_PLANE = {
  real: { min: -2, max: 2 },
  imaginary: { min: -2, max: 2 },
  step: 0.01,
  displayPrecision: 3,
} as const;

const PUBLISHED_FORMULA_PLANAR_CONTROLS: readonly PublishedFormulaPlanarControlRow[] = [
  {
    formulaId: PSEUDOLAMBDA_FORMULA_ID,
    slotName: 'rate',
    uniformName: 'frmV1_rate',
    ...PSEUDOLAMBDA_PLANE,
  },
  {
    formulaId: PSEUDOLAMBDA_FORMULA_ID,
    slotName: 'offset',
    uniformName: 'frmV1_offset',
    ...PSEUDOLAMBDA_PLANE,
  },
];

/**
 * Resolves an explicitly reviewed planar interaction without changing the
 * formula's mathematical domain or its published descriptor.
 */
export function resolvePublishedFormulaPlanarControl(
  formulaId: string,
  parameter: PublishedFormulaParameterDescriptorV1,
): PublishedFormulaPlanarControl | null {
  if (parameter.type !== 'complex') return null;

  return PUBLISHED_FORMULA_PLANAR_CONTROLS.find(
    (candidate) =>
      candidate.formulaId === formulaId &&
      candidate.slotName === parameter.slotName &&
      candidate.uniformName === parameter.uniformName,
  ) ?? null;
}
