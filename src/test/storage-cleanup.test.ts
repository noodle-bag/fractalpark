import { describe, expect, it } from 'vitest';

import { isStorageObjectAlreadyMissing } from '@/lib/cloud/storage-cleanup';

describe('isStorageObjectAlreadyMissing', () => {
  it('accepts native HTTP 404 and the exact Supabase 400/not_found wrapper', async () => {
    await expect(isStorageObjectAlreadyMissing(new Response('', { status: 404 }))).resolves.toBe(true);
    await expect(
      isStorageObjectAlreadyMissing(
        Response.json({ statusCode: 404, error: 'not_found' }, { status: 400 }),
      ),
    ).resolves.toBe(true);
    await expect(
      isStorageObjectAlreadyMissing(
        Response.json({ statusCode: '404', error: 'not_found' }, { status: 400 }),
      ),
    ).resolves.toBe(true);
  });

  it('keeps every other 400 and non-404 response as a real failure', async () => {
    await expect(
      isStorageObjectAlreadyMissing(
        Response.json({ statusCode: 404, error: 'bad_request' }, { status: 400 }),
      ),
    ).resolves.toBe(false);
    await expect(
      isStorageObjectAlreadyMissing(new Response('not json', { status: 400 })),
    ).resolves.toBe(false);
    await expect(
      isStorageObjectAlreadyMissing(new Response('', { status: 401 })),
    ).resolves.toBe(false);
  });
});
