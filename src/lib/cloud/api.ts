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

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/i18n/supported-locales';
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

const ERROR_MESSAGES: Record<CloudErrorCode, Record<string, string>> = {
  cloud_disabled: {
    en: 'Cloud creation is not available on this deployment.',
    zh: '当前部署未开放云端创作。',
    pt: 'A criação na nuvem não está disponível nesta implantação.',
    ko: '이 배포에서는 클라우드 생성을 사용할 수 없습니다.',
    ru: 'Облачное создание недоступно в этом развёртывании.',
    es: 'La creación en la nube no está disponible en esta implementación.',
    fr: 'La création dans le cloud n\'est pas disponible sur ce déploiement.',
  },
  unauthenticated: {
    en: 'Sign in to continue.',
    zh: '请先登录。',
    pt: 'Entre para continuar.',
    ko: '계속하려면 로그인하세요.',
    ru: 'Войдите, чтобы продолжить.',
    es: 'Inicia sesión para continuar.',
    fr: 'Connectez-vous pour continuer.',
  },
  forbidden: {
    en: 'This action is not allowed.',
    zh: '此操作不被允许。',
    pt: 'Esta ação não é permitida.',
    ko: '이 작업은 허용되지 않습니다.',
    ru: 'Это действие не разрешено.',
    es: 'Esta acción no está permitida.',
    fr: 'Cette action n\'est pas autorisée.',
  },
  not_found: {
    en: 'Not found.',
    zh: '未找到。',
    pt: 'Não encontrado.',
    ko: '찾을 수 없습니다.',
    ru: 'Не найдено.',
    es: 'No encontrado.',
    fr: 'Introuvable.',
  },
  validation_failed: {
    en: 'The request could not be understood.',
    zh: '请求无法被理解。',
    pt: 'A solicitação não pôde ser compreendida.',
    ko: '요청을 이해할 수 없습니다.',
    ru: 'Запрос не может быть понят.',
    es: 'La solicitud no pudo ser entendida.',
    fr: 'La requête n\'a pas pu être comprise.',
  },
  otp_invalid: {
    en: 'The code is wrong or has expired.',
    zh: '验证码错误或已过期。',
    pt: 'O código está errado ou expirou.',
    ko: '코드가 잘못되었거나 만료되었습니다.',
    ru: 'Код неверен или истёк.',
    es: 'El código es incorrecto o ha expirado.',
    fr: 'Le code est incorrect ou a expiré.',
  },
  payload_too_large: {
    en: 'The request is too large.',
    zh: '请求过大。',
    pt: 'A solicitação é muito grande.',
    ko: '요청이 너무 큽니다.',
    ru: 'Запрос слишком велик.',
    es: 'La solicitud es demasiado grande.',
    fr: 'La requête est trop volumineuse.',
  },
  invalid_envelope: {
    en: 'The artwork data is not valid.',
    zh: '作品数据无效。',
    pt: 'Os dados da obra não são válidos.',
    ko: '작품 데이터가 유효하지 않습니다.',
    ru: 'Данные произведения недействительны.',
    es: 'Los datos de la obra no son válidos.',
    fr: 'Les données de l\'œuvre ne sont pas valides.',
  },
  quota_exceeded: {
    en: 'A cloud quota was reached.',
    zh: '已达到云端配额。',
    pt: 'Uma cota da nuvem foi atingida.',
    ko: '클라우드 할당량에 도달했습니다.',
    ru: 'Достигнута облачная квота.',
    es: 'Se alcanzó una cuota de la nube.',
    fr: 'Un quota cloud a été atteint.',
  },
  revision_conflict: {
    en: 'The draft changed elsewhere; reload before saving.',
    zh: '草稿已在别处变更，请重新加载后再保存。',
    pt: 'O rascunho foi alterado em outro lugar; recarregue antes de salvar.',
    ko: '초안이 다른 곳에서 변경되었습니다. 저장하기 전에 다시 로드하세요.',
    ru: 'Черновик был изменён в другом месте; перезагрузите перед сохранением.',
    es: 'El borrador cambió en otro lugar; recarga antes de guardar.',
    fr: 'Le brouillon a été modifié ailleurs ; rechargez avant de sauvegarder.',
  },
  idempotency_conflict: {
    en: 'A conflicting operation with the same key exists.',
    zh: '已存在相同键的冲突操作。',
    pt: 'Existe uma operação conflitante com a mesma chave.',
    ko: '동일한 키를 가진 충돌하는 작업이 존재합니다.',
    ru: 'Существует конфликтующая операция с тем же ключом.',
    es: 'Existe una operación conflictiva con la misma clave.',
    fr: 'Une opération conflictuelle avec la même clé existe.',
  },
  rate_limited: {
    en: 'Too many requests. Try again later.',
    zh: '请求过于频繁，请稍后再试。',
    pt: 'Muitas solicitações. Tente novamente mais tarde.',
    ko: '요청이 너무 많습니다. 나중에 다시 시도하세요.',
    ru: 'Слишком много запросов. Попробуйте позже.',
    es: 'Demasiadas solicitudes. Inténtalo de nuevo más tarde.',
    fr: 'Trop de requêtes. Réessayez plus tard.',
  },
  unavailable: {
    en: 'A dependency is unavailable. Safe to retry later.',
    zh: '依赖服务暂不可用，稍后重试即可。',
    pt: 'Uma dependência está indisponível. Seguro tentar novamente mais tarde.',
    ko: '종속성을 사용할 수 없습니다. 나중에 다시 시도해도 안전합니다.',
    ru: 'Зависимость недоступна. Безопасно повторить позже.',
    es: 'Una dependencia no está disponible. Es seguro reintentar más tarde.',
    fr: 'Une dépendance est indisponible. Il est sûr de réessayer plus tard.',
  },
  account_deleting: {
    en: 'Account deletion is in progress. This account can no longer write or sign in.',
    zh: '账号删除正在进行中。该账号已无法写入或登录。',
    pt: 'A exclusão da conta está em andamento. Esta conta não pode mais escrever ou entrar.',
    ko: '계정 삭제가 진행 중입니다. 이 계정은 더 이상 쓰거나 로그인할 수 없습니다.',
    ru: 'Удаление аккаунта в процессе. Этот аккаунт больше не может писать или входить.',
    es: 'La eliminación de la cuenta está en progreso. Esta cuenta ya no puede escribir ni iniciar sesión.',
    fr: 'La suppression du compte est en cours. Ce compte ne peut plus écrire ni se connecter.',
  },
  step_up_expired: {
    en: 'The confirmation code session expired. Request a new code to continue.',
    zh: '验证码会话已过期，请重新获取验证码。',
    pt: 'A sessão do código de confirmação expirou. Solicite um novo código para continuar.',
    ko: '확인 코드 세션이 만료되었습니다. 계속하려면 새 코드를 요청하세요.',
    ru: 'Сессия кода подтверждения истекла. Запросите новый код, чтобы продолжить.',
    es: 'La sesión del código de confirmación expiró. Solicita un nuevo código para continuar.',
    fr: 'La session du code de confirmation a expiré. Demandez un nouveau code pour continuer.',
  },
  formula_compile_failed: {
    en: 'The formula source could not be compiled.',
    zh: '公式源码无法编译。',
    pt: 'A fonte da fórmula não pôde ser compilada.',
    ko: '수식 소스를 컴파일할 수 없습니다.',
    ru: 'Исходный код формулы не может быть скомпилирован.',
    es: 'El código fuente de la fórmula no pudo ser compilado.',
    fr: 'Le code source de la formule n\'a pas pu être compilé.',
  },
  formula_builtin_conflict: {
    en: 'The formula identity conflicts with a built-in formula.',
    zh: '公式标识与内置公式冲突。',
    pt: 'A identidade da fórmula conflita com uma fórmula integrada.',
    ko: '수식 ID가 내장 수식과 충돌합니다.',
    ru: 'Идентификатор формулы конфликтует с встроенной формулой.',
    es: 'La identidad de la fórmula entra en conflicto con una fórmula integrada.',
    fr: 'L\'identité de la formule entre en conflit avec une formule intégrée.',
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

function resolveLocale(request: Request): string {
  const acceptLanguage = (request.headers.get('accept-language') ?? '').toLowerCase();
  for (const locale of SUPPORTED_LOCALES) {
    if (acceptLanguage.startsWith(locale)) {
      return locale;
    }
  }
  return DEFAULT_LOCALE;
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
  const locale = resolveLocale(request);
  const message = messages[locale] ?? messages[DEFAULT_LOCALE];
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
