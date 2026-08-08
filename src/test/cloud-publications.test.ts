import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FORMULA_SOURCE_ATTESTATION_VERSION as CLIENT_FORMULA_ATTESTATION,
  RIGHTS_ATTESTATION_VERSION as CLIENT_MIRROR,
} from '@/lib/cloud/attestation';
import {
  FORMULA_SOURCE_ATTESTATION_VERSION,
  LICENSE_VERSION,
  findPublishReplay,
  publishDraft,
  RIGHTS_ATTESTATION_VERSION,
  validatePublicationText,
} from '@/lib/cloud/publications';
import { DraftServiceError } from '@/lib/cloud/drafts';
import { canonicalStringify } from '@/lib/cloud/envelope';

describe('publication attestation + metadata contracts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('locks the client mirror to the server attestation version', () => {
    // publications.ts is the source of truth; attestation.ts is the
    // browser mirror. A drift between them breaks publish UX at runtime.
    expect(CLIENT_MIRROR).toBe(RIGHTS_ATTESTATION_VERSION);
    expect(CLIENT_FORMULA_ATTESTATION).toBe(FORMULA_SOURCE_ATTESTATION_VERSION);
    expect(RIGHTS_ATTESTATION_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.v\d+$/);
    expect(LICENSE_VERSION).toBe('CC-BY-4.0');
  });

  it('keeps the rendered image on CC BY and sends formula attestation separately', async () => {
    vi.stubEnv('FRACTALPARK_CREATION_CLOUD_ENABLED', 'true');
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'publishable-test-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-key');
    const fetchSpy = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () =>
      new Response(
        JSON.stringify({
          publication_id: '22222222-2222-4222-8222-222222222222',
          status: 'published',
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchSpy);

    await publishDraft('11111111-1111-4111-8111-111111111111', {
      draftId: '33333333-3333-4333-8333-333333333333',
      expectedRevision: 1,
      title: 'Formula work',
      description: '',
      canonicalEnvelope: { envelopeVersion: 1 },
      configBytes: 8,
      attestationVersion: RIGHTS_ATTESTATION_VERSION,
      formulaSourceAttestationVersion: FORMULA_SOURCE_ATTESTATION_VERSION,
      idempotencyKey: '44444444-4444-4444-8444-444444444444',
    });

    const requestInit = fetchSpy.mock.calls[0]?.[1];
    const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
    expect(body.p_license_version).toBe('CC-BY-4.0');
    expect(body.p_formula_source_attestation_version).toBe(
      FORMULA_SOURCE_ATTESTATION_VERSION,
    );
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

  it('reconstructs formula publication replays with the frozen attestation tuple', async () => {
    vi.stubEnv('FRACTALPARK_CREATION_CLOUD_ENABLED', 'true');
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'publishable-test-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-key');
    const publicationId = '22222222-2222-4222-8222-222222222222';
    const envelope = { envelopeVersion: 1, document: { metadata: { name: 'Formula replay' } } };
    const hashInputs = {
      draftId: '33333333-3333-4333-8333-333333333333',
      expectedRevision: 2,
      title: '  Formula replay  ',
      description: '  frozen source  ',
      attestationVersion: RIGHTS_ATTESTATION_VERSION,
      formulaSourceAttestationVersion: FORMULA_SOURCE_ATTESTATION_VERSION,
    };
    const requestHash = createHash('sha256')
      .update(
        canonicalStringify({
          draftId: hashInputs.draftId,
          expectedRevision: hashInputs.expectedRevision,
          title: hashInputs.title.trim(),
          description: hashInputs.description.trim(),
          envelope,
          attestationVersion: hashInputs.attestationVersion,
          formulaSourceAttestationVersion: hashInputs.formulaSourceAttestationVersion,
        }),
      )
      .digest('hex');
    const fetchSpy = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        Response.json([{ publication_id: publicationId, request_hash: requestHash }]),
      )
      .mockResolvedValueOnce(
        Response.json([
          {
            envelope,
            status: 'published',
            title: 'Formula replay',
            published_at: '2026-08-08T00:00:00.000Z',
            formula_source_attestation_version: FORMULA_SOURCE_ATTESTATION_VERSION,
          },
        ]),
      );
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      findPublishReplay(
        '11111111-1111-4111-8111-111111111111',
        '44444444-4444-4444-8444-444444444444',
        hashInputs,
      ),
    ).resolves.toMatchObject({ publicationId, replayed: true });

    vi.stubGlobal(
      'fetch',
      vi
        .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
        .mockResolvedValueOnce(
          Response.json([{ publication_id: publicationId, request_hash: requestHash }]),
        )
        .mockResolvedValueOnce(
          Response.json([
            {
              envelope,
              status: 'published',
              title: 'Formula replay',
              published_at: '2026-08-08T00:00:00.000Z',
              formula_source_attestation_version: FORMULA_SOURCE_ATTESTATION_VERSION,
            },
          ]),
        ),
    );
    await expect(
      findPublishReplay(
        '11111111-1111-4111-8111-111111111111',
        '44444444-4444-4444-8444-444444444444',
        { ...hashInputs, formulaSourceAttestationVersion: '2026-08-07.v1' },
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
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
    expect(validatePublicationText('ok', 'line one\nline two')).toBe(true);
    expect(validatePublicationText('spoof\u202efty', '')).toBe(false);
    expect(validatePublicationText('ok', 'zero\u200bwidth')).toBe(false);
  });
});
