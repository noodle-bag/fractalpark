import { describe, expect, it } from 'vitest';
import { splitProseParagraphs } from '@/lib/content-text';

describe('splitProseParagraphs', () => {
  it('splits localized prose on blank lines', () => {
    expect(
      splitProseParagraphs(
        'First paragraph.\n\nSecond paragraph.\n\n\nThird paragraph.'
      )
    ).toEqual([
      'First paragraph.',
      'Second paragraph.',
      'Third paragraph.',
    ]);
  });

  it('normalizes wrapped lines without creating extra paragraphs', () => {
    expect(
      splitProseParagraphs(
        'A wrapped\nline stays together.\r\n\r\n  Second locale paragraph.  '
      )
    ).toEqual([
      'A wrapped line stays together.',
      'Second locale paragraph.',
    ]);
  });
});
