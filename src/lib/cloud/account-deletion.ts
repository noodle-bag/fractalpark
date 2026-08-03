/**
 * Secure account deletion (spec sections 2, 4.4, 10.2).
 *
 * Flow: fresh OTP (step-up) -> proof operation row (single-use, 10-minute
 * window, scoped to delete_account) -> explicit second confirmation ->
 * confirm RPC locks the operation (ordinary RPCs start rejecting
 * immediately), deletes private facts, withdraws publications, and
 * registers cleanup jobs in one transaction -> all sessions revoked ->
 * storage cleanup converges via jobs -> the auth user is physically
 * removed last by the cleanup worker.
 */

import { postgrest, getAccountEmail, hasActiveDeletion } from './postgrest';
import { consumeRateLimit } from './rate-limit';
import { AuthProviderError, requestEmailOtp, verifyEmailOtp } from './supabase-auth';

export class AccountDeletionError extends Error {
  constructor(
    readonly code:
      | 'account_deleting'
      | 'step_up_expired'
      | 'not_found'
      | 'validation_failed'
      | 'rate_limited'
      | 'unavailable',
    message?: string,
  ) {
    super(message ?? code);
  }
}

interface RpcErrorBody {
  message?: string;
}

function mapRpcError(raw: string): AccountDeletionError {
  const prefix = raw.split(':', 1)[0];
  switch (prefix) {
    case 'account_deleting':
      return new AccountDeletionError('account_deleting');
    case 'step_up_expired':
      return new AccountDeletionError('step_up_expired');
    case 'not_found':
      return new AccountDeletionError('not_found');
    case 'validation_failed':
      return new AccountDeletionError('validation_failed');
    default:
      return new AccountDeletionError('unavailable', raw.slice(0, 120));
  }
}

async function callDeletionRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const response = await postgrest(`/rpc/${fn}`, {
    method: 'POST',
    body: args,
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      message = (JSON.parse(text) as RpcErrorBody).message ?? text;
    } catch {
      /* keep raw */
    }
    throw mapRpcError(message);
  }
  return (await response.json()) as T;
}

/** True when a locked (or finalized-but-not-yet-removed) deletion exists. */
export { hasActiveDeletion } from './postgrest';

export interface StepUpResult {
  operationId: string;
  deletionStage: string;
  expiresAt: string;
}

/** Step 1: send a fresh OTP to the account email (step-up challenge). */
export async function requestDeletionOtp(ownerId: string): Promise<void> {
  if (await hasActiveDeletion(ownerId)) {
    throw new AccountDeletionError('account_deleting');
  }
  const quota = await consumeRateLimit('account_delete_day', ownerId, 10, 86400);
  if (!quota.allowed) throw new AccountDeletionError('rate_limited');
  const email = await getAccountEmail(ownerId);
  if (!email) throw new AccountDeletionError('not_found', 'account has no email');
  try {
    await requestEmailOtp(email);
  } catch (error) {
    if (error instanceof AuthProviderError && error.status === 429) {
      throw new AccountDeletionError('rate_limited');
    }
    throw error;
  }
}

/** Step 2: verify the fresh OTP and issue the single-use proof. */
export async function verifyDeletionStepUp(ownerId: string, code: string): Promise<StepUpResult> {
  const quota = await consumeRateLimit('account_delete_day', ownerId, 10, 86400);
  if (!quota.allowed) throw new AccountDeletionError('rate_limited');
  const email = await getAccountEmail(ownerId);
  if (!email) throw new AccountDeletionError('not_found', 'account has no email');
  // Verify consumes the OTP; the returned provider session is discarded —
  // the proof of mailbox control is what we needed, not a new session.
  await verifyEmailOtp(email, code);
  const result = await callDeletionRpc<{
    operation_id: string;
    deletion_stage: string;
    expires_at: string;
  }>('fractalpark_account_deletion_step_up', {
    p_owner_id: ownerId,
    p_proof_key: crypto.randomUUID(),
  });
  return {
    operationId: result.operation_id,
    deletionStage: result.deletion_stage,
    expiresAt: result.expires_at,
  };
}

export interface DeletionConfirmResult {
  status: string;
  draftsDeleted: number;
  publicationsWithdrawn: number;
}

/**
 * Step 3: explicit second confirmation (typed email must match the account
 * address) -> confirm transaction -> revoke every session. The caller must
 * also clear the local session cookie.
 */
export async function confirmAccountDeletion(
  ownerId: string,
  operationId: string,
  confirmEmail: string,
): Promise<DeletionConfirmResult> {
  const email = await getAccountEmail(ownerId);
  if (!email) throw new AccountDeletionError('not_found', 'account has no email');
  if (confirmEmail.trim().toLowerCase() !== email.toLowerCase()) {
    throw new AccountDeletionError('validation_failed', 'confirmation email does not match');
  }
  const result = await callDeletionRpc<{
    status: string;
    drafts_deleted: number;
    publications_withdrawn: number;
  }>('fractalpark_account_deletion_confirm', {
    p_owner_id: ownerId,
    p_operation_id: operationId,
  });
  // Revoke every session everywhere. The confirm transaction is already
  // committed — a revocation outage must not report failure for a deletion
  // that happened; the deletion gate already blocks all writes, and stale
  // access tokens die within their short TTL.
  try {
    await callDeletionRpc<number>('fractalpark_revoke_user_sessions', {
      p_owner_id: ownerId,
    });
  } catch (error) {
    console.error(
      '[account-deletion] session revocation failed after confirm:',
      error instanceof Error ? error.message.slice(0, 120) : 'unknown',
    );
  }
  return {
    status: result.status,
    draftsDeleted: result.drafts_deleted,
    publicationsWithdrawn: result.publications_withdrawn,
  };
}
