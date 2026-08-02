import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as smtpProbePOST } from '@/app/api/creation/internal/smtp-probe/route';

const sendMailMock = vi.hoisted(() => vi.fn());
const closeMock = vi.hoisted(() => vi.fn());

vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({ sendMail: sendMailMock, close: closeMock })),
}));

const ENV_VARS = [
  'FRACTALPARK_CREATION_CLOUD_ENABLED',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'FRACTALPARK_RATE_LIMIT_HMAC_KEY',
  'CRON_SECRET',
  'FRACTALPARK_ARTWORK_EMAIL_BACKUP_ENABLED',
  'FRACTALPARK_SMTP_HOST',
  'FRACTALPARK_SMTP_PORT',
  'FRACTALPARK_SMTP_USER',
  'FRACTALPARK_SMTP_PASSWORD',
] as const;

const SUPABASE_URL = 'https://project.example.supabase.co';
const CRON_SECRET = 'test-cron-secret';
const savedEnv = new Map<string, string | undefined>();

let fetchCalls: string[] = [];

function stubFetch(respond: (url: string) => Response): void {
  fetchCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      fetchCalls.push(String(input));
      return respond(String(input));
    }),
  );
}

function enableEnv(): void {
  process.env.FRACTALPARK_CREATION_CLOUD_ENABLED = 'true';
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  process.env.FRACTALPARK_RATE_LIMIT_HMAC_KEY = 'r'.repeat(32);
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.FRACTALPARK_ARTWORK_EMAIL_BACKUP_ENABLED = 'true';
  process.env.FRACTALPARK_SMTP_HOST = 'smtp.example.com';
  process.env.FRACTALPARK_SMTP_PORT = '465';
  process.env.FRACTALPARK_SMTP_USER = 'noreply@fractalpark.com';
  process.env.FRACTALPARK_SMTP_PASSWORD = 'smtp-test-password';
}

beforeEach(() => {
  for (const name of ENV_VARS) {
    if (!savedEnv.has(name)) savedEnv.set(name, process.env[name]);
    delete process.env[name];
  }
  enableEnv();
  sendMailMock.mockReset().mockResolvedValue({ messageId: 'probe-message-id' });
  closeMock.mockReset();
  stubFetch(() => new Response(JSON.stringify([{ allowed: true, retry_after: 0 }]), { status: 200 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ENV_VARS) {
    const saved = savedEnv.get(name);
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  }
});

function probeRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://fractalpark.com/api/creation/internal/smtp-probe', {
    method: 'POST',
    headers: { host: 'fractalpark.com', authorization: `Bearer ${CRON_SECRET}`, ...headers },
  });
}

describe('POST /api/creation/internal/smtp-probe', () => {
  it('answers cloud_disabled while the switch is off without initializing anything', async () => {
    delete process.env.FRACTALPARK_CREATION_CLOUD_ENABLED;
    const res = await smtpProbePOST(probeRequest());
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('cloud_disabled');
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(fetchCalls).toHaveLength(0);
  });

  it('requires the cron bearer secret', async () => {
    const missing = await smtpProbePOST(probeRequest({ authorization: '' }));
    expect(missing.status).toBe(401);
    const wrong = await smtpProbePOST(probeRequest({ authorization: 'Bearer nope' }));
    expect(wrong.status).toBe(401);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('consumes the backup counter before sending and maps denial to 429', async () => {
    stubFetch(() => new Response(JSON.stringify([{ allowed: false, retry_after: 3600 }]), { status: 200 }));
    const res = await smtpProbePOST(probeRequest());
    expect(res.status).toBe(429);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('sends a ~1 MB .fractal.json attachment to the hardcoded maintainer mailbox', async () => {
    const res = await smtpProbePOST(probeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const body = (await res.json()) as { ok: boolean; messageId: string; attachmentBytes: number };
    expect(body.ok).toBe(true);
    expect(body.messageId).toBe('probe-message-id');
    expect(body.attachmentBytes).toBeGreaterThanOrEqual(1_000_000);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mail = sendMailMock.mock.calls[0][0] as {
      to: string;
      from: string;
      attachments: Array<{ filename: string; content: Buffer; contentType: string }>;
    };
    expect(mail.to).toBe('noreply@fractalpark.com');
    expect(mail.from).toContain('noreply@fractalpark.com');
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0].filename).toBe('probe.fractal.json');
    expect(mail.attachments[0].contentType).toBe('application/json');
    expect(mail.attachments[0].content.length).toBe(body.attachmentBytes);
    // The payload is real JSON.
    const parsed = JSON.parse(mail.attachments[0].content.toString('utf8')) as { type: string };
    expect(parsed.type).toBe('FractalParkDocument');
    expect(closeMock).toHaveBeenCalled();
  });

  it('maps an SMTP failure to the generic 503 and still closes the transport', async () => {
    sendMailMock.mockRejectedValue(new Error('535 authentication failed'));
    const res = await smtpProbePOST(probeRequest());
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('unavailable');
    expect(body.error.message).not.toContain('535');
    expect(closeMock).toHaveBeenCalled();
  });

  it('fails closed with 503 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = await smtpProbePOST(probeRequest());
    expect(res.status).toBe(503);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('fails closed with 503 and does not send when the rate-limit backend rejects', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed');
    });
    const res = await smtpProbePOST(probeRequest());
    expect(res.status).toBe(503);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('ignores any request body: recipient, subject and attachment are not injectable', async () => {
    const malicious = new Request('https://fractalpark.com/api/creation/internal/smtp-probe', {
      method: 'POST',
      headers: {
        host: 'fractalpark.com',
        authorization: `Bearer ${CRON_SECRET}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        to: 'victim@example.com',
        subject: 'pwned',
        attachments: [{ filename: 'evil.exe', content: 'x' }],
      }),
    });
    const res = await smtpProbePOST(malicious);
    expect(res.status).toBe(200);
    const mail = sendMailMock.mock.calls[0][0] as { to: string; subject: string; attachments: Array<{ filename: string }> };
    expect(mail.to).toBe('noreply@fractalpark.com');
    expect(mail.subject).not.toBe('pwned');
    expect(mail.attachments[0].filename).toBe('probe.fractal.json');
  });
});
