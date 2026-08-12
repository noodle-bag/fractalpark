import { describe, expect, it } from 'vitest';

import { compareFrmSemantics } from '@/lib/frm-semantics-comparison';

const COMPATIBLE_SOURCE = `CompareCompatible {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  4 < |z|
}`;

const LEGACY_ONLY_SOURCE = `CompareLegacyOnly {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  tanh(|z|) < p1
}`;

describe('compareFrmSemantics', () => {
  it('compiles the exact bytes through both frozen contracts and matching renderer pipelines', () => {
    const comparison = compareFrmSemantics({
      formulaId: 'compare-compatible',
      source: COMPATIBLE_SOURCE,
    });

    expect(comparison.v1.result.success).toBe(true);
    expect(comparison.v1.result.frmSemanticsVersion).toBe(1);
    expect(comparison.v1.result.bailoutDescriptor).toBeUndefined();
    expect(comparison.v1.previewParams?.pipelineVersion).toBe(1);

    expect(comparison.v2.result.success).toBe(true);
    expect(comparison.v2.result.frmSemanticsVersion).toBe(2);
    expect(comparison.v2.result.bailoutDescriptor).toEqual({
      kind: 'C1',
      op: '>',
      magnitude: 'z',
      threshold: 4,
    });
    expect(comparison.v2.previewParams?.pipelineVersion).toBe(2);
  });

  it('keeps the legacy preview while failing strict v2 closed with diagnostics', () => {
    const comparison = compareFrmSemantics({
      formulaId: 'compare-legacy-only',
      source: LEGACY_ONLY_SOURCE,
    });

    expect(comparison.v1.result.success).toBe(true);
    expect(comparison.v1.result.plugin?.bailout).toBe(4);
    expect(comparison.v1.previewParams).toBeDefined();

    expect(comparison.v2.result.success).toBe(false);
    expect(comparison.v2.result.errors.join('\n')).toContain(
      'unknown-magnitude-form',
    );
    expect(comparison.v2.result.plugin).toBeUndefined();
    expect(comparison.v2.previewParams).toBeUndefined();
  });
});
