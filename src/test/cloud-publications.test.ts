import { afterEach, describe, expect, it, vi } from 'vitest';

import { RIGHTS_ATTESTATION_VERSION as CLIENT_MIRROR } from '@/lib/cloud/attestation';
import {
  LICENSE_VERSION,
  publishDraft,
  RIGHTS_ATTESTATION_VERSION,
  validatePublicationText,
} from '@/lib/cloud/publications';
import { DraftServiceError } from '@/lib/cloud/drafts';

describe('publication attestation + metadata contracts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('locks the client mirror to the server attestation version', () => {
    // publications.ts is the source of truth; attestation.ts is the
    // browser mirror. A drift between them breaks publish UX at runtime.
    expect(CLIENT_MIRROR).toBe(RIGHTS_ATTESTATION_VERSION);
    expect(RIGHTS_ATTESTATION_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.v\d+$/);
    expect(LICENSE_VERSION).toBe('CC-BY-4.0');
  });

  it('rejects a stale attestation version before any network call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(
      publishDraft('owner-1', {
        draftId: 'draft-1',
        expectedRevision: 1,
        title: 't',
        description: '',
        canonicalEnvelope: { envelopeVersion: 1 },
        configBytes: 8,
        attestationVersion: '1999-01-01.v1',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' } satisfies Partial<DraftServiceError>);
    expect(fetchSpy).not.toHaveBeenCalled();
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
