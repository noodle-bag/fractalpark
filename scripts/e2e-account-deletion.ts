/**
 * Manual E2E for commit 11 against the real local stack: the secure account
 * deletion drill. Chain: register -> draft + publish -> step-up OTP ->
 * wrong-email confirm refused -> confirm -> session dead -> writes blocked
 * -> OTP silently refused -> cleanup worker -> auth user gone, tombstones
 * kept, audit row survives with nulled owner.
 * Run: node --import tsx scripts/e2e-account-deletion.ts
 */
export {};

const BASE = 'http://localhost:3100';
const MAILPIT = 'http://127.0.0.1:54324';
const SUPABASE = 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = `delete-e2e-${Date.now()}@example.com`;

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string): asserts condition {
  if (condition) {
    passed += 1;
    console.log(`ok  ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

function cookieFrom(res: Response): string {
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/fp_creation_session=[^;]+/);
  return match ? match[0] : '';
}

async function api(
  path: string,
  cookie: string | null,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (cookie) headers.set('cookie', cookie);
  return fetch(`${BASE}${path}`, { ...init, headers, cache: 'no-store' });
}

async function mailCount(): Promise<number> {
  const list = (await (await fetch(`${MAILPIT}/api/v1/messages?limit=50`)).json()) as {
    total: number;
  };
  return list.total;
}

async function latestOtpCode(sinceMs: number): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = (await (
      await fetch(`${MAILPIT}/api/v1/messages?limit=5`)
    ).json()) as { messages: { ID: string; Created: string }[] };
    for (const msg of list.messages) {
      const created = new Date(msg.Created).getTime();
      if (created + 60_000 < sinceMs) continue; // Mailpit clock skew tolerance
      const full = (await (
        await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)
      ).json()) as { Subject?: string; Text?: string };
      const text = `${full.Subject ?? ''} ${full.Text ?? ''}`;
      const match = text.match(/\b(\d{6})\b/);
      if (match) return match[1];
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('no OTP email arrived');
}

async function serviceRpc(fn: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${SUPABASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY!,
      authorization: `Bearer ${SERVICE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function serviceQuery(path: string): Promise<unknown> {
  const res = await fetch(`${SUPABASE}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY!, authorization: `Bearer ${SERVICE_KEY}` },
    cache: 'no-store',
  });
  return res.json();
}

async function main(): Promise<void> {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set (local stack service key)');
  const { DEFAULT_FRACTAL_DOCUMENT } = await import('../src/engine/document');
  const { createFractalDocumentEnvelope } = await import('../src/lib/fractal-file');
  const envelopeResult = await createFractalDocumentEnvelope(DEFAULT_FRACTAL_DOCUMENT, []);
  if (!envelopeResult.success) throw new Error('fixture envelope failed to build');
  const ENVELOPE = envelopeResult.value;
  // Isolate the mailbox so stale codes from earlier runs can't be picked up.
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
  const started = Date.now();

  // 1. Register via OTP.
  await api('/api/creation/auth/otp/request', null, {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL }),
  });
  const code = await latestOtpCode(started);
  const verify = await api('/api/creation/auth/otp/verify', null, {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, token: code }),
  });
  assert(verify.status === 200, `registered (${verify.status})`);
  const cookie = cookieFrom(verify);
  assert(cookie !== '', 'session cookie issued');

  // 2. Seed: profile name, one published work, one draft.
  await api('/api/creation/profile', cookie, {
    method: 'PATCH',
    body: JSON.stringify({ displayName: 'Doomed Creator' }),
  });
  const pubDraft = await (
    await api('/api/creation/drafts', cookie, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ envelope: ENVELOPE }),
    })
  ).json() as { draftId: string; revision: number };
  const publish = await api(`/api/creation/drafts/${pubDraft.draftId}/publish`, cookie, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      expectedRevision: pubDraft.revision,
      title: 'Doomed Work',
      description: '',
      attestationVersion: '2026-08-02.v1',
    }),
  });
  const pubBody = (await publish.json()) as { publicationId: string };
  assert(publish.status === 201, `seed publish (${publish.status})`);
  const keepDraft = await api('/api/creation/drafts', cookie, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ envelope: ENVELOPE }),
  });
  assert(keepDraft.status === 201, 'seed draft kept');

  // 3. Step-up: request deletion OTP, verify, get proof. GoTrue enforces a
  // per-email OTP frequency (~60s); a realistic flow waits between the
  // sign-in code and the step-up code.
  await new Promise((r) => setTimeout(r, 61_000));
  const reqDel = await api('/api/creation/account/delete/request', cookie, { method: 'POST', body: '{}' });
  assert(reqDel.status === 204, `deletion OTP requested (${reqDel.status})`);
  const delCode = await latestOtpCode(Date.now() - 5000);
  const proofRes = await api('/api/creation/account/delete/verify', cookie, {
    method: 'POST',
    body: JSON.stringify({ code: delCode }),
  });
  const proof = (await proofRes.json()) as { operationId: string; expiresAt: string };
  assert(proofRes.status === 200 && !!proof.operationId, 'step-up proof issued');

  // 4. Wrong confirm email refused.
  const wrong = await api('/api/creation/account/delete', cookie, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ operationId: proof.operationId, confirmEmail: 'wrong@example.com' }),
  });
  assert(wrong.status === 400, `wrong email refused (${wrong.status})`);

  // 5. Confirm with the real email.
  const confirm = await api('/api/creation/account/delete', cookie, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ operationId: proof.operationId, confirmEmail: EMAIL }),
  });
  const confirmBody = (await confirm.json()) as {
    status: string;
    draftsDeleted: number;
    publicationsWithdrawn: number;
  };
  assert(confirm.status === 200 && confirmBody.status === 'deleting', `confirm (${confirm.status})`);
  assert(confirmBody.draftsDeleted === 1 && confirmBody.publicationsWithdrawn === 1, 'counts match seeds');

  // 6. The confirming device's cookie is cleared; any other device's
  //    sealed cookie is a bounded zombie (stateless access-token TTL): it
  //    can no longer write (the operation gate rejects) and reads return
  //    only what the confirm transaction left behind — nothing.
  const me = await api('/api/creation/drafts', cookie);
  const meBody = (await me.json()) as { drafts?: unknown[] };
  assert(me.status === 200 && Array.isArray(meBody.drafts) && meBody.drafts.length === 0,
    `zombie session reads only emptiness (${me.status})`);
  const zombieWrite = await api('/api/creation/drafts', cookie, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ envelope: ENVELOPE }),
  });
  const zombieBody = (await zombieWrite.json()) as { error?: { code?: string } };
  assert(
    zombieWrite.status === 409 && zombieBody.error?.code === 'account_deleting',
    `zombie write blocked by the gate (${zombieWrite.status})`,
  );

  // 7. OTP request for the deleted email is silently refused (generic 200,
  //    and no new code email arrives). Wait out the provider's per-email
  //    OTP frequency first so the request actually reaches the check.
  await new Promise((r) => setTimeout(r, 61_000));
  const countBefore = await mailCount();
  const reOtp = await api('/api/creation/auth/otp/request', null, {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL }),
  });
  assert(reOtp.status === 200, 'OTP request stays generic');
  await new Promise((r) => setTimeout(r, 8_000));
  assert((await mailCount()) === countBefore, 'no new OTP email for a deleting account');

  // 8. Public surface: the withdrawn work is gone from community.
  const detail = await fetch(`${BASE}/api/creation/publications/${pubBody.publicationId}`);
  assert(detail.status === 404, 'withdrawn work 404s publicly');

  // 9. Cleanup worker converges: thumbnails, then auth user + finalize.
  const { execFileSync } = await import('node:child_process');
  const workerOut = execFileSync(
    'node',
    ['--import', 'tsx', 'scripts/cleanup-worker.ts'],
    { cwd: process.cwd(), encoding: 'utf-8' },
  );
  assert(workerOut.includes('auth_user'), 'worker processed the auth_user job');

  const jobs = (await serviceQuery(
    `resource_cleanup_jobs?operation_id=eq.${proof.operationId}&select=resource_type,status`,
  )) as { resource_type: string; status: string }[];
  assert(
    jobs.length > 0 && jobs.every((j) => j.status === 'succeeded'),
    `all cleanup jobs succeeded (${jobs.map((j) => j.resource_type).join(',')})`,
  );

  const op = (await serviceQuery(
    `artwork_operations?id=eq.${proof.operationId}&select=status,operation_type,owner_id`,
  )) as { status: string; operation_type: string; owner_id: string | null }[];
  assert(op[0]?.status === 'succeeded' && op[0]?.owner_id === null, 'audit row closed, owner nulled');

  const draftsLeft = (await serviceQuery(
    `artwork_drafts?select=id&limit=1`,
  )) as unknown[];
  const pubsLeft = (await serviceQuery(
    `artwork_publications?id=eq.${pubBody.publicationId}&select=status,envelope`,
  )) as { status: string; envelope: unknown }[];
  assert(pubsLeft[0]?.status === 'withdrawn' && pubsLeft[0]?.envelope === null, 'tombstone kept');
  void draftsLeft;

  // 10. Re-registering with the same email starts a FRESH account (the
  //     provider's per-email frequency still applies after the user row is
  //     gone, so wait it out).
  await new Promise((r) => setTimeout(r, 61_000));
  const restart = Date.now();
  await api('/api/creation/auth/otp/request', null, {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL }),
  });
  const newCode = await latestOtpCode(restart);
  const newVerify = await api('/api/creation/auth/otp/verify', null, {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, token: newCode }),
  });
  assert(newVerify.status === 200, 'same email can register fresh after deletion');

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
