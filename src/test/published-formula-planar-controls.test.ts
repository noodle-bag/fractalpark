import { describe, expect, it } from 'vitest';

import type { PublishedFormulaParameterDescriptorV1 } from '@/engine/formulas/v1';
import {
  PSEUDOLAMBDA_FORMULA_ID,
  resolvePublishedFormulaPlanarControl,
} from '@/lib/published-formula-planar-controls';

function parameter(
  slotName: string,
  uniformName: string,
  type: PublishedFormulaParameterDescriptorV1['type'] = 'complex',
): PublishedFormulaParameterDescriptorV1 {
  return {
    slotName,
    uniformName,
    type,
    default: type === 'complex' ? [0, 0] : 0,
  };
}

describe('published formula planar controls', () => {
  it('qualifies only the reviewed pseudolambda complex parameters', () => {
    const rate = resolvePublishedFormulaPlanarControl(
      PSEUDOLAMBDA_FORMULA_ID,
      parameter('rate', 'frmV1_rate'),
    );
    const offset = resolvePublishedFormulaPlanarControl(
      PSEUDOLAMBDA_FORMULA_ID,
      parameter('offset', 'frmV1_offset'),
    );

    expect(rate).toEqual({
      real: { min: -2, max: 2 },
      imaginary: { min: -2, max: 2 },
      step: 0.01,
      displayPrecision: 3,
      formulaId: PSEUDOLAMBDA_FORMULA_ID,
      slotName: 'rate',
      uniformName: 'frmV1_rate',
    });
    expect(offset).toMatchObject({
      real: { min: -2, max: 2 },
      imaginary: { min: -2, max: 2 },
      step: 0.01,
    });
  });

  it('does not infer eligibility from a complex shape or a matching name alone', () => {
    expect(
      resolvePublishedFormulaPlanarControl(
        '00000000-0000-4000-8000-000000000001',
        parameter('rate', 'frmV1_rate'),
      ),
    ).toBeNull();
    expect(
      resolvePublishedFormulaPlanarControl(
        PSEUDOLAMBDA_FORMULA_ID,
        parameter('rate', 'frmV1_wrong'),
      ),
    ).toBeNull();
    expect(
      resolvePublishedFormulaPlanarControl(
        PSEUDOLAMBDA_FORMULA_ID,
        parameter('rate', 'frmV1_rate', 'real'),
      ),
    ).toBeNull();
  });
});
