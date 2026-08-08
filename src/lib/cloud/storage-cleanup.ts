/**
 * Normalize the two "already gone" response shapes observed from Supabase
 * Storage single-object DELETE. Every other response remains a real failure.
 */
export async function isStorageObjectAlreadyMissing(response: Response): Promise<boolean> {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;

  const payload = (await response.json().catch(() => null)) as {
    statusCode?: unknown;
    error?: unknown;
  } | null;
  return (
    (payload?.statusCode === 404 || payload?.statusCode === '404') &&
    payload.error === 'not_found'
  );
}
