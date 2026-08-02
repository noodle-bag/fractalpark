/**
 * Manual E2E for commit 7 against the real local stack (dev server on
 * localhost:3100 with .env.local). Chain: OTP -> profile -> draft ->
 * publish (replay) -> publications list -> withdraw -> tombstone.
 * Run: node --import tsx scripts/e2e-publish-flow.ts
 */

const BASE = 'http://localhost:3100';
const MAILPIT = 'http://127.0.0.1:54324';
const EMAIL = `publish-e2e-${Date.now()}@example.com`;

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
    console.log(`ok  ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${label}`);
  }
}

async function readOtp(): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/messages?limit=1`);
    const body = (await res.json()) as { messages?: { ID: string }[] };
    const id = body.messages?.[0]?.ID;
    if (id) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json() as { Text?: string };
      const match = /\b(\d{6})\b/.exec(msg.Text ?? '');
      if (match) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('OTP never arrived');
}

function sessionCookie(res: Response): string {
  const raw = res.headers.get('set-cookie') ?? '';
  return raw.split(';')[0];
}

async function api(
  path: string,
  cookie: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      origin: BASE,
      cookie,
      ...(init.headers ?? {}),
    },
  });
}

async function main(): Promise<void> {
  // 1. OTP sign-in
  const otpReq = await api('/api/creation/auth/otp/request', '', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL }),
  });
  assert(otpReq.status === 200, `otp request ${otpReq.status}`);
  const code = await readOtp();
  const verify = await api('/api/creation/auth/otp/verify', '', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, token: code }),
  });
  assert(verify.status === 200, `otp verify ${verify.status}`);
  const cookie = sessionCookie(verify);
  assert(cookie.startsWith('fp_creation_session='), 'sealed session cookie issued');

  // 2. Publish without a display name must be refused
  const { DEFAULT_FRACTAL_DOCUMENT } = await import('../src/engine/document');
  const { createFractalDocumentEnvelope } = await import('../src/lib/fractal-file');
  const envelopeResult = await createFractalDocumentEnvelope(DEFAULT_FRACTAL_DOCUMENT, []);
  assert(envelopeResult.success, 'fixture envelope builds');
  const envelope = envelopeResult.success ? envelopeResult.value : null;

  const draftRes = await api('/api/creation/drafts', cookie, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ envelope }),
  });
  const draftBody = (await draftRes.json()) as { draftId?: string; revision?: number };
  assert(draftRes.status === 201 && typeof draftBody.draftId === 'string', `draft created ${draftRes.status}`);
  const draftId = draftBody.draftId as string;

  const earlyPublish = await api(`/api/creation/drafts/${draftId}/publish`, cookie, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      expectedRevision: 1,
      title: 'Nebula E2E',
      description: '',
      attestationVersion: '2026-08-02.v1',
    }),
  });
  const earlyBody = (await earlyPublish.json()) as { error?: { code?: string } };
  assert(
    earlyPublish.status === 400 && earlyBody.error?.code === 'validation_failed',
    `publish without display name refused (${earlyPublish.status} ${earlyBody.error?.code})`,
  );

  // 3. Set the display name, then publish
  const profileRes = await api('/api/creation/profile', cookie, {
    method: 'PATCH',
    body: JSON.stringify({ displayName: 'E2E Publisher' }),
  });
  assert(profileRes.status === 200, `display name set ${profileRes.status}`);

  const publishKey = crypto.randomUUID();
  const publishRes = await api(`/api/creation/drafts/${draftId}/publish`, cookie, {
    method: 'POST',
    headers: { 'idempotency-key': publishKey },
    body: JSON.stringify({
      expectedRevision: 1,
      title: 'Nebula E2E',
      description: 'A quiet iteration.',
      attestationVersion: '2026-08-02.v1',
    }),
  });
  const publishBody = (await publishRes.json()) as {
    publicationId?: string;
    status?: string;
    thumbnailStatus?: string;
  };
  assert(
    publishRes.status === 201 && publishBody.status === 'published',
    `published ${publishRes.status}`,
  );
  assert(publishBody.thumbnailStatus === 'pending', 'public thumbnail starts as pending placeholder');
  const publicationId = publishBody.publicationId as string;

  // 4. Replay with the same key returns the original publication
  const replay = await api(`/api/creation/drafts/${draftId}/publish`, cookie, {
    method: 'POST',
    headers: { 'idempotency-key': publishKey },
    body: JSON.stringify({
      expectedRevision: 1,
      title: 'Nebula E2E',
      description: 'A quiet iteration.',
      attestationVersion: '2026-08-02.v1',
    }),
  });
  const replayBody = (await replay.json()) as { publicationId?: string; replayed?: boolean };
  assert(
    replay.status === 201 && replayBody.publicationId === publicationId,
    `idempotent replay returns the same publication (${replay.status})`,
  );

  // 5. Source draft gone; publication listed with frozen license snapshot
  const drafts = (await (await api('/api/creation/drafts', cookie)).json()) as { drafts: unknown[] };
  assert(drafts.drafts.length === 0, 'source draft deleted on publish');
  const pubs = (await (await api('/api/creation/publications', cookie)).json()) as {
    publications: {
      id: string;
      status: string;
      license: string;
      authorDisplayName: string;
      description: string | null;
    }[];
  };
  const mine = pubs.publications.find((p) => p.id === publicationId);
  assert(!!mine && mine.status === 'published', 'publication listed as published');
  assert(mine?.license === 'CC-BY-4.0' && mine.authorDisplayName === 'E2E Publisher', 'frozen license + attribution snapshot');

  // 6. Withdraw leaves the minimal tombstone
  const withdraw = await api(`/api/creation/publications/${publicationId}/withdraw`, cookie, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({}),
  });
  assert(withdraw.status === 200, `withdraw ${withdraw.status}`);
  const pubsAfter = (await (await api('/api/creation/publications', cookie)).json()) as {
    publications: { id: string; status: string; description: string | null }[];
  };
  const tomb = pubsAfter.publications.find((p) => p.id === publicationId);
  assert(tomb?.status === 'withdrawn' && tomb.description === null, 'tombstone: withdrawn, description cleared');

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
