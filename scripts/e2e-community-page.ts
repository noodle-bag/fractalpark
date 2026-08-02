/** One-off: publish a work, then verify the public SSR page contract. */
export {};

const BASE = 'http://localhost:3100';
const MAILPIT = 'http://127.0.0.1:54324';
const EMAIL = `ssr-e2e-${Date.now()}@example.com`;

async function readOtp(): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/messages?limit=1`);
    const body = (await res.json()) as { messages?: { ID: string }[] };
    const id = body.messages?.[0]?.ID;
    if (id) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as { Text?: string };
      const match = /\b(\d{6})\b/.exec(msg.Text ?? '');
      if (match) return match[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('no otp');
}

async function api(path: string, cookie: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', origin: BASE, cookie, ...(init.headers ?? {}) },
  });
}

async function main(): Promise<void> {
  await api('/api/creation/auth/otp/request', '', { method: 'POST', body: JSON.stringify({ email: EMAIL }) });
  const code = await readOtp();
  const verify = await api('/api/creation/auth/otp/verify', '', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, token: code }),
  });
  const cookie = (verify.headers.get('set-cookie') ?? '').split(';')[0];

  await api('/api/creation/profile', cookie, {
    method: 'PATCH',
    body: JSON.stringify({ displayName: 'SSR Author & <b>Co</b>' }),
  });
  const { DEFAULT_FRACTAL_DOCUMENT } = await import('../src/engine/document');
  const { createFractalDocumentEnvelope } = await import('../src/lib/fractal-file');
  const env = await createFractalDocumentEnvelope(DEFAULT_FRACTAL_DOCUMENT, []);
  const draft = await (await api('/api/creation/drafts', cookie, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ envelope: env.success ? env.value : null }),
  })).json() as { draftId: string };
  const pub = await (await api(`/api/creation/drafts/${draft.draftId}/publish`, cookie, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      expectedRevision: 1,
      title: 'SSR "Quoted" <Title> & </script>Friends',
      description: 'Line one.\nLine two with <em>markup</em>.',
      attestationVersion: '2026-08-02.v1',
    }),
  })).json() as { publicationId: string };

  const page = await fetch(`${BASE}/en/gallery/community/${pub.publicationId}`);
  const html = await page.text();
  const checks: Array<[string, boolean]> = [
    ['page 200', page.status === 200],
    ['noindex,follow', html.includes('noindex') && html.includes('follow')],
    ['title text escaped', html.includes('SSR') && !html.includes('<Title>') && !html.includes('</script>Friends')],
    ['no raw injected markup', !html.includes('<em>markup</em>')],
    ['ImageObject JSON-LD with Person creator', html.includes('"@type":"ImageObject"') && html.includes('"@type":"Person"') && html.includes('SSR Author')],
    ['license link', html.includes('creativecommons.org/licenses/by/4.0/')],
    ['report mailto', html.includes('contact@fractalpark.com')],
    ['remix action', html.includes('Remix')],
    ['placeholder image', html.includes('/images/community-placeholder.svg')],
  ];
  const missing = await fetch(`${BASE}/en/gallery/community/00000000-0000-4000-8000-000000000000`);
  checks.push(['unknown id 404', missing.status === 404]);

  let bad = 0;
  for (const [label, ok] of checks) {
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
    if (!ok) bad++;
  }
  if (bad > 0) process.exit(1);
  console.log('\nSSR page contract all green');
}
main().catch((e) => { console.error(e); process.exit(1); });
