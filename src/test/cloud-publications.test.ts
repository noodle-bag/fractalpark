import { describe, expect, it } from 'vitest';

import { RIGHTS_ATTESTATION_VERSION } from '@/lib/cloud/attestation';
import {
  LICENSE_VERSION,
  RIGHTS_ATTESTATION_VERSION as SERVER_VERSION,
  validatePublicationText,
} from '@/lib/cloud/publications';

describe('publication attestation + metadata contracts', () => {
  it('client and server share one attestation version', () => {
    expect(SERVER_VERSION).toBe(RIGHTS_ATTESTATION_VERSION);
    expect(RIGHTS_ATTESTATION_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.v\d+$/);
    expect(LICENSE_VERSION).toBe('CC-BY-4.0');
  });

  it('accepts ordinary bilingual metadata', () => {
    expect(validatePublicationText('Nebula Study', '')).toBe(true);
    expect(validatePublicationText('星云草稿 07', '一次安静的迭代。')).toBe(true);
    expect(validatePublicationText('  padded  ', 'x'.repeat(500))).toBe(true);
  });

  it('rejects empty/overlong titles and overlong descriptions', () => {
    expect(validatePublicationText('', '')).toBe(false);
    expect(validatePublicationText('   ', '')).toBe(false);
    expect(validatePublicationText('x'.repeat(81), '')).toBe(false);
    expect(validatePublicationText('ok', 'x'.repeat(501))).toBe(false);
  });

  it('rejects control characters and bidi overrides in public metadata', () => {
    expect(validatePublicationText('bad\ntitle', '')).toBe(false);
    expect(validatePublicationText('ok', 'has\ttab')).toBe(false);
    expect(validatePublicationText('spoof\u202efty', '')).toBe(false);
    expect(validatePublicationText('ok', 'zero\u200bwidth'.replace('\u200b', ''))).toBe(true);
  });
});
