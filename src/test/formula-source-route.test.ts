import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_FRACTAL_DOCUMENT } from '@/engine/document';
import { createFractalDocumentEnvelope } from '@/lib/fractal-file';
import { getCommunityPublication } from '@/lib/cloud/community';
import { GET } from '@/app/api/creation/publications/[publicationId]/formula-source/route';

vi.mock('@/lib/cloud/community', () => ({
  getCommunityPublication: vi.fn(),
}));

const PUBLICATION_ID = '11111111-2222-4333-8444-555555555555';
const VALID_FRM = `TestCustom {
init:
  z = 0
loop:
  z = z^2 + c
bailout:
  |z| < 4
}`;

async function formulaEnvelope() {
  const document = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
  document.formula.formulaId = 'my-custom-test';
  const result = await createFractalDocumentEnvelope(document, [
    { id: 'my-custom-test', name: 'Test Custom', source: VALID_FRM },
  ]);
  if (!result.success) throw new Error('fixture envelope failed');
  return result.value;
}

function context(publicationId = PUBLICATION_ID) {
  return { params: Promise.resolve({ publicationId }) };
}

async function publishedFormula() {
  return {
    id: PUBLICATION_ID,
    title: 'Formula work',
    description: null,
    authorDisplayName: 'Author',
    license: 'CC-BY-4.0',
    licenseScope: 'artwork_image',
    formulaLicense: 'MIT',
    formulaLicenseScope: 'formula_source',
    formulaSourceAttestationVersion: '2026-08-08.v1',
    thumbnailStatus: 'pending',
    remixSource: null,
    publishedAt: '2026-08-08T12:00:00.000Z',
    envelope: await formulaEnvelope(),
  };
}

describe('formula publication source route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('downloads the frozen source when the independent MIT snapshot is present', async () => {
    vi.mocked(getCommunityPublication).mockResolvedValue({
      id: PUBLICATION_ID,
      title: 'Formula work',
      description: null,
      authorDisplayName: 'Author',
      license: 'CC-BY-4.0',
      licenseScope: 'artwork_image',
      formulaLicense: 'MIT',
      formulaLicenseScope: 'formula_source',
      formulaSourceAttestationVersion: '2026-08-08.v1',
      thumbnailStatus: 'pending',
      remixSource: null,
      publishedAt: '2026-08-08T12:00:00.000Z',
      envelope: await formulaEnvelope(),
    });

    const response = await GET(
      new Request(`https://fractalpark.test/api/creation/publications/${PUBLICATION_ID}/formula-source`),
      { params: Promise.resolve({ publicationId: PUBLICATION_ID }) },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(VALID_FRM);
    expect(response.headers.get('content-disposition')).toContain('TestCustom.frm');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('hides malformed publication ids as missing resources before querying', async () => {
    const response = await GET(
      new Request('https://example.test/api/creation/publications/not-a-uuid/formula-source'),
      context('not-a-uuid'),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'not_found' },
    });
    expect(getCommunityPublication).not.toHaveBeenCalled();
  });

  it('rejects a formula-source tuple carrying an unrecognized attestation version', async () => {
    vi.mocked(getCommunityPublication).mockResolvedValue({
      ...(await publishedFormula()),
      formulaSourceAttestationVersion: '2099-01-01.v1',
    } as never);

    const response = await GET(new Request('https://example.test/formula-source'), context());

    expect(response.status).toBe(404);
  });

  it('returns not_found when a formula envelope lacks the legal snapshot', async () => {
    vi.mocked(getCommunityPublication).mockResolvedValue({
      id: PUBLICATION_ID,
      title: 'Legacy formula work',
      description: null,
      authorDisplayName: 'Author',
      license: 'CC-BY-4.0',
      licenseScope: 'artwork_image',
      formulaLicense: null,
      formulaLicenseScope: null,
      formulaSourceAttestationVersion: null,
      thumbnailStatus: 'pending',
      remixSource: null,
      publishedAt: '2026-08-08T12:00:00.000Z',
      envelope: await formulaEnvelope(),
    });

    const response = await GET(
      new Request(`https://fractalpark.test/api/creation/publications/${PUBLICATION_ID}/formula-source`),
      { params: Promise.resolve({ publicationId: PUBLICATION_ID }) },
    );

    expect(response.status).toBe(404);
  });
});
