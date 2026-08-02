/**
 * Manual E2E for commit 7 against the real local stack (dev server on
 * localhost:3100 with .env.local). Chain: OTP -> profile -> draft ->
 * publish (replay) -> publications list -> withdraw -> tombstone.
 * Run: node --import tsx scripts/e2e-publish-flow.ts
 */
export {};

const BASE = 'http://localhost:3100';
const MAILPIT = 'http://127.0.0.1:54324';
const EMAIL = `publish-e2e-${Date.now()}@example.com`;

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string): asserts condition {
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
    backupEmailStatus?: string;
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

  // 6. Community public reads: anonymous, no-store, published only
  const communityList = await fetch(`${BASE}/api/creation/community`);
  const communityBody = (await communityList.json()) as { items: { id: string }[]; nextCursor: string | null };
  assert(communityList.status === 200, `community list ${communityList.status}`);
  assert(communityList.headers.get('cache-control')?.includes('no-store') ?? false, 'community list is no-store');
  assert(communityBody.items.some((item) => item.id === publicationId), 'published work appears in the community list');

  const communityDetail = await fetch(`${BASE}/api/creation/publications/${publicationId}`);
  const detailBody = (await communityDetail.json()) as { envelope?: unknown; authorDisplayName?: string };
  assert(communityDetail.status === 200 && !!detailBody.envelope, 'community detail carries the frozen envelope');
  assert(communityDetail.headers.get('cache-control')?.includes('no-store') ?? false, 'community detail is no-store');

  // 7. Remix from the community detail into a new draft with publication provenance
  const remixRes = await api('/api/creation/drafts', cookie, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      envelope: detailBody.envelope,
      remixSourceType: 'publication',
      remixSourceId: publicationId,
    }),
  });
  const remixBody = (await remixRes.json()) as { draftId?: string };
  assert(remixRes.status === 201 && typeof remixBody.draftId === 'string', `remix draft created ${remixRes.status}`);
  const remixDraft = (await (
    await api(`/api/creation/drafts/${remixBody.draftId}`, cookie)
  ).json()) as { draft?: { remixSource?: { type: string; id: string } | null } };
  assert(
    remixDraft.draft?.remixSource?.type === 'publication' &&
      remixDraft.draft.remixSource.id === publicationId,
    'remix provenance recorded as the source publication',
  );

  // 7b. Maintainer moderation chain: hide removes public access and new
  // remixes immediately; restore brings them back. The RPC is the
  // service-role-only controlled-panel mechanism (spec section 10).
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(!!SERVICE_KEY, 'SUPABASE_SERVICE_ROLE_KEY must be set (local stack service key)');
  const moderate = async (action: string, reason?: string) =>
    fetch('http://127.0.0.1:54321/rest/v1/rpc/artwork_publication_set_moderation', {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        p_publication_id: publicationId,
        p_action: action,
        p_reason: reason ?? null,
      }),
    });

  const hide = await moderate('hide', 'e2e takedown drill');
  const hideBody = (await hide.json()) as { status?: string };
  assert(hide.status === 200 && hideBody.status === 'hidden', `hide: ${hide.status}`);

  const hiddenDetail = await fetch(`${BASE}/api/creation/publications/${publicationId}`);
  assert(hiddenDetail.status === 404, 'hidden work 404s on the public detail');
  const hiddenList = (await (
    await fetch(`${BASE}/api/creation/community?limit=50`)
  ).json()) as { items: { id: string }[] };
  assert(
    !hiddenList.items.some((w) => w.id === publicationId),
    'hidden work leaves the community list',
  );
  const hiddenRemix = await api('/api/creation/drafts', cookie, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      envelope: detailBody.envelope,
      remixSourceType: 'publication',
      remixSourceId: publicationId,
    }),
  });
  assert(hiddenRemix.status === 400, `remix of hidden refused (${hiddenRemix.status})`);

  const hideReplay = await moderate('hide', 'e2e confirmed');
  const hideReplayBody = (await hideReplay.json()) as { replayed?: boolean };
  assert(hideReplay.status === 200 && hideReplayBody.replayed === true, 're-hide is an idempotent replay');

  const restore = await moderate('restore');
  const restoreBody = (await restore.json()) as { status?: string };
  assert(restore.status === 200 && restoreBody.status === 'published', `restore: ${restore.status}`);
  const restoredDetail = await fetch(`${BASE}/api/creation/publications/${publicationId}`);
  assert(restoredDetail.status === 200, 'restored work is public again');

  // 8. Withdraw leaves the minimal tombstone and the public reads 404
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

  const goneDetail = await fetch(`${BASE}/api/creation/publications/${publicationId}`);
  assert(goneDetail.status === 404, 'withdrawn work 404s on the public detail');
  const goneList = await fetch(`${BASE}/api/creation/community`);
  const goneBody = (await goneList.json()) as { items: { id: string }[] };
  assert(!goneBody.items.some((item) => item.id === publicationId), 'withdrawn work leaves the community list');

  // 9. Remixing a withdrawn work is refused (provenance must be published)
  const lateRemix = await api('/api/creation/drafts', cookie, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      envelope: detailBody.envelope,
      remixSourceType: 'publication',
      remixSourceId: publicationId,
    }),
  });
  assert(lateRemix.status === 400, `remix of withdrawn refused (${lateRemix.status})`);

  // 9b. Maintainer moderation chain on the FIRST publication is exercised
  // below, right before its withdrawal (see "moderation" section).

  // 10. Backup email chain (Mailpit as the SMTP provider). Mode default off:
  // the earlier publish reported not_requested. Turn on publish_only, then
  // publish again and expect a real email with the .fractal.json attachment.
  const firstBackupStatus = publishBody.backupEmailStatus;
  assert(firstBackupStatus === 'not_requested', `backup default off (${firstBackupStatus})`);

  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
  const modeRes = await api('/api/creation/profile', cookie, {
    method: 'PATCH',
    body: JSON.stringify({ backupEmailMode: 'publish_only' }),
  });
  assert(modeRes.status === 200, `backup mode set ${modeRes.status}`);

  const draft2 = await api('/api/creation/drafts', cookie, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ envelope }),
  });
  const draft2Body = (await draft2.json()) as { draftId: string; backupEmailStatus?: string };
  assert(
    draft2Body.backupEmailStatus === 'not_requested',
    'publish_only mode does not email on save',
  );
  const publish2 = await api(`/api/creation/drafts/${draft2Body.draftId}/publish`, cookie, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      expectedRevision: 1,
      title: 'Backup Proof',
      description: '',
      attestationVersion: '2026-08-02.v1',
    }),
  });
  const publish2Body = (await publish2.json()) as { backupEmailStatus?: string };
  assert(publish2Body.backupEmailStatus === 'sent', `publish backup sent (${publish2Body.backupEmailStatus})`);

  interface MailpitMessage {
    Text?: string;
    Subject?: string;
    To?: { Address: string }[];
    Attachments?: { FileName: string; Size: number }[];
  }
  let backupMail: MailpitMessage | null = null;
  for (let i = 0; i < 20; i++) {
    const list = (await (
      await fetch(`${MAILPIT}/api/v1/messages?limit=1`)
    ).json()) as { messages?: { ID: string }[] };
    const id = list.messages?.[0]?.ID;
    if (id) {
      backupMail = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as MailpitMessage;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  assert(!!backupMail, 'backup email arrived in Mailpit');
  assert(backupMail?.Subject?.includes('Backup Proof') ?? false, 'backup subject carries the title');
  assert(
    backupMail?.To?.some((t) => t.Address === EMAIL) ?? false,
    'backup goes only to the account email',
  );
  const attachment = backupMail?.Attachments?.find((a) => a.FileName.endsWith('.fractal.json'));
  assert(!!attachment && attachment.Size > 100, 'backup carries the .fractal.json attachment');
  assert(backupMail?.Text?.includes('CC BY 4.0') ?? false, 'publish backup notes the CC BY 4.0 image layer');

  // Attachment CONTENT: must parse as the canonical envelope OBJECT — a
  // string-literal top level here is the B1 regression.
  const mailId = (await (
    await fetch(`${MAILPIT}/api/v1/messages?limit=1`)
  ).json()) as { messages: { ID: string }[] };
  const part = await fetch(`${MAILPIT}/api/v1/message/${mailId.messages[0].ID}/part/2`);
  const parsedAttachment = JSON.parse(await part.text()) as Record<string, unknown>;
  assert(
    typeof parsedAttachment === 'object' && parsedAttachment !== null && !Array.isArray(parsedAttachment),
    'attachment top level is an object, not a string literal',
  );
  assert(
    'document' in parsedAttachment || 'metadata' in parsedAttachment || 'envelopeVersion' in parsedAttachment,
    'attachment carries the canonical envelope shape',
  );

  // save_and_publish: a plain cloud SAVE must also email, with a valid
  // object-shaped attachment (the path B1 broke).
  await api('/api/creation/profile', cookie, {
    method: 'PATCH',
    body: JSON.stringify({ backupEmailMode: 'save_and_publish' }),
  });
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
  const draft3 = await api('/api/creation/drafts', cookie, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ envelope }),
  });
  const draft3Body = (await draft3.json()) as { backupEmailStatus?: string };
  assert(draft3Body.backupEmailStatus === 'sent', `save_and_publish emails on save (${draft3Body.backupEmailStatus})`);
  let savePartText = '';
  for (let i = 0; i < 20; i++) {
    const list = (await (
      await fetch(`${MAILPIT}/api/v1/messages?limit=1`)
    ).json()) as { messages?: { ID: string }[] };
    const id = list.messages?.[0]?.ID;
    if (id) {
      const savePart = await fetch(`${MAILPIT}/api/v1/message/${id}/part/2`);
      savePartText = await savePart.text();
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  const saveAttachment = JSON.parse(savePartText) as Record<string, unknown>;
  assert(
    typeof saveAttachment === 'object' && saveAttachment !== null && 'document' in saveAttachment,
    'save-path attachment is the canonical envelope object (B1 regression)',
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
