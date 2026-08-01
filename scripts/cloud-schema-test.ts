/**
 * cloud-schema-test — database tests for the creation schema migration.
 * Contract: docs/specs/web-creation-loop-v1.md sections 4, 6, 7, 9, 10 and
 * docs/testing/v0.4.15-regression-matrix.md (schema/RLS/policy tests).
 *
 * Two layers against the LOCAL stack only:
 *
 * - SQL layer (docker exec psql): table/RLS/grant/index presence, CHECK
 *   constraints, frozen-field triggers, function security attributes,
 *   buckets and storage policies.
 * - API layer (PostgREST/Auth/Storage with real local keys): default-deny
 *   for anon and authenticated roles, RPC grant boundaries, rate-limit
 *   consume semantics, cleanup job lifecycle, storage read/write posture.
 *
 * Usage: npm run db:start && npm run db:test
 */

import { execFileSync } from 'node:child_process';

interface LocalKeys {
  apiUrl: string;
  anonKey: string;
  serviceKey: string;
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ok  ${name}`);
    })
    .catch((error: Error) => {
      failed += 1;
      failures.push(`${name}: ${error.message}`);
      console.error(`  FAIL ${name}: ${error.message}`);
    });
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function psql(sql: string): string {
  return execFileSync(
    'docker',
    [
      'exec',
      'supabase_db_fractalpark',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-tA',
      '-c',
      sql,
    ],
    { encoding: 'utf-8' },
  ).trim();
}

function psqlFails(sql: string, name: string): void {
  try {
    psql(sql);
  } catch {
    return;
  }
  throw new Error(`${name}: statement unexpectedly succeeded`);
}

function loadKeys(): LocalKeys {
  let out: string;
  try {
    out = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
      encoding: 'utf-8',
    });
  } catch {
    console.error(
      'Could not read local Supabase status. Start the stack first: npm run db:start',
    );
    process.exit(2);
  }
  const get = (name: string): string => {
    const match = out.match(new RegExp(`^${name}="(.*)"$`, 'm'));
    if (!match) throw new Error(`supabase status is missing ${name}`);
    return match[1];
  };
  return {
    apiUrl: get('API_URL'),
    anonKey: get('ANON_KEY'),
    serviceKey: get('SERVICE_ROLE_KEY'),
  };
}

async function rest(
  keys: LocalKeys,
  path: string,
  key: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${keys.apiUrl}${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

async function rpc(
  keys: LocalKeys,
  fn: string,
  key: string,
  body: Record<string, unknown> = {},
): Promise<Response> {
  return rest(keys, `/rest/v1/rpc/${fn}`, key, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function createUser(keys: LocalKeys, label: string): Promise<string> {
  const email = `schema-test-${label}-${Date.now()}@example.com`;
  const res = await rest(keys, '/auth/v1/admin/users', keys.serviceKey, {
    method: 'POST',
    body: JSON.stringify({ email, password: 'test-password-123', email_confirm: true }),
  });
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new Error(`admin create user ${label}: HTTP ${res.status}`);
  return body.id;
}

async function main(): Promise<void> {
  const keys = loadKeys();
  // SQL fixtures reference auth.users via FK; create two real users first.
  const OWNER_A = await createUser(keys, 'a');
  const OWNER_B = await createUser(keys, 'b');
  console.log('== SQL layer: structure, constraints, triggers, grants ==');

  await test('six tables exist with RLS enabled and forced', () => {
    const rows = psql(
      `select relname || ':' || relrowsecurity || ':' || relforcerowsecurity
       from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
       and relname in ('profiles','artwork_drafts','artwork_publications','artwork_operations','rate_limit_counters','resource_cleanup_jobs')
       order by relname`,
    ).split('\n');
    assert(rows.length === 6, `expected 6 tables, got ${rows.length}`);
    for (const row of rows) {
      assert(row.endsWith(':true:true'), `RLS not enabled+forced: ${row}`);
    }
  });

  await test('anon and authenticated hold no table privileges; service_role does', () => {
    for (const table of ['profiles', 'artwork_drafts', 'artwork_publications', 'artwork_operations', 'rate_limit_counters', 'resource_cleanup_jobs']) {
      assert(psql(`select has_table_privilege('anon', 'public.${table}', 'select')`) === 'f', `anon can select ${table}`);
      assert(psql(`select has_table_privilege('authenticated', 'public.${table}', 'insert')`) === 'f', `authenticated can insert ${table}`);
      assert(psql(`select has_table_privilege('service_role', 'public.${table}', 'select')`) === 't', `service_role cannot select ${table}`);
    }
  });

  await test('required indexes exist (spec section 9)', () => {
    const expected = [
      'artwork_drafts_owner_updated_idx',
      'artwork_publications_community_idx',
      'artwork_publications_owner_list_idx',
      'artwork_operations_owner_created_idx',
      'artwork_operations_retention_idx',
      'rate_limit_counters_window_idx',
      'resource_cleanup_jobs_claim_idx',
    ];
    const actual = psql(
      `select indexname from pg_indexes where schemaname = 'public' and indexname = any('{${expected.join(',')}}')`,
    ).split('\n');
    for (const name of expected) {
      assert(actual.includes(name), `missing index ${name}`);
    }
  });

  await test('constraint battery: drafts', () => {
    psqlFails(
      `insert into public.artwork_drafts (owner_id, title, envelope) values ('${OWNER_A}', '', '{}')`,
      'empty title',
    );
    psqlFails(
      `insert into public.artwork_drafts (owner_id, title, envelope) values ('${OWNER_A}', repeat('x', 81), '{}')`,
      'title over 80 chars',
    );
    psqlFails(
      `insert into public.artwork_drafts (owner_id, title, envelope, revision) values ('${OWNER_A}', 't', '{}', 0)`,
      'revision zero',
    );
    psqlFails(
      `insert into public.artwork_drafts (owner_id, title, envelope, config_bytes) values ('${OWNER_A}', 't', '{}', -1)`,
      'negative config_bytes',
    );
    psqlFails(
      `insert into public.artwork_drafts (owner_id, title, envelope, config_bytes) values ('${OWNER_A}', 't', '{}', 1048577)`,
      'config_bytes above 1 MiB',
    );
    psqlFails(
      `insert into public.artwork_drafts (owner_id, title, envelope, remix_source_type) values ('${OWNER_A}', 't', '{}', 'formula')`,
      'remix type without id',
    );
    psqlFails(
      `insert into public.artwork_drafts (owner_id, title, envelope) values ('${OWNER_A}', 't', '[]')`,
      'non-object envelope',
    );
  });

  await test('constraint battery: publications lifecycle coherence', () => {
    const base = `owner_id, author_display_name, title, envelope, rights_attestation_version, license_version, rights_attested_at`;
    const vals = `'${OWNER_A}', 'Author', 'T', '{}', 'v1', 'v1', now()`;
    psqlFails(
      `insert into public.artwork_publications (${base}, status, hidden_at) values (${vals}, 'published', now())`,
      'published with hidden_at',
    );
    psqlFails(
      `insert into public.artwork_publications (${base}, status) values (${vals}, 'hidden')`,
      'hidden without hidden_at',
    );
    psqlFails(
      `insert into public.artwork_publications (${base}, status, withdrawn_at) values (${vals}, 'withdrawn', now())`,
      'withdrawn with envelope present',
    );
    psqlFails(
      `insert into public.artwork_publications (${base}, license) values (${vals}, 'CC0')`,
      'license other than CC-BY-4.0',
    );
  });

  await test('constraint battery: operations, counters, cleanup jobs', () => {
    psql(
      `insert into public.artwork_operations (idempotency_key, owner_id, operation_type, request_hash)
       values ('11111111-1111-4111-8111-111111111111', '${OWNER_A}', 'save_draft', repeat('a', 64))`,
    );
    psqlFails(
      `insert into public.artwork_operations (idempotency_key, owner_id, operation_type, request_hash)
       values ('11111111-1111-4111-8111-111111111111', '${OWNER_A}', 'save_draft', repeat('b', 64))`,
      'duplicate (owner_id, idempotency_key)',
    );
    psqlFails(
      `insert into public.rate_limit_counters (policy_key, subject_hash, window_started_at, count)
       values ('otp_email_minute', repeat('c', 64), now(), -1)`,
      'negative counter',
    );
    psqlFails(
      `insert into public.resource_cleanup_jobs (resource_type, resource_key, status)
       values ('draft_thumbnail', 'x/y.webp', 'succeeded')`,
      'terminal cleanup job without completed_at',
    );
  });

  await test('frozen-field trigger: drafts', () => {
    psql(
      `insert into public.artwork_drafts (id, owner_id, title, envelope)
       values ('22222222-2222-4222-8222-222222222222', '${OWNER_A}', 'draft one', '{}')`,
    );
    psqlFails(
      `update public.artwork_drafts set owner_id = '${OWNER_B}' where id = '22222222-2222-4222-8222-222222222222'`,
      'owner reassignment',
    );
    psqlFails(
      `update public.artwork_drafts set remix_source_id = 'formula:x', remix_source_type = 'formula' where id = '22222222-2222-4222-8222-222222222222'`,
      'provenance rewrite',
    );
    psqlFails(
      `update public.artwork_drafts set revision = revision + 2 where id = '22222222-2222-4222-8222-222222222222'`,
      'revision jumping by two',
    );
    psql(
      `update public.artwork_drafts set title = 'draft one v2', revision = revision + 1 where id = '22222222-2222-4222-8222-222222222222'`,
    );
    const after = psql(
      `select title || ':' || revision from public.artwork_drafts where id = '22222222-2222-4222-8222-222222222222'`,
    );
    assert(after === 'draft one v2:2', `expected draft one v2:2, got ${after}`);
  });

  await test('frozen-field trigger: publications and the privileged flag', () => {
    psql(
      `insert into public.artwork_publications (id, owner_id, author_display_name, title, envelope, rights_attestation_version, license_version, rights_attested_at)
       values ('33333333-3333-4333-8333-333333333333', '${OWNER_A}', 'Author', 'Pub', '{}', 'v1', 'v1', now())`,
    );
    psqlFails(
      `update public.artwork_publications set title = 'renamed' where id = '33333333-3333-4333-8333-333333333333'`,
      'title rewrite',
    );
    psqlFails(
      `update public.artwork_publications set owner_id = null where id = '33333333-3333-4333-8333-333333333333'`,
      'owner nullify without flag',
    );
    psqlFails(
      `update public.artwork_publications set envelope = null where id = '33333333-3333-4333-8333-333333333333'`,
      'envelope clear without flag',
    );
    // Lifecycle updates stay allowed without the flag.
    psql(
      `update public.artwork_publications set status = 'hidden', hidden_at = now() where id = '33333333-3333-4333-8333-333333333333'`,
    );
    // Privileged withdrawal: clears content, nulls nothing else.
    psql(
      `begin; set local fractalpark.privileged_mutation = 'on';
       update public.artwork_publications
       set status = 'withdrawn', withdrawn_at = now(), envelope = null, description = null
       where id = '33333333-3333-4333-8333-333333333333'; commit;`,
    );
    const status = psql(
      `select status || ':' || coalesce(envelope::text, 'null') from public.artwork_publications where id = '33333333-3333-4333-8333-333333333333'`,
    );
    assert(status === 'withdrawn:null', `expected withdrawn:null, got ${status}`);
  });

  await test('frozen-field trigger: operations idempotency fields', () => {
    const op = psql(
      `select id from public.artwork_operations where owner_id = '${OWNER_A}' limit 1`,
    );
    psqlFails(
      `update public.artwork_operations set request_hash = repeat('z', 64) where id = '${op}'`,
      'request_hash rewrite',
    );
    psql(
      `update public.artwork_operations set status = 'succeeded', result_revision = 2 where id = '${op}'`,
    );
  });

  await test('function security attributes: definer set, search_path pinned', () => {
    const rows = psql(
      `select proname || ':' || prosecdef || ':' || coalesce(array_to_string(proconfig, ','), '')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and proname like 'fractalpark%' order by proname`,
    ).split('\n');
    const definerExpected = [
      'fractalpark_claim_cleanup_jobs',
      'fractalpark_complete_cleanup_job',
      'fractalpark_purge_expired_operations',
      'fractalpark_purge_rate_limit_counters',
      'fractalpark_rate_limit_consume',
    ];
    for (const row of rows) {
      const [name, secdef, config] = row.split(':');
      assert(config.includes('search_path='), `search_path not pinned on ${name}: ${config}`);
      if (definerExpected.includes(name)) {
        assert(secdef === 'true', `${name} should be security definer`);
      }
    }
  });

  await test('buckets and storage policies', () => {
    const buckets = psql(`select id || ':' || public from storage.buckets order by id`).split('\n');
    assert(buckets.includes('draft-thumbnails:false'), 'draft-thumbnails must be private');
    assert(buckets.includes('publication-thumbnails:true'), 'publication-thumbnails must be public');
    const policy = psql(
      `select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'publication_thumbnails_public_read'`,
    );
    assert(policy === '1', 'public read policy missing');
    const draftPolicies = psql(
      `select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname ilike '%draft%'`,
    );
    assert(draftPolicies === '0', 'draft-thumbnails must have no user-facing policies');
  });

  console.log('== API layer: roles, RPC grants, counters, cleanup, storage ==');

  await test('anon cannot select base tables', async () => {
    for (const table of ['artwork_drafts', 'artwork_publications', 'profiles', 'artwork_operations']) {
      const res = await rest(keys, `/rest/v1/${table}?select=*`, keys.anonKey);
      assert(res.status === 401 || res.status === 403, `anon select ${table}: expected 401/403, got ${res.status}`);
    }
  });

  await test('real authenticated user cannot select or insert base tables directly', async () => {
    const email = `schema-test-${Date.now()}@example.com`;
    const create = await rest(keys, '/auth/v1/admin/users', keys.serviceKey, {
      method: 'POST',
      body: JSON.stringify({ email, password: 'test-password-123', email_confirm: true }),
    });
    assert(create.status === 200, `admin create user: ${create.status}`);
    const token = await rest(keys, '/auth/v1/token?grant_type=password', keys.anonKey, {
      method: 'POST',
      body: JSON.stringify({ email, password: 'test-password-123' }),
    });
    const tokenBody = (await token.json()) as { access_token?: string };
    assert(tokenBody.access_token, 'password grant failed');
    const userKey = tokenBody.access_token!;
    const sel = await fetch(`${keys.apiUrl}/rest/v1/artwork_drafts?select=*`, {
      headers: { apikey: keys.anonKey, authorization: `Bearer ${userKey}` },
    });
    assert(sel.status === 401 || sel.status === 403, `user select: expected 401/403, got ${sel.status}`);
    const ins = await fetch(`${keys.apiUrl}/rest/v1/artwork_drafts`, {
      method: 'POST',
      headers: { apikey: keys.anonKey, authorization: `Bearer ${userKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x', envelope: {} }),
    });
    assert(ins.status === 401 || ins.status === 403, `user insert: expected 401/403, got ${ins.status}`);
  });

  await test('fractalpark_schema_version is callable by anon', async () => {
    const res = await rpc(keys, 'fractalpark_schema_version', keys.anonKey);
    assert(res.status === 200, `status ${res.status}`);
    const body = await res.json();
    assert(body === '20260802000000', `unexpected version ${body}`);
  });

  await test('rate_limit_consume: denied for anon, transactional for service', async () => {
    const denied = await rpc(keys, 'fractalpark_rate_limit_consume', keys.anonKey, {
      p_policy_key: 'otp_email_minute', p_subject_hash: 'x'.repeat(64), p_limit: 1, p_window_seconds: 60,
    });
    assert(denied.status === 401 || denied.status === 403, `anon consume: ${denied.status}`);

    const subject = `${Date.now()}`.padStart(64, '0');
    const call = () =>
      rpc(keys, 'fractalpark_rate_limit_consume', keys.serviceKey, {
        p_policy_key: 'otp_email_minute', p_subject_hash: subject, p_limit: 2, p_window_seconds: 60,
      }).then((r) => r.json() as Promise<Array<{ allowed: boolean; retry_after: number }>>);
    const first = await call();
    const second = await call();
    const third = await call();
    assert(first[0].allowed === true, 'first call should pass');
    assert(second[0].allowed === true, 'second call should pass');
    assert(third[0].allowed === false && third[0].retry_after > 0, `third call should be limited with retryAfter, got ${JSON.stringify(third[0])}`);
  });

  await test('cleanup job lifecycle: claim, complete success, retry, exhaust', async () => {
    const denied = await rpc(keys, 'fractalpark_claim_cleanup_jobs', keys.anonKey, { p_limit: 1 });
    assert(denied.status === 401 || denied.status === 403, `anon claim: ${denied.status}`);

    const insertJob = (suffix: string) =>
      rest(keys, '/rest/v1/resource_cleanup_jobs', keys.serviceKey, {
        method: 'POST',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify({
          resource_type: 'draft_thumbnail',
          resource_key: `test/${suffix}.webp`,
        }),
      }).then(async (r) => ((await r.json()) as Array<{ id: string }>)[0].id);

    const jobOk = await insertJob('ok');
    const claimed = (await (
      await rpc(keys, 'fractalpark_claim_cleanup_jobs', keys.serviceKey, { p_limit: 10 })
    ).json()) as Array<{ id: string; status: string; attempts: number }>;
    const mine = claimed.find((j) => j.id === jobOk);
    assert(mine && mine.status === 'processing' && mine.attempts === 1, `claim state wrong: ${JSON.stringify(mine)}`);
    const done = await rpc(keys, 'fractalpark_complete_cleanup_job', keys.serviceKey, {
      p_job_id: jobOk, p_success: true,
    });
    assert(done.status === 200 || done.status === 204, `complete success: ${done.status}`);

    const jobRetry = await insertJob('retry');
    await rpc(keys, 'fractalpark_claim_cleanup_jobs', keys.serviceKey, { p_limit: 10 });
    await rpc(keys, 'fractalpark_complete_cleanup_job', keys.serviceKey, {
      p_job_id: jobRetry, p_success: false, p_error_code: 'storage_timeout', p_max_attempts: 3,
    });
    const after = (await (
      await rest(keys, `/rest/v1/resource_cleanup_jobs?id=eq.${jobRetry}&select=status,attempts,next_attempt_at,error_code`, keys.serviceKey)
    ).json()) as Array<{ status: string; attempts: number; next_attempt_at: string; error_code: string }>;
    assert(after[0].status === 'pending' && after[0].error_code === 'storage_timeout', `retry state wrong: ${JSON.stringify(after[0])}`);
    assert(new Date(after[0].next_attempt_at).getTime() > Date.now() + 60_000, 'backoff not in the future');

    await rest(keys, `/rest/v1/resource_cleanup_jobs?id=eq.${jobRetry}`, keys.serviceKey, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'processing', attempts: 3, next_attempt_at: new Date().toISOString(), completed_at: null }),
    });
    await rpc(keys, 'fractalpark_complete_cleanup_job', keys.serviceKey, {
      p_job_id: jobRetry, p_success: false, p_error_code: 'storage_timeout', p_max_attempts: 3,
    });
    const exhausted = (await (
      await rest(keys, `/rest/v1/resource_cleanup_jobs?id=eq.${jobRetry}&select=status,completed_at`, keys.serviceKey)
    ).json()) as Array<{ status: string; completed_at: string | null }>;
    assert(exhausted[0].status === 'failed' && exhausted[0].completed_at !== null, `exhaust state wrong: ${JSON.stringify(exhausted[0])}`);
  });

  await test('storage posture: public read, server-only write, private draft bucket', async () => {
    const body = new Blob(['schema-test'], { type: 'text/plain' });
    const pubPath = `test/pub-${Date.now()}.txt`;
    const writeAnon = await fetch(`${keys.apiUrl}/storage/v1/object/publication-thumbnails/${pubPath}`, {
      method: 'POST',
      headers: { apikey: keys.anonKey, authorization: `Bearer ${keys.anonKey}` },
      body,
    });
    assert(writeAnon.status === 400 || writeAnon.status === 401 || writeAnon.status === 403, `anon write public bucket: ${writeAnon.status}`);

    const writeService = await fetch(`${keys.apiUrl}/storage/v1/object/publication-thumbnails/${pubPath}`, {
      method: 'POST',
      headers: { apikey: keys.serviceKey, authorization: `Bearer ${keys.serviceKey}` },
      body,
    });
    assert(writeService.status === 200, `service write public bucket: ${writeService.status}`);
    const readAnon = await fetch(`${keys.apiUrl}/storage/v1/object/public/publication-thumbnails/${pubPath}`);
    assert(readAnon.status === 200, `anon read public bucket: ${readAnon.status}`);

    const draftPath = `test/draft-${Date.now()}.txt`;
    const writeDraft = await fetch(`${keys.apiUrl}/storage/v1/object/draft-thumbnails/${draftPath}`, {
      method: 'POST',
      headers: { apikey: keys.serviceKey, authorization: `Bearer ${keys.serviceKey}` },
      body,
    });
    assert(writeDraft.status === 200, `service write draft bucket: ${writeDraft.status}`);
    const readDraft = await fetch(`${keys.apiUrl}/storage/v1/object/draft-thumbnails/${draftPath}`, {
      headers: { apikey: keys.anonKey, authorization: `Bearer ${keys.anonKey}` },
    });
    assert(readDraft.status === 400 || readDraft.status === 401 || readDraft.status === 403 || readDraft.status === 404, `anon read draft bucket: ${readDraft.status}`);
  });

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
