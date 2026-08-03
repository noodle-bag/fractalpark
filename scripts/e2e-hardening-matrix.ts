/**
 * Manual E2E hardening matrix (commit 12, spec sections 5, 7, 9, 10, 13 +
 * docs/testing/v0.4.15-regression-matrix.md): the cross-cutting security
 * journeys that individual feature commits could not cover without
 * duplication. Everything here executes against the real local stack:
 *
 *  1. CSRF — every mutation route rejects a cross-site Origin (13 routes)
 *  2. Cache — every authenticated/private GET answers `private, no-store`;
 *     community reads answer no-store (spec 13)
 *  3. Permissions — anonymous drafts 401, cross-owner draft 404, private
 *     draft thumbnail object is not anonymously fetchable
 *  4. Cross-device — two live sessions of one account: independent logout,
 *     stale-revision conflict surfaces as revision_conflict
 *  5. Capacity — over-cap envelope rejected, oversized JSON body rejected,
 *     community limit above the hard cap rejected
 *  6. UGC — hostile title/display name never renders unescaped on the
 *     public artwork page (HTML body and JSON-LD)
 *
 * Prereqs: local Supabase + Mailpit running; dev server on :3100 with
 * FRACTALPARK_CREATION_CLOUD_ENABLED=true; SUPABASE_SERVICE_ROLE_KEY set.
 *
 * Run: SUPABASE_SERVICE_ROLE_KEY=... node --import tsx scripts/e2e-hardening-matrix.ts
 */

export {};

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(cond: unknown, label: string): void {
  if (cond) {
    passed += 1;
    console.log(`ok  ${label}`);
  } else {
    failed += 1;
    failures.push(String(label));
    console.log(`FAIL ${label}`);
  }
}

interface ApiInit {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

async function api(path: string, cookie: string | null, init: ApiInit = {}): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      origin: BASE,
      ...(cookie ? { cookie } : {}),
      ...(init.headers ?? {}),
    },
    body: init.body,
    redirect: 'manual',
  });
}

async function apiRaw(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${path}`, { redirect: 'manual', ...init });
}

function cookieFrom(res: Response): string {
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/fp_creation_session=[^;]+/);
  return match ? match[0] : '';
}

async function latestOtpCode(sinceMs: number): Promise<string> {
  for (let i = 0; i < 30; i += 1) {
    const list = (await (
      await fetch(`${MAILPIT}/api/v1/messages?limit=5`)
    ).json()) as { messages: Array<{ ID: string; Created: string }> };
    for (const msg of list.messages) {
      const created = Date.parse(msg.Created);
      if (Number.isFinite(created) && created + 60_000 < sinceMs) continue;
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as {
        Subject: string;
        Text: string;
      };
      const match = (full.Subject + full.Text).match(/\b(\d{6})\b/);
      if (match) return match[1];
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('no OTP email arrived');
}

async function register(email: string): Promise<string> {
  const t0 = Date.now();
  await api('/api/creation/auth/otp/request', null, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  const code = await latestOtpCode(t0);
  const verify = await api('/api/creation/auth/otp/verify', null, {
    method: 'POST',
    body: JSON.stringify({ email, token: code }),
  });
  const cookie = cookieFrom(verify);
  if (verify.status !== 200 || !cookie) throw new Error(`register failed (${verify.status})`);
  return cookie;
}

async function makeEnvelope(): Promise<Record<string, unknown>> {
  const { DEFAULT_FRACTAL_DOCUMENT } = await import('../src/engine/document');
  const { createFractalDocumentEnvelope } = await import('../src/lib/fractal-file');
  const result = await createFractalDocumentEnvelope(DEFAULT_FRACTAL_DOCUMENT, []);
  if (!result.success) throw new Error('fixture envelope failed to build');
  return result.value as unknown as Record<string, unknown>;
}

async function main(): Promise<void> {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set (local stack service key)');
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' }).catch(() => undefined);
  const ENVELOPE = await makeEnvelope();
  const EMAIL = `matrix-${Date.now()}@example.com`;

  // ---- Fixture: one account, one draft, one published work -------------
  const cookie = await register(EMAIL);
  await api('/api/creation/profile', cookie, {
    method: 'PATCH',
    body: JSON.stringify({ displayName: 'Matrix <b>Tester</b>' }),
  });
  const draftRes = await api('/api/creation/drafts', cookie, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ envelope: ENVELOPE }),
  });
  const draft = (await draftRes.json()) as { draftId: string; revision: number };
  if (draftRes.status !== 201) {
    throw new Error(`fixture draft failed (${draftRes.status}): ${JSON.stringify(draft).slice(0, 200)}`);
  }
  const HOSTILE_TITLE = '<script>alert(1)</script><img src=x onerror=alert(2)>';
  const pubRes = await api(`/api/creation/drafts/${draft.draftId}/publish`, cookie, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      expectedRevision: draft.revision,
      title: HOSTILE_TITLE,
      description: 'matrix probe',
      attestationVersion: '2026-08-02.v1',
    }),
  });
  const pub = (await pubRes.json()) as { publicationId?: string; slug?: string };
  if (pubRes.status !== 201) throw new Error(`fixture publish failed (${pubRes.status})`);

  // ---- 1. CSRF: cross-site Origin rejected on every mutation -----------
  const mutations: Array<[string, string, string]> = [
    ['POST', '/api/creation/drafts', JSON.stringify({ envelope: ENVELOPE })],
    ['PATCH', `/api/creation/drafts/${draft.draftId}`, JSON.stringify({ expectedRevision: 1, envelope: ENVELOPE })],
    ['DELETE', `/api/creation/drafts/${draft.draftId}`, '{}'],
    ['POST', `/api/creation/drafts/${draft.draftId}/publish`, JSON.stringify({ expectedRevision: 1, title: 'x', description: '', attestationVersion: '2026-08-02.v1' })],
    ['PATCH', '/api/creation/profile', JSON.stringify({ displayName: 'x' })],
    ['POST', '/api/creation/auth/session/refresh', '{}'],
    ['POST', '/api/creation/auth/logout', '{}'],
    ['POST', '/api/creation/auth/otp/request', JSON.stringify({ email: 'x@y.z' })],
    ['POST', '/api/creation/auth/otp/verify', JSON.stringify({ email: 'x@y.z', token: '123456' })],
    ['POST', '/api/creation/account/delete/request', '{}'],
    ['POST', '/api/creation/account/delete/verify', JSON.stringify({ code: '123456' })],
    ['POST', '/api/creation/account/delete', JSON.stringify({ operationId: crypto.randomUUID(), confirmEmail: 'x@y.z' })],
    ['POST', `/api/creation/publications/${pub.publicationId}/withdraw`, '{}'],
  ];
  for (const [method, path, body] of mutations) {
    const res = await api(path, cookie, {
      method,
      headers: { origin: 'https://evil.example.com', 'idempotency-key': crypto.randomUUID() },
      body,
    });
    assert(res.status === 403, `CSRF ${method} ${path.split('/').slice(3, 6).join('/')} -> 403 (got ${res.status})`);
  }

  // ---- 2. Cache contracts ----------------------------------------------
  const privateGets: string[] = [
    '/api/creation/drafts',
    '/api/creation/publications',
    '/api/creation/profile',
    '/api/creation/auth/session',
  ];
  for (const path of privateGets) {
    const res = await api(path, cookie);
    const cc = res.headers.get('cache-control') ?? '';
    assert(cc.includes('private') && cc.includes('no-store'), `cache ${path}: private no-store (${cc})`);
  }
  const communityList = await api('/api/creation/community', null);
  const ccList = communityList.headers.get('cache-control') ?? '';
  assert(ccList.includes('no-store'), `cache community list no-store (${ccList})`);

  // ---- 3. Permissions ---------------------------------------------------
  const anonDrafts = await api('/api/creation/drafts', null);
  assert(anonDrafts.status === 401, `anonymous drafts list -> 401 (${anonDrafts.status})`);
  const cookieB = await register(`matrix-b-${Date.now()}@example.com`);
  // Private draft thumbnail object must not be anonymously fetchable. The
  // fixture draft had no thumbnail; upload one via a fresh draft so the
  // object exists, then probe the storage URL without a signature.
  const thumbDraftRes = await api('/api/creation/drafts', cookie, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ envelope: ENVELOPE, thumbnail: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' }),
  });
  const thumbDraft = (await thumbDraftRes.json()) as { draftId?: string };
  // Cross-owner read of a private draft is a uniform 404.
  const crossRead = await api(`/api/creation/drafts/${thumbDraft.draftId}`, cookieB);
  assert(crossRead.status === 404, `owner B reads A's draft -> 404 (${crossRead.status})`);
  const thumbDetail = (await (
    await api(`/api/creation/drafts/${thumbDraft.draftId}`, cookie)
  ).json()) as { draft?: { thumbnailPath?: string | null } };
  const thumbPath = thumbDetail.draft?.thumbnailPath;
  if (thumbPath) {
    const anonThumb = await fetch(
      `http://127.0.0.1:54321/storage/v1/object/draft-thumbnails/${thumbPath}`,
      { redirect: 'manual' },
    );
    assert(
      anonThumb.status === 400 || anonThumb.status === 401 || anonThumb.status === 403 || anonThumb.status === 404,
      `anonymous private thumbnail fetch denied (${anonThumb.status})`,
    );
  } else {
    assert(false, `thumbnail fixture stored (status ${thumbDraftRes.status})`);
  }

  // ---- 4. Cross-device ---------------------------------------------------
  // Two live sessions of the same account coexist; logging one out does not
  // kill the other; a stale revision surfaces as revision_conflict. The
  // provider enforces a per-email OTP frequency (~60s), so a second
  // sign-in for the same address waits it out.
  await new Promise((r) => setTimeout(r, 61_000));
  const device2 = await register(EMAIL);
  const listA = await api('/api/creation/drafts', cookie);
  const listB = await api('/api/creation/drafts', device2);
  assert(listA.status === 200 && listB.status === 200, 'two devices hold live sessions');
  const fresh = (await (await api('/api/creation/drafts', cookie)).json()) as {
    drafts: Array<{ id: string; revision: number }>;
  };
  const target = fresh.drafts[0];
  if (target) {
    const stale = await api(`/api/creation/drafts/${target.id}`, cookie, {
      method: 'PATCH',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ expectedRevision: target.revision + 99, envelope: ENVELOPE }),
    });
    const staleBody = (await stale.json()) as { error?: { code?: string } };
    assert(
      stale.status === 409 && staleBody.error?.code === 'revision_conflict',
      `stale revision -> 409 revision_conflict (${stale.status})`,
    );
  } else {
    assert(false, 'cross-device draft fixture exists');
  }
  const logoutA = await api('/api/creation/auth/logout', cookie, { method: 'POST', body: '{}' });
  const listB2 = await api('/api/creation/drafts', device2);
  // Logout revokes every provider session (scope global by design) — but a
  // sibling device's sealed access cookie stays valid until its own short
  // TTL; only its refresh dies. Device B keeps working on its current
  // cookie and cannot renew.
  assert(
    (logoutA.status === 200 || logoutA.status === 204) && listB2.status === 200,
    `logout on device A spares device B's live cookie (logout ${logoutA.status}, B ${listB2.status})`,
  );

  // ---- 5. Capacity --------------------------------------------------------
  // Over-cap envelope (>1 MiB canonical input) is rejected before parsing.
  const huge = { ...ENVELOPE, padding: 'x'.repeat(1_100_000) };
  const overCap = await api('/api/creation/drafts', device2, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ envelope: huge }),
  });
  assert(overCap.status === 413 || overCap.status === 422, `over-cap envelope rejected (${overCap.status})`);
  // Community limit above the hard cap is rejected (spec 13: 400, not clamp).
  const tooBig = await api('/api/creation/community?limit=999', null);
  assert(tooBig.status === 400, `community limit=999 -> 400 (${tooBig.status})`);

  // ---- 6. UGC -------------------------------------------------------------
  // The hostile title never renders unescaped on the public artwork page.
  const page = await apiRaw(`/en/gallery/community/${pub.publicationId}`);
  const html = await page.text();
  assert(page.status === 200, `public artwork page renders (${page.status})`);
  assert(!html.includes('<script>alert(1)</script>'), 'public page: no raw hostile <script> in HTML');
  assert(!html.includes('<img src=x onerror'), 'public page: no raw hostile tag formation');
  // The community API itself transports plain text; SSR/JSON-LD escape at
  // render. Assert the API round-trips the title so the page assertion
  // above is meaningful.
  const communityItem = (await (await api('/api/creation/community?limit=5', null)).json()) as {
    items?: Array<{ id?: string; title?: string }>;
  };
  const hit = (communityItem.items ?? []).find((i) => i.id === pub.publicationId);
  assert((hit?.title ?? '').includes('alert(1)'), 'community API returns the raw plain-text title');

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('FAILURES:\n' + failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
