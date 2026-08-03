/**
 * Cleanup worker (spec sections 4.6, 10.2): drains resource_cleanup_jobs.
 *
 * - draft_thumbnail / publication_thumbnail: delete the storage object; an
 *   already-missing object counts as success.
 * - auth_user: runs only after every other job of that owner converged
 *   (storage first); physically removes the auth user, then finalizes the
 *   delete_account operation (close + purge older operations, keep the
 *   audit row).
 *
 * Failures are reported with a stable error code; the complete RPC applies
 * bounded exponential backoff, and exhausted retries surface as failed
 * jobs for the maintainer. Cleanup failure never restores access — access
 * was already revoked at confirm time.
 *
 * Usage: npm run cleanup:worker            (local stack, one pass)
 *        node --import tsx scripts/cleanup-worker.ts --limit=25
 */

export {};

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY must be set (use the local stack service key)');
  process.exit(1);
}

interface CleanupJob {
  id: string;
  operation_id: string | null;
  owner_id: string | null;
  resource_type: 'draft_thumbnail' | 'publication_thumbnail' | 'auth_user';
  resource_key: string;
  attempts: number;
}

const BUCKET_BY_TYPE: Record<string, string> = {
  draft_thumbnail: 'draft-thumbnails',
  publication_thumbnail: 'publication-thumbnails',
};

function serviceHeaders(): Record<string, string> {
  return { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` };
}

async function rpc(fn: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...serviceHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`${fn} failed: ${response.status} ${(await response.text()).slice(0, 160)}`);
  }
  const text = await response.text();
  return text === '' ? null : JSON.parse(text);
}

async function deleteStorageObject(bucket: string, path: string): Promise<void> {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'DELETE',
    headers: serviceHeaders(),
    cache: 'no-store',
  });
  // 404 = already missing = success (spec 4.6).
  if (!response.ok && response.status !== 404) {
    throw new Error(`storage delete ${response.status}`);
  }
}

async function deleteAuthUser(userId: string): Promise<void> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: serviceHeaders(),
    cache: 'no-store',
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`auth user delete ${response.status}`);
  }
}

async function ownerJobsConverged(ownerId: string, exceptJobId: string): Promise<boolean> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/resource_cleanup_jobs?owner_id=eq.${ownerId}` +
      `&status=in.(pending,processing)&id=neq.${exceptJobId}&select=id&limit=1`,
    { headers: serviceHeaders(), cache: 'no-store' },
  );
  const open = (await response.json()) as Array<{ id: string }>;
  return open.length === 0;
}

async function processJob(job: CleanupJob): Promise<{ ok: boolean; errorCode?: string }> {
  try {
    if (job.resource_type === 'auth_user') {
      if (!job.owner_id) return { ok: true }; // owner already nulled: nothing to remove
      if (!(await ownerJobsConverged(job.owner_id, job.id))) {
        return { ok: false, errorCode: 'waiting_for_storage_cleanup' };
      }
      // Bookkeeping first while owner_id still matches (finalize validates
      // it), then the physical removal; FK nulls the audit row's owner.
      if (job.operation_id) {
        await rpc('fractalpark_account_deletion_finalize', {
          p_owner_id: job.owner_id,
          p_operation_id: job.operation_id,
        });
      }
      await deleteAuthUser(job.owner_id);
      return { ok: true };
    }
    const bucket = BUCKET_BY_TYPE[job.resource_type];
    if (!bucket) return { ok: false, errorCode: 'unknown_resource_type' };
    await deleteStorageObject(bucket, job.resource_key);
    return { ok: true };
  } catch (error) {
    return { ok: false, errorCode: error instanceof Error ? error.message.slice(0, 64) : 'unknown' };
  }
}

async function main(): Promise<void> {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.slice('--limit='.length)) || 10 : 10;
  let processed = 0;

  for (;;) {
    const jobs = (await rpc('fractalpark_claim_cleanup_jobs', { p_limit: limit })) as CleanupJob[];
    if (jobs.length === 0) break;
    for (const job of jobs) {
      const outcome = await processJob(job);
      await rpc('fractalpark_complete_cleanup_job', {
        p_job_id: job.id,
        p_success: outcome.ok,
        p_error_code: outcome.errorCode ?? null,
      });
      processed += 1;
      console.log(
        `${outcome.ok ? 'ok' : 'retry'}  ${job.resource_type} ${job.resource_key}${outcome.errorCode ? ` (${outcome.errorCode})` : ''}`,
      );
    }
  }
  console.log(`cleanup worker: ${processed} job(s) processed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
