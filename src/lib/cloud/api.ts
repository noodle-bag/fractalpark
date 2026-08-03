/**
 * Shared HTTP plumbing for the v0.4.15 same-origin cloud API.
 *
 * Contract: docs/specs/web-creation-loop-v1.md §5.1/§5.2 —
 *
 * - The stable error envelope is
 *   `{ error: { code, message, retryAfter?, operationId? } }`; public
 *   messages are bilingual; internal detail, emails, IPs, tokens and
 *   third-party response bodies are never sent to the client.
 * - Auth and private responses are `private, no-store`.
 * - Writes reject cross-site `Origin`/`Host` mismatches. Browsers always
 *   send Origin on cross-site POSTs, so a missing Origin means a
 *   non-browser caller and is not a CSRF vector.
 * - Every route checks the cloud feature switch first and answers
 *   `cloud_disabled` while off — without initializing any cloud client.
 */

import { CloudConfigError, isCreationCloudEnabled } from './config';

export type CloudErrorCode =
  | 'cloud_disabled'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation_failed'
  | 'otp_invalid'
  | 'payload_too_large'
  | 'invalid_envelope'
  | 'formula_assets_not_publishable'
  | 'quota_exceeded'
  | 'revision_conflict'
  | 'idempotency_conflict'
  | 'account_deleting'
  | 'step_up_expired'
  | 'rate_limited'
  | 'formula_compile_failed'
  | 'formula_builtin_conflict'
  | 'unavailable';

const ERROR_STATUS: Record<CloudErrorCode, number> = {
  cloud_disabled: 403,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation_failed: 400,
  otp_invalid: 400,
  payload_too_large: 413,
  invalid_envelope: 422,
  formula_assets_not_publishable: 422,
  quota_exceeded: 422,
  revision_conflict: 409,
  idempotency_conflict: 409,
  account_deleting: 409,
  step_up_expired: 410,
  rate_limited: 429,
  formula_compile_failed: 422,
  formula_builtin_conflict: 422,
  unavailable: 503,
};

const ERROR_MESSAGES: Record<CloudErrorCode, { en: string; zh: string }> = {
  cloud_disabled: {
    en: 'Cloud creation is not available on this deployment.',
    zh: '当前部署未开放云端创作。',
  },
  unauthenticated: {
    en: 'Sign in to continue.',
    zh: '请先登录。',
  },
  forbidden: {
    en: 'This action is not allowed.',
    zh: '此操作不被允许。',
  },
  not_found: {
    en: 'Not found.',
    zh: '未找到。',
  },
  validation_failed: {
    en: 'The request could not be understood.',
    zh: '请求无法被理解。',
  },
  otp_invalid: {
    en: 'The code is wrong or has expired.',
    zh: '验证码错误或已过期。',
  },
  payload_too_large: {
    en: 'The request is too large.',
    zh: '请求过大。',
  },
  invalid_envelope: {
    en: 'The artwork data is not valid.',
    zh: '作品数据无效。',
  },
  formula_assets_not_publishable: {
    en: 'Artworks carrying portable formula source cannot be published.',
    zh: '携带便携公式源码的作品不能发布。',
  },
  quota_exceeded: {
    en: 'A cloud quota was reached.',
    zh: '已达到云端配额。',
  },
  revision_conflict: {
    en: 'The draft changed elsewhere; reload before saving.',
    zh: '草稿已在别处变更，请重新加载后再保存。',
  },
  idempotency_conflict: {
    en: 'A conflicting operation with the same key exists.',
    zh: '已存在相同键的冲突操作。',
  },
  rate_limited: {
    en: 'Too many requests. Try again later.',
    zh: '请求过于频繁，请稍后再试。',
  },
  unavailable: {
    en: 'A dependency is unavailable. Safe to retry later.',
    zh: '依赖服务暂不可用，稍后重试即可。',
  },
  account_deleting: {
    en: 'Account deletion is in progress. This account can no longer write or sign in.',
    zh: '账号删除正在进行中。该账号已无法写入或登录。',
  },
  step_up_expired: {
    en: 'The confirmation code session expired. Request a new code to continue.',
    zh: '验证码会话已过期，请重新获取验证码。',
  },
  formula_compile_failed: {
    en: 'The formula source could not be compiled.',
    zh: '公式源码无法编译。',
  },
  formula_builtin_conflict: {
    en: 'The formula identity conflicts with a built-in formula.',
    zh: '公式标识与内置公式冲突。',
  },
};

export class CloudApiError extends Error {
  readonly code: CloudErrorCode;
  readonly retryAfter?: number;

  constructor(code: CloudErrorCode, retryAfter?: number) {
    super(code);
    this.name = 'CloudApiError';
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function prefersChinese(request: Request): boolean {
  return (request.headers.get('accept-language') ?? '').toLowerCase().startsWith('zh');
}

function baseHeaders(): Headers {
  return new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store',
  });
}

/** JSON success response with the private, no-store cache contract. */
export function jsonOk(request: Request, body: unknown, status = 200, extraHeaders?: Headers): Response {
  const headers = baseHeaders();
  extraHeaders?.forEach((value, key) => headers.append(key, value));
  return new Response(JSON.stringify(body), { status, headers });
}

/** JSON error envelope; message locale follows Accept-Language. */
export function jsonError(request: Request, code: CloudErrorCode, retryAfter?: number): Response {
  const messages = ERROR_MESSAGES[code];
  const message = prefersChinese(request) ? messages.zh : messages.en;
  const error: { code: string; message: string; retryAfter?: number } = { code, message };
  if (retryAfter !== undefined) error.retryAfter = retryAfter;
  const headers = baseHeaders();
  if (code === 'rate_limited' && retryAfter !== undefined) {
    headers.set('retry-after', String(retryAfter));
  }
  return new Response(JSON.stringify({ error }), { status: ERROR_STATUS[code], headers });
}

/** 204 with the private, no-store contract (e.g. logout). */
export function emptyOk(extraHeaders?: Headers): Response {
  const headers = baseHeaders();
  extraHeaders?.forEach((value, key) => headers.append(key, value));
  return new Response(null, { status: 204, headers });
}

/**
 * Enforce the cross-site write guard: when an Origin header is present its
 * host must match the request Host. Browsers always send Origin on
 * cross-site POSTs; a missing Origin is a non-browser caller.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (!origin) return;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new CloudApiError('forbidden');
  }
  if (originHost !== request.headers.get('host')) {
    throw new CloudApiError('forbidden');
  }
}

export const AUTH_BODY_LIMIT_BYTES = 16 * 1024;

/**
 * Read a JSON body under the 16 KiB auth-write cap. Writes accept JSON only
 * (spec §5.1): a missing or non-JSON content type, oversized bodies,
 * malformed JSON, and non-object payloads all map to stable product errors.
 */
export async function readJsonBody(request: Request, limitBytes = AUTH_BODY_LIMIT_BYTES): Promise<Record<string, unknown>> {
  // Exact media type (parameters allowed), not a prefix: json-patch+json
  // and friends are not the auth contract.
  const contentType = (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (contentType !== 'application/json') {
    throw new CloudApiError('validation_failed');
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > limitBytes) {
    throw new CloudApiError('payload_too_large');
  }
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > limitBytes) {
    throw new CloudApiError('payload_too_large');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CloudApiError('validation_failed');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new CloudApiError('validation_failed');
  }
  return parsed as Record<string, unknown>;
}

/**
 * Map any thrown error to the stable envelope. CloudConfigError codes fold
 * into product codes: a disabled switch is `cloud_disabled`; incomplete or
 * invalid server configuration is `unavailable` (never echoed to clients).
 */
export function toErrorResponse(request: Request, error: unknown): Response {
  if (error instanceof CloudApiError) {
    return jsonError(request, error.code, error.retryAfter);
  }
  if (error instanceof CloudConfigError) {
    return jsonError(request, error.code === 'cloud_disabled' ? 'cloud_disabled' : 'unavailable');
  }
  return jsonError(request, 'unavailable');
}

/**
 * The feature-switch gate every cloud route runs first. While off it throws
 * before any cloud configuration is read, so no client is initialized.
 */
export function assertCloudEnabled(): void {
  if (!isCreationCloudEnabled()) {
    throw new CloudApiError('cloud_disabled');
  }
}
