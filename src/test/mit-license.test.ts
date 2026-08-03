import { describe, expect, it } from 'vitest';

import { MIT_LICENSE_TEXT, MIT_LICENSE_URL } from '@/lib/mit-license';

describe('MIT license text (spec §17.2)', () => {
  it('is frozen verbatim — changing it is a legal event', () => {
    expect(MIT_LICENSE_URL).toBe('https://opensource.org/licenses/MIT');
    expect(MIT_LICENSE_TEXT).toContain('MIT License');
    expect(MIT_LICENSE_TEXT).toContain('Permission is hereby granted, free of charge');
    expect(MIT_LICENSE_TEXT).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
    expect(MIT_LICENSE_TEXT.split('\n')).toHaveLength(19);
  });
});
