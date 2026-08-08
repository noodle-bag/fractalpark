import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/creation/drafts/[draftId]/publish/route';
import { DraftServiceError, getDraft } from '@/lib/cloud/drafts';
import { validateCloudEnvelopeV1 } from '@/lib/cloud/envelope';
import { validateFormulaPublication } from '@/lib/cloud/formula-publish';
import {
  FORMULA_SOURCE_ATTESTATION_VERSION,
  findPublishReplay,
  publishDraft,
} from '@/lib/cloud/publications';
import { runArtworkBackup } from '@/lib/cloud/backup';
import { resolveRequestSession } from '@/lib/cloud/request-session';

vi.mock('@/lib/cloud/drafts', () => ({
  DraftServiceError: class DraftServiceError extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  },
  getDraft: vi.fn(),
}));

vi.mock('@/lib/cloud/envelope', () => ({
  validateCloudEnvelopeV1: vi.fn(),
}));

vi.mock('@/lib/cloud/formula-publish', () => ({
  validateFormulaPublication: vi.fn(),
}));

vi.mock('@/lib/cloud/publications', () => ({
  FORMULA_SOURCE_ATTESTATION_VERSION: '2026-08-08.v1',
  findPublishReplay: vi.fn(),
  publishDraft: vi.fn(),
}));

vi.mock('@/lib/cloud/backup', () => ({
  runArtworkBackup: vi.fn(),
}));

vi.mock('@/lib/cloud/request-session', () => ({
  resolveRequestSession: vi.fn(),
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const DRAFT_ID = '22222222-2222-4222-8222-222222222222';
const KEY = '33333333-3333-4333-8333-333333333333';
const PUBLICATION_ID = '44444444-4444-4444-8444-444444444444';

function request(
  body: Record<string, unknown> = {
    expectedRevision: 1,
    title: 'Formula work',
    description: '',
    attestationVersion: '2026-08-02.v1',
  },
  key = KEY,
): Request {
  return new Request(`https://fractalpark.test/api/creation/drafts/${DRAFT_ID}/publish`, {
    method: 'POST',
    headers: {
      host: 'fractalpark.test',
      origin: 'https://fractalpark.test',
      'content-type': 'application/json',
      'idempotency-key': key,
    },
    body: JSON.stringify(body),
  });
}

function context(draftId = DRAFT_ID): { params: Promise<{ draftId: string }> } {
  return { params: Promise.resolve({ draftId }) };
}

describe('publish draft route', () => {
  beforeEach(() => {
    vi.stubEnv('FRACTALPARK_CREATION_CLOUD_ENABLED', 'true');
    vi.mocked(resolveRequestSession).mockResolvedValue({
      session: {
        userId: USER_ID,
        email: 'owner@example.com',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 60_000,
      },
      rotatedSetCookie: undefined,
    });
    vi.mocked(getDraft).mockResolvedValue({ envelope: { envelopeVersion: 1 } } as never);
    vi.mocked(validateCloudEnvelopeV1).mockReturnValue({
      ok: true,
      value: {
        canonicalJson: JSON.stringify({ envelopeVersion: 1 }),
        configBytes: 21,
        hasPortableFormulas: false,
      },
    } as never);
    vi.mocked(validateFormulaPublication).mockReturnValue({ ok: true, formulaName: 'RouteFormula' } as never);
    vi.mocked(publishDraft).mockResolvedValue({
      replayed: false,
      publicationId: PUBLICATION_ID,
      status: 'published',
    } as never);
    vi.mocked(runArtworkBackup).mockResolvedValue('not_requested' as never);
    vi.mocked(findPublishReplay).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  it('rejects malformed draft and idempotency UUIDs before any draft lookup', async () => {
    const badDraft = await POST(request(), context('not-a-uuid'));
    expect(badDraft.status).toBe(400);
    await expect(badDraft.json()).resolves.toMatchObject({
      error: { code: 'validation_failed' },
    });

    const badKey = await POST(request(undefined, 'not-a-uuid'), context());
    expect(badKey.status).toBe(400);
    await expect(badKey.json()).resolves.toMatchObject({
      error: { code: 'validation_failed' },
    });
    expect(getDraft).not.toHaveBeenCalled();
    expect(publishDraft).not.toHaveBeenCalled();
  });

  it('requires the independent formula-source attestation at the route seam', async () => {
    vi.mocked(validateCloudEnvelopeV1).mockReturnValue({
      ok: true,
      value: {
        canonicalJson: JSON.stringify({ envelopeVersion: 1, assets: { formulas: [{}] } }),
        configBytes: 48,
        hasPortableFormulas: true,
      },
    } as never);

    const response = await POST(request(), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'validation_failed' },
    });
    expect(validateFormulaPublication).toHaveBeenCalledOnce();
    expect(publishDraft).not.toHaveBeenCalled();
  });

  it('forwards the independently attested formula publication to the service', async () => {
    vi.mocked(validateCloudEnvelopeV1).mockReturnValue({
      ok: true,
      value: {
        canonicalJson: JSON.stringify({ envelopeVersion: 1, assets: { formulas: [{}] } }),
        configBytes: 48,
        hasPortableFormulas: true,
      },
    } as never);

    const response = await POST(
      request({
        expectedRevision: 1,
        title: 'Formula work',
        description: '',
        attestationVersion: '2026-08-02.v1',
        formulaSourceAttestationVersion: FORMULA_SOURCE_ATTESTATION_VERSION,
      }),
      context(),
    );

    expect(response.status).toBe(201);
    expect(publishDraft).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        draftId: DRAFT_ID,
        idempotencyKey: KEY,
        formulaSourceAttestationVersion: FORMULA_SOURCE_ATTESTATION_VERSION,
      }),
    );
  });

  it('returns an operation replay after draft deletion without republishing or sending backup email', async () => {
    vi.mocked(getDraft).mockRejectedValue(new DraftServiceError('not_found'));
    vi.mocked(findPublishReplay).mockResolvedValue({
      replayed: true,
      publicationId: PUBLICATION_ID,
      status: 'published',
      title: 'Formula work',
      thumbnailStatus: 'pending',
      publishedAt: '2026-08-08T00:00:00.000Z',
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(201);
    expect(findPublishReplay).toHaveBeenCalledOnce();
    expect(getDraft).toHaveBeenCalledOnce();
    expect(publishDraft).not.toHaveBeenCalled();
    expect(runArtworkBackup).not.toHaveBeenCalled();
  });
});
