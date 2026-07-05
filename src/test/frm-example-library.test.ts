import { describe, it, expect } from 'vitest';
import { compileFrm } from '@/engine/frm/compile';
import { CUSTOM_FORMULA_EXAMPLES } from '@/engine/frm/example-library';

describe('FRM example library', () => {
  it('compiles every curated Phase 3 example', () => {
    for (const example of CUSTOM_FORMULA_EXAMPLES) {
      const result = compileFrm(example.source, `example-${example.id}`);
      expect(result.success, example.id).toBe(true);
      expect(result.plugin?.id).toBe(`example-${example.id}`);
    }
  });
});
