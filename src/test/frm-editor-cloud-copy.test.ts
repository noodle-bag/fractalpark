import { describe, expect, it } from 'vitest';

import { formulaMutationErrorKey } from '@/lib/frm-editor';

describe('standalone Editor formula mutation messages', () => {
  it.each([
    ['conflict', 'errors.conflict'],
    ['not_found', 'errors.formulaNotFound'],
    ['compile-failed', 'errors.compileFailed'],
    ['builtin-conflict', 'errors.builtinConflict'],
    ['unavailable', 'saveError'],
    ['auth-cancelled', 'saveError'],
    ['ok', 'saveError'],
  ] as const)('maps %s to %s', (code, key) => {
    expect(formulaMutationErrorKey(code)).toBe(key);
  });
});
