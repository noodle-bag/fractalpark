import { describe, expect, it } from 'vitest';
import { collectEditorErrors } from '@/engine/frm/codemirror-lint';

describe('FRM CodeMirror lint integration', () => {
  it('surfaces compatibility notes in real-time diagnostics', () => {
    const errors = collectEditorErrors(`CompatInfo {
loop:
  z = fn1(z) + ismand
bailout:
  |z| < 4
}`);

    const infoMessages = errors
      .filter((error) => error.severity === 'info')
      .map((error) => error.message);

    expect(infoMessages.some((message) => message.includes('ismand'))).toBe(true);
    expect(infoMessages.some((message) => message.includes('fn slot'))).toBe(true);
  });
});
