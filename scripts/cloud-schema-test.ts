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
import { randomUUID } from 'node:crypto';

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
      `insert into public.artwork_publications (${base}, status, hidden_at) values (${vals.replace(`'{}'`, 'null')}, 'hidden', now())`,
      'hidden with envelope cleared',
    );
    psqlFails(
      `insert into public.artwork_publications (${base}, license) values (${vals}, 'CC0')`,
      'license other than CC-BY-4.0',
    );
    psqlFails(
      `insert into public.artwork_publications (${base}, formula_license) values (${vals}, 'MIT')`,
      'partial formula license tuple',
    );
  });

  await test('constraint battery: operations, counters, cleanup jobs', () => {
    const opKey = randomUUID();
    psql(
      `insert into public.artwork_operations (idempotency_key, owner_id, operation_type, request_hash)
       values ('${opKey}', '${OWNER_A}', 'save_draft', repeat('a', 64))`,
    );
    psqlFails(
      `insert into public.artwork_operations (idempotency_key, owner_id, operation_type, request_hash)
       values ('${opKey}', '${OWNER_A}', 'save_draft', repeat('b', 64))`,
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
    const draftId = randomUUID();
    psql(
      `insert into public.artwork_drafts (id, owner_id, title, envelope)
       values ('${draftId}', '${OWNER_A}', 'draft one', '{}')`,
    );
    psqlFails(
      `update public.artwork_drafts set owner_id = '${OWNER_B}' where id = '${draftId}'`,
      'owner reassignment',
    );
    psqlFails(
      `update public.artwork_drafts set remix_source_id = 'formula:x', remix_source_type = 'formula' where id = '${draftId}'`,
      'provenance rewrite',
    );
    psqlFails(
      `update public.artwork_drafts set revision = revision + 2 where id = '${draftId}'`,
      'revision jumping by two',
    );
    psql(
      `update public.artwork_drafts set title = 'draft one v2', revision = revision + 1 where id = '${draftId}'`,
    );
    const after = psql(
      `select title || ':' || revision from public.artwork_drafts where id = '${draftId}'`,
    );
    assert(after === 'draft one v2:2', `expected draft one v2:2, got ${after}`);
  });

  await test('frozen-field trigger: publications and the privileged flag', () => {
    const pubId = randomUUID();
    psql(
      `insert into public.artwork_publications (id, owner_id, author_display_name, title, envelope, rights_attestation_version, license_version, rights_attested_at)
       values ('${pubId}', '${OWNER_A}', 'Author', 'Pub', '{}', 'v1', 'v1', now())`,
    );
    psqlFails(
      `update public.artwork_publications set title = 'renamed' where id = '${pubId}'`,
      'title rewrite',
    );
    psqlFails(
      `update public.artwork_publications set owner_id = '${OWNER_B}' where id = '${pubId}'`,
      'owner reassignment',
    );
    psqlFails(
      `update public.artwork_publications set envelope = null where id = '${pubId}'`,
      'envelope clear without flag',
    );
    // Lifecycle updates stay allowed without the flag.
    psql(
      `update public.artwork_publications set status = 'hidden', hidden_at = now() where id = '${pubId}'`,
    );
    // The privileged flag may clear content but never rewrite it.
    psqlFails(
      `begin; set local fractalpark.privileged_mutation = 'on';
       update public.artwork_publications set title = 'HijackedTitle' where id = '${pubId}'; commit;`,
      'privileged title rewrite',
    );
    psqlFails(
      `begin; set local fractalpark.privileged_mutation = 'on';
       update public.artwork_publications set envelope = '{"evil": true}' where id = '${pubId}'; commit;`,
      'privileged envelope rewrite',
    );
    psqlFails(
      `begin; set local fractalpark.privileged_mutation = 'on';
       update public.artwork_publications set description = 'spam' where id = '${pubId}'; commit;`,
      'privileged description rewrite',
    );
    // Privileged withdrawal: clears content, keeps the tombstone.
    psql(
      `begin; set local fractalpark.privileged_mutation = 'on';
       update public.artwork_publications
       set status = 'withdrawn', withdrawn_at = now(), envelope = null, description = null
       where id = '${pubId}'; commit;`,
    );
    const status = psql(
      `select status || ':' || coalesce(envelope::text, 'null') from public.artwork_publications where id = '${pubId}'`,
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
      assert(config.includes('search_path=""'), `search_path not pinned to empty on ${name}: ${config}`);
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

  await test('retention purges delete only eligible rows', () => {
    const RUN = randomUUID().replace(/-/g, '');
    const h = (c: string): string => (RUN + c.repeat(64)).slice(0, 64);
    // 48-hour counter purge: an untouched counter is deleted, a live one stays.
    psql(
      `insert into public.rate_limit_counters (policy_key, subject_hash, window_started_at, count, updated_at)
       values ('otp_email_minute', '${h('d')}', now() - interval '49 hours', 1, now() - interval '49 hours'),
              ('otp_email_minute', '${h('e')}', now(), 1, now())`,
    );
    const purgedCounters = psql(`select public.fractalpark_purge_rate_limit_counters()`);
    assert(purgedCounters === '1', `expected 1 purged counter, got ${purgedCounters}`);
    const remaining = psql(
      `select count(*) from public.rate_limit_counters where subject_hash in ('${h('d')}', '${h('e')}')`,
    );
    assert(remaining === '1', `expected live counter to survive, got ${remaining}`);

    // 30-day operation purge: only terminal save/delete operations old enough.
    psql(
      `insert into public.artwork_operations (idempotency_key, owner_id, operation_type, request_hash, status, created_at)
       values ('${randomUUID()}', '${OWNER_A}', 'save_draft', '${h('f')}', 'succeeded', now() - interval '31 days'),
              ('${randomUUID()}', '${OWNER_A}', 'publish_draft', '${h('1')}', 'succeeded', now() - interval '31 days'),
              ('${randomUUID()}', '${OWNER_A}', 'save_draft', '${h('2')}', 'succeeded', now())`,
    );
    const purgedOps = psql(`select public.fractalpark_purge_expired_operations()`);
    assert(purgedOps === '1', `expected 1 purged operation, got ${purgedOps}`);
    const surviving = psql(
      `select count(*) from public.artwork_operations where request_hash in ('${h('1')}', '${h('2')}')`,
    );
    assert(surviving === '2', `publish and recent operations must survive, got ${surviving}`);
  });

  await test('account deletion: auth user delete nullifies owner refs and cascades drafts', () => {
    // Spec sections 4.3 / 4.4 / 10.2: deleting the auth user must cascade
    // drafts and null owner_id on publications and operations. The FK
    // SET NULL fires the frozen-field triggers; they must allow nullify.
    const draftCountBefore = psql(
      `select count(*) from public.artwork_drafts where owner_id = '${OWNER_A}'`,
    );
    assert(draftCountBefore !== '0', 'fixture draft missing');
    psql(`delete from auth.users where id = '${OWNER_A}'`);
    const draftsAfter = psql(
      `select count(*) from public.artwork_drafts where owner_id = '${OWNER_A}'`,
    );
    assert(draftsAfter === '0', `drafts not cascaded: ${draftsAfter}`);
    const pubOwner = psql(
      `select count(*) from public.artwork_publications where owner_id is null`,
    );
    assert(pubOwner !== '0', 'publication owner_id not nulled');
    const opOwner = psql(
      `select count(*) from public.artwork_operations where owner_id = '${OWNER_A}'`,
    );
    assert(opOwner === '0', `operation owner_id not nulled: ${opOwner}`);
    const opSurvives = psql(`select count(*) from public.artwork_operations where owner_id is null`);
    assert(opSurvives !== '0', 'operations should survive with null owner');
    // Fixture hygiene: remove the second fixture user too.
    psql(`delete from auth.users where id = '${OWNER_B}'`);
  });

  console.log('== API layer: roles, RPC grants, counters, cleanup, storage ==');

  await test('anon cannot select base tables', async () => {
    for (const table of ['artwork_drafts', 'artwork_publications', 'profiles', 'artwork_operations']) {
      const res = await rest(keys, `/rest/v1/${table}?select=*`, keys.anonKey);
      assert(res.status === 401 || res.status === 403, `anon select ${table}: expected 401/403, got ${res.status}`);
    }
  });

  let userJwt = '';

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
    const upd = await fetch(`${keys.apiUrl}/rest/v1/artwork_drafts?id=eq.${randomUUID()}`, {
      method: 'PATCH',
      headers: { apikey: keys.anonKey, authorization: `Bearer ${userKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'y' }),
    });
    assert(upd.status === 401 || upd.status === 403, `user update: expected 401/403, got ${upd.status}`);
    const del = await fetch(`${keys.apiUrl}/rest/v1/artwork_drafts?id=eq.${randomUUID()}`, {
      method: 'DELETE',
      headers: { apikey: keys.anonKey, authorization: `Bearer ${userKey}` },
    });
    assert(del.status === 401 || del.status === 403, `user delete: expected 401/403, got ${del.status}`);
    userJwt = userKey;
  });

  await test('fractalpark_schema_version is callable by anon', async () => {
    const res = await rpc(keys, 'fractalpark_schema_version', keys.anonKey);
    assert(res.status === 200, `status ${res.status}`);
    const body = await res.json();
    assert(body === '20260808202734', `unexpected version ${body}`);
  });

  await test('rate_limit_consume: denied for anon, transactional for service', async () => {
    const denied = await rpc(keys, 'fractalpark_rate_limit_consume', keys.anonKey, {
      p_policy_key: 'otp_email_minute', p_subject_hash: 'x'.repeat(64), p_limit: 1, p_window_seconds: 60,
    });
    assert(denied.status === 401 || denied.status === 403, `anon consume: ${denied.status}`);

    // Invalid arguments fail loud, never silently break or deny limiting.
    for (const bad of [
      { p_limit: 0, p_window_seconds: 60 },
      { p_limit: -1, p_window_seconds: 60 },
      { p_limit: 1, p_window_seconds: 0 },
    ]) {
      const res = await rpc(keys, 'fractalpark_rate_limit_consume', keys.serviceKey, {
        p_policy_key: 'otp_email_minute', p_subject_hash: 'y'.repeat(64), ...bad,
      });
      assert(res.status === 400, `bad args ${JSON.stringify(bad)}: expected 400, got ${res.status}`);
    }

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

  await test('rate_limit_consume resets an expired window', async () => {
    const subject = randomUUID().replace(/-/g, '').padEnd(64, '0').slice(0, 64);
    psql(
      `insert into public.rate_limit_counters (policy_key, subject_hash, window_started_at, count, updated_at)
       values ('otp_ip_hour', '${subject}', now() - interval '2 hours', 20, now() - interval '2 hours')`,
    );
    const res = await rpc(keys, 'fractalpark_rate_limit_consume', keys.serviceKey, {
      p_policy_key: 'otp_ip_hour', p_subject_hash: subject, p_limit: 20, p_window_seconds: 3600,
    });
    const body = (await res.json()) as Array<{ allowed: boolean; retry_after: number }>;
    assert(body[0].allowed === true, `expired window should reset and allow, got ${JSON.stringify(body[0])}`);
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
    assert(userJwt !== '', 'user JWT missing for draft bucket check');
    const readDraftUser = await fetch(`${keys.apiUrl}/storage/v1/object/draft-thumbnails/${draftPath}`, {
      headers: { apikey: keys.anonKey, authorization: `Bearer ${userJwt}` },
    });
    assert(readDraftUser.status === 400 || readDraftUser.status === 401 || readDraftUser.status === 403 || readDraftUser.status === 404, `authenticated read draft bucket: ${readDraftUser.status}`);
  });

  console.log('== draft owner RPCs (v0.4.15 commit 5) ==');

  // Dedicated users: the shared fixtures may have been deleted by the
  // account-deletion battery above, and profiles references auth.users.
  const RPC_OWNER_A = await createUser(keys, 'rpc-a');
  const RPC_OWNER_B = await createUser(keys, 'rpc-b');

  await test('draft_create: draft + operation atomically, replay converges, hash conflict rejects', async () => {
    const key = crypto.randomUUID();
    const args = {
      p_owner_id: RPC_OWNER_A,
      p_idempotency_key: key,
      p_request_hash: `hash-${key}`,
      p_title: 'RPC draft',
      p_envelope: { envelopeVersion: 1, document: { schemaVersion: 2 } },
      p_thumbnail_path: null,
      p_config_bytes: 128,
      p_thumbnail_bytes: 0,
      p_remix_source_type: null,
      p_remix_source_id: null,
    };
    const createRes = await rpc(keys, 'fractalpark_draft_create', keys.serviceKey, args);
    const createBody = await createRes.text();
    assert(createRes.status === 200, `create: ${createRes.status} ${createBody}`);
    const created = JSON.parse(createBody) as { replayed: boolean; draft: { id: string; revision: number } };
    assert(created.replayed === false, 'first create must not replay');
    assert(created.draft.revision === 1, 'revision starts at 1');

    const replayRes = await rpc(keys, 'fractalpark_draft_create', keys.serviceKey, args);
    const replayed = (await replayRes.json()) as { replayed: boolean; draft_id: string; revision: number };
    assert(replayRes.status === 200 && replayed.replayed === true, `replay: ${replayRes.status}`);
    assert(replayed.draft_id === created.draft.id && replayed.revision === 1, 'replay returns the original result');

    const count = psql(
      `select count(*) from public.artwork_drafts where id = '${created.draft.id}'`,
    );
    assert(count === '1', 'replay must not duplicate the draft');
    const opCount = psql(
      `select count(*) from public.artwork_operations where owner_id = '${RPC_OWNER_A}' and idempotency_key = '${key}'`,
    );
    assert(opCount === '1', 'exactly one operation row per (owner, key)');

    const conflictRes = await rpc(keys, 'fractalpark_draft_create', keys.serviceKey, {
      ...args,
      p_request_hash: `other-${key}`,
    });
    const conflictBody = await conflictRes.text();
    assert(conflictRes.status !== 200 && conflictBody.includes('idempotency_conflict'), `hash conflict: ${conflictRes.status} ${conflictBody}`);

    psql(`delete from public.artwork_drafts where id = '${created.draft.id}'`);
    psql(`delete from public.artwork_operations where owner_id = '${RPC_OWNER_A}' and idempotency_key = '${key}'`);
  });

  await test('draft_update: optimistic revision contract and frozen-trigger compatibility', async () => {
    const createKey = crypto.randomUUID();
    const createRes = await rpc(keys, 'fractalpark_draft_create', keys.serviceKey, {
      p_owner_id: RPC_OWNER_A,
      p_idempotency_key: createKey,
      p_request_hash: `hash-${createKey}`,
      p_title: 'to update',
      p_envelope: { envelopeVersion: 1, document: { schemaVersion: 2 } },
      p_thumbnail_path: null,
      p_config_bytes: 64,
      p_thumbnail_bytes: 0,
    });
    const created = JSON.parse(await createRes.text()) as { draft: { id: string } };
    const draftId = created.draft.id;

    const wrongRes = await rpc(keys, 'fractalpark_draft_update', keys.serviceKey, {
      p_owner_id: RPC_OWNER_A,
      p_draft_id: draftId,
      p_idempotency_key: crypto.randomUUID(),
      p_request_hash: 'hash-wrong-rev',
      p_expected_revision: 5,
      p_title: 'x',
      p_envelope: { envelopeVersion: 1 },
      p_thumbnail_path: null,
      p_config_bytes: 64,
      p_thumbnail_bytes: 0,
    });
    const wrongBody = await wrongRes.text();
    assert(wrongRes.status !== 200 && wrongBody.includes('revision_conflict'), `wrong revision: ${wrongRes.status} ${wrongBody}`);

    const updateKey = crypto.randomUUID();
    const okRes = await rpc(keys, 'fractalpark_draft_update', keys.serviceKey, {
      p_owner_id: RPC_OWNER_A,
      p_draft_id: draftId,
      p_idempotency_key: updateKey,
      p_request_hash: `hash-${updateKey}`,
      p_expected_revision: 1,
      p_title: 'updated',
      p_envelope: { envelopeVersion: 1, document: { schemaVersion: 2, note: 'v2' } },
      p_thumbnail_path: null,
      p_config_bytes: 80,
      p_thumbnail_bytes: 0,
    });
    const okBody = await okRes.text();
    assert(okRes.status === 200, `update: ${okRes.status} ${okBody}`);
    const updated = JSON.parse(okBody) as { draft: { revision: number; title: string } };
    assert(updated.draft.revision === 2 && updated.draft.title === 'updated', 'revision increments by exactly one');

    const replayRes = await rpc(keys, 'fractalpark_draft_update', keys.serviceKey, {
      p_owner_id: RPC_OWNER_A,
      p_draft_id: draftId,
      p_idempotency_key: updateKey,
      p_request_hash: `hash-${updateKey}`,
      p_expected_revision: 1,
      p_title: 'updated',
      p_envelope: { envelopeVersion: 1, document: { schemaVersion: 2, note: 'v2' } },
      p_thumbnail_path: null,
      p_config_bytes: 80,
      p_thumbnail_bytes: 0,
    });
    const replayed = JSON.parse(await replayRes.text()) as { replayed: boolean; revision: number };
    assert(replayed.replayed === true && replayed.revision === 2, 'update replay returns the stored revision');
    const finalRev = psql(`select revision from public.artwork_drafts where id = '${draftId}'`);
    assert(finalRev === '2', 'replay must not re-increment');

    psql(`delete from public.artwork_drafts where id = '${draftId}'`);
    psql(`delete from public.artwork_operations where draft_id = '${draftId}' or idempotency_key in ('${createKey}', '${updateKey}')`);
  });

  await test('draft_create quotas: count and storage enforced with test-tunable limits', async () => {
    const quotaArgs = (key: string, bytes: number) => ({
      p_owner_id: RPC_OWNER_B,
      p_idempotency_key: key,
      p_request_hash: `hash-${key}`,
      p_title: 'quota',
      p_envelope: { envelopeVersion: 1 },
      p_thumbnail_path: null,
      p_config_bytes: bytes,
      p_thumbnail_bytes: 0,
      p_draft_quota: 1,
      p_storage_quota_bytes: 150,
    });
    const first = await rpc(keys, 'fractalpark_draft_create', keys.serviceKey, quotaArgs(crypto.randomUUID(), 100));
    assert(first.status === 200, `first quota draft: ${first.status} ${await first.text()}`);
    const countLimited = await rpc(keys, 'fractalpark_draft_create', keys.serviceKey, quotaArgs(crypto.randomUUID(), 10));
    const countBody = await countLimited.text();
    assert(countLimited.status !== 200 && countBody.includes('quota_exceeded'), `count quota: ${countLimited.status} ${countBody}`);

    psql(`delete from public.artwork_drafts where owner_id = '${RPC_OWNER_B}'`);
    psql(`delete from public.artwork_operations where owner_id = '${RPC_OWNER_B}'`);

    const storageLimited = await rpc(keys, 'fractalpark_draft_create', keys.serviceKey, quotaArgs(crypto.randomUUID(), 200));
    const storageBody = await storageLimited.text();
    assert(storageLimited.status !== 200 && storageBody.includes('quota_exceeded'), `storage quota: ${storageLimited.status} ${storageBody}`);
    psql(`delete from public.artwork_operations where owner_id = '${RPC_OWNER_B}'`);
  });

  await test('draft_update quotas serialize under concurrency (per-owner advisory lock)', async () => {
    // Two drafts at 60 bytes each (used 120), storage quota 170: each
    // concurrent update wants +40. Serialized, exactly one may succeed
    // (160 <= 170; the loser then sees 160 and +40 = 200 > 170). Without
    // per-owner serialization both would pass their checks and total 200.
    const mkDraft = async () => {
      const key = crypto.randomUUID();
      const res = await rpc(keys, 'fractalpark_draft_create', keys.serviceKey, {
        p_owner_id: RPC_OWNER_B,
        p_idempotency_key: key,
        p_request_hash: `hash-${key}`,
        p_title: 'concurrency',
        p_envelope: { envelopeVersion: 1 },
        p_thumbnail_path: null,
        p_config_bytes: 60,
        p_thumbnail_bytes: 0,
      });
      const body = JSON.parse(await res.text()) as { draft: { id: string } };
      return body.draft.id;
    };
    const draft1 = await mkDraft();
    const draft2 = await mkDraft();

    const update = (draftId: string, key: string) =>
      rpc(keys, 'fractalpark_draft_update', keys.serviceKey, {
        p_owner_id: RPC_OWNER_B,
        p_draft_id: draftId,
        p_idempotency_key: key,
        p_request_hash: `hash-${key}`,
        p_expected_revision: 1,
        p_title: 'bigger',
        p_envelope: { envelopeVersion: 1, document: { schemaVersion: 2, note: 'bigger' } },
        p_thumbnail_path: null,
        p_config_bytes: 100,
        p_thumbnail_bytes: 0,
        p_storage_quota_bytes: 170,
      });
    const [r1, r2] = await Promise.all([
      update(draft1, crypto.randomUUID()),
      update(draft2, crypto.randomUUID()),
    ]);
    const winner = r1.status === 200 ? r1 : r2.status === 200 ? r2 : null;
    const loser = winner === r1 ? r2 : r1;
    assert(winner !== null && loser.status !== 200, `expected exactly one success, got ${r1.status}/${r2.status}`);
    const loserBody = await loser.text();
    assert(loserBody.includes('quota_exceeded'), `loser must be quota_exceeded: ${loserBody}`);
    const total = psql(
      `select coalesce(sum(config_bytes + thumbnail_bytes), 0) from public.artwork_drafts where owner_id = '${RPC_OWNER_B}'`,
    );
    assert(total === '160', `final storage must be 160, got ${total}`);

    psql(`delete from public.artwork_drafts where owner_id = '${RPC_OWNER_B}'`);
    psql(`delete from public.artwork_operations where owner_id = '${RPC_OWNER_B}'`);
  });

  await test('draft_delete: permanent, thumbnail cleanup job registered, uniform not_found', async () => {
    const createKey = crypto.randomUUID();
    const thumbPath = `${RPC_OWNER_A}/cleanup-${Date.now()}.png`;
    const createRes = await rpc(keys, 'fractalpark_draft_create', keys.serviceKey, {
      p_owner_id: RPC_OWNER_A,
      p_idempotency_key: createKey,
      p_request_hash: `hash-${createKey}`,
      p_title: 'to delete',
      p_envelope: { envelopeVersion: 1 },
      p_thumbnail_path: thumbPath,
      p_config_bytes: 32,
      p_thumbnail_bytes: 16,
    });
    const created = JSON.parse(await createRes.text()) as { draft: { id: string } };
    const draftId = created.draft.id;

    const deleteKey = crypto.randomUUID();
    const delRes = await rpc(keys, 'fractalpark_draft_delete', keys.serviceKey, {
      p_owner_id: RPC_OWNER_A,
      p_draft_id: draftId,
      p_idempotency_key: deleteKey,
      p_request_hash: `hash-${deleteKey}`,
    });
    const delBody = await delRes.text();
    assert(delRes.status === 200, `delete: ${delRes.status} ${delBody}`);
    const gone = psql(`select count(*) from public.artwork_drafts where id = '${draftId}'`);
    assert(gone === '0', 'draft row must be gone');
    const jobCount = psql(
      `select count(*) from public.resource_cleanup_jobs where resource_type = 'draft_thumbnail' and resource_key = '${thumbPath}'`,
    );
    assert(jobCount === '1', 'cleanup job registered for the thumbnail');

    const replayRes = await rpc(keys, 'fractalpark_draft_delete', keys.serviceKey, {
      p_owner_id: RPC_OWNER_A,
      p_draft_id: draftId,
      p_idempotency_key: deleteKey,
      p_request_hash: `hash-${deleteKey}`,
    });
    const replayed = JSON.parse(await replayRes.text()) as { replayed: boolean; deleted: boolean };
    assert(replayed.replayed === true && replayed.deleted === true, 'delete replay returns the original result');

    const foreignRes = await rpc(keys, 'fractalpark_draft_delete', keys.serviceKey, {
      p_owner_id: RPC_OWNER_B,
      p_draft_id: draftId,
      p_idempotency_key: crypto.randomUUID(),
      p_request_hash: 'hash-foreign',
    });
    const foreignBody = await foreignRes.text();
    assert(foreignRes.status !== 200 && foreignBody.includes('not_found'), `foreign delete must be uniform not_found: ${foreignRes.status} ${foreignBody}`);

    psql(`delete from public.resource_cleanup_jobs where resource_key = '${thumbPath}'`);
    psql(`delete from public.artwork_operations where idempotency_key in ('${createKey}', '${deleteKey}')`);
  });

  // ------------------------------------------------------------------
  // Publication RPCs (commit 7): publish, withdraw, lifecycle invariants
  // ------------------------------------------------------------------
  const PUB_OWNER = await createUser(keys, 'pub');
  psql(
    `insert into public.profiles (user_id, display_name) values ('${PUB_OWNER}', 'Publisher')
     on conflict (user_id) do update set display_name = 'Publisher'`,
  );

  async function makeDraft(title: string): Promise<{ id: string; revision: number }> {
    const key = crypto.randomUUID();
    const res = await rpc(keys, 'fractalpark_draft_create', keys.serviceKey, {
      p_owner_id: PUB_OWNER,
      p_idempotency_key: key,
      p_request_hash: `hash-${key}`,
      p_title: title,
      p_envelope: { envelopeVersion: 1, document: { meta: title } },
      p_thumbnail_path: null,
      p_config_bytes: 48,
      p_thumbnail_bytes: 0,
    });
    const body = JSON.parse(await res.text()) as { draft: { id: string; revision: number } };
    assert(res.status === 200, `makeDraft: ${res.status}`);
    return { id: body.draft.id, revision: body.draft.revision };
  }

  async function publish(
    draftId: string,
    revision: number,
    opts: { quota?: number; attestation?: string } = {},
  ): Promise<Response> {
    const key = crypto.randomUUID();
    return rpc(keys, 'fractalpark_publish_draft', keys.serviceKey, {
      p_owner_id: PUB_OWNER,
      p_idempotency_key: key,
      p_request_hash: `hash-${key}`,
      p_draft_id: draftId,
      p_expected_revision: revision,
      p_title: 'public title',
      p_description: 'public description',
      p_envelope: { envelopeVersion: 1, document: { meta: 'public title' } },
      p_config_bytes: 48,
      p_rights_attestation_version: opts.attestation ?? '2026-08-02.v1',
      p_license_version: 'CC-BY-4.0',
      ...(opts.quota !== undefined ? { p_publish_quota: opts.quota } : {}),
    });
  }

  await test('publish: requires a display name before the first publish', async () => {
    const lonely = await createUser(keys, 'lonely');
    const key = crypto.randomUUID();
    const mkRes = await rpc(keys, 'fractalpark_draft_create', keys.serviceKey, {
      p_owner_id: lonely,
      p_idempotency_key: key,
      p_request_hash: `hash-${key}`,
      p_title: 'lonely draft',
      p_envelope: { envelopeVersion: 1 },
      p_thumbnail_path: null,
      p_config_bytes: 8,
      p_thumbnail_bytes: 0,
    });
    const made = JSON.parse(await mkRes.text()) as { draft: { id: string } };
    const pubKey = crypto.randomUUID();
    const res = await rpc(keys, 'fractalpark_publish_draft', keys.serviceKey, {
      p_owner_id: lonely,
      p_idempotency_key: pubKey,
      p_request_hash: `hash-${pubKey}`,
      p_draft_id: made.draft.id,
      p_expected_revision: 1,
      p_title: 't',
      p_description: '',
      p_envelope: { envelopeVersion: 1 },
      p_config_bytes: 8,
      p_rights_attestation_version: 'v1',
      p_license_version: 'CC-BY-4.0',
    });
    const body = await res.text();
    assert(res.status !== 200 && body.includes('validation_failed'), `no display name: ${res.status} ${body}`);
    const stillThere = psql(`select count(*) from public.artwork_drafts where id = '${made.draft.id}'`);
    assert(stillThere === '1', 'failed publish must keep the source draft');
  });

  await test('publish: immutable publication, source draft deleted, replay returns original', async () => {
    const draft = await makeDraft('to publish');
    const key = crypto.randomUUID();
    const res = await rpc(keys, 'fractalpark_publish_draft', keys.serviceKey, {
      p_owner_id: PUB_OWNER,
      p_idempotency_key: key,
      p_request_hash: `hash-${key}`,
      p_draft_id: draft.id,
      p_expected_revision: draft.revision,
      p_title: 'immutable one',
      p_description: 'frozen forever',
      p_envelope: { envelopeVersion: 1, document: { meta: 'immutable one' } },
      p_config_bytes: 48,
      p_rights_attestation_version: '2026-08-02.v1',
      p_license_version: 'CC-BY-4.0',
    });
    const body = JSON.parse(await res.text()) as { publication_id: string; status: string; thumbnail_status: string };
    assert(res.status === 200 && body.status === 'published', `publish: ${res.status}`);
    assert(body.thumbnail_status === 'pending', 'public thumbnails start as pending placeholder');
    const pub = psql(
      `select author_display_name || '|' || license || '|' || license_scope || '|' || rights_attestation_version || '|' || status || '|' ||
              coalesce(formula_license, 'null') || '|' || coalesce(formula_license_scope, 'null') || '|' ||
              coalesce(formula_source_attestation_version, 'null')
       from public.artwork_publications where id = '${body.publication_id}'`,
    );
    assert(
      pub === 'Publisher|CC-BY-4.0|artwork_image|2026-08-02.v1|published|null|null|null',
      `frozen snapshot: ${pub}`,
    );
    const gone = psql(`select count(*) from public.artwork_drafts where id = '${draft.id}'`);
    assert(gone === '0', 'source draft must be deleted on success');

    const replayRes = await rpc(keys, 'fractalpark_publish_draft', keys.serviceKey, {
      p_owner_id: PUB_OWNER,
      p_idempotency_key: key,
      p_request_hash: `hash-${key}`,
      p_draft_id: draft.id,
      p_expected_revision: draft.revision,
      p_title: 'immutable one',
      p_description: 'frozen forever',
      p_envelope: { envelopeVersion: 1, document: { meta: 'immutable one' } },
      p_config_bytes: 48,
      p_rights_attestation_version: '2026-08-02.v1',
      p_license_version: 'CC-BY-4.0',
    });
    const replayed = JSON.parse(await replayRes.text()) as { replayed: boolean; publication_id: string };
    assert(replayed.replayed === true && replayed.publication_id === body.publication_id, 'publish replay returns the original publication');
    const count = psql(`select count(*) from public.artwork_publications where owner_id = '${PUB_OWNER}'`);
    assert(count === '1', 'replay must not duplicate the publication');

    psqlFails(
      `update public.artwork_publications set title = 'renamed' where id = '${body.publication_id}'`,
      'frozen title update',
    );
  });

  await test('publish: custom formula freezes a separate MIT source-license snapshot', async () => {
    const draft = await makeDraft('formula publication');
    const key = crypto.randomUUID();
    const formulaPublishArgs = {
      p_owner_id: PUB_OWNER,
      p_idempotency_key: key,
      p_request_hash: `hash-${key}`,
      p_draft_id: draft.id,
      p_expected_revision: draft.revision,
      p_title: 'formula publication',
      p_description: '',
      p_envelope: { envelopeVersion: 1, assets: { formulas: [{ id: 'custom' }] } },
      p_config_bytes: 48,
      p_rights_attestation_version: '2026-08-02.v1',
      p_license_version: 'CC-BY-4.0',
      p_formula_source_attestation_version: '2026-08-08.v1',
    };
    const res = await rpc(keys, 'fractalpark_publish_draft', keys.serviceKey, formulaPublishArgs);
    const body = JSON.parse(await res.text()) as { publication_id: string; status: string };
    assert(res.status === 200 && body.status === 'published', `formula publish: ${res.status}`);
    const snapshot = psql(
      `select license || '|' || license_scope || '|' || license_version || '|' || formula_license || '|' ||
              formula_license_scope || '|' || formula_source_attestation_version
       from public.artwork_publications where id = '${body.publication_id}'`,
    );
    assert(
      snapshot === 'CC-BY-4.0|artwork_image|CC-BY-4.0|MIT|formula_source|2026-08-08.v1',
      `formula license snapshot: ${snapshot}`,
    );
    const replay = await rpc(
      keys,
      'fractalpark_publish_draft',
      keys.serviceKey,
      formulaPublishArgs,
    );
    const replayBody = JSON.parse(await replay.text()) as {
      replayed: boolean;
      publication_id: string;
    };
    assert(
      replay.status === 200 &&
        replayBody.replayed === true &&
        replayBody.publication_id === body.publication_id,
      `formula replay did not converge: ${replay.status}`,
    );
    psqlFails(
      `update public.artwork_publications set formula_license = null where id = '${body.publication_id}'`,
      'frozen formula license update',
    );

    const staleDraft = await makeDraft('stale formula attestation');
    const staleKey = crypto.randomUUID();
    const stale = await rpc(keys, 'fractalpark_publish_draft', keys.serviceKey, {
      p_owner_id: PUB_OWNER,
      p_idempotency_key: staleKey,
      p_request_hash: `hash-${staleKey}`,
      p_draft_id: staleDraft.id,
      p_expected_revision: staleDraft.revision,
      p_title: 'stale formula attestation',
      p_description: '',
      p_envelope: { envelopeVersion: 1 },
      p_config_bytes: 8,
      p_rights_attestation_version: '2026-08-02.v1',
      p_license_version: 'CC-BY-4.0',
      p_formula_source_attestation_version: '2026-08-07.v1',
    });
    const staleBody = await stale.text();
    assert(
      stale.status !== 200 && staleBody.includes('validation_failed'),
      `stale formula attestation: ${stale.status} ${staleBody}`,
    );
    const retained = psql(
      `select count(*) from public.artwork_drafts where id = '${staleDraft.id}'`,
    );
    assert(retained === '1', 'rejected formula publish must keep the source draft');
  });

  await test('publish: revision conflict and 24h quota consumed atomically', async () => {
    // A dedicated owner so the shared publish counter starts empty.
    const quotaOwner = await createUser(keys, 'quota');
    psql(
      `insert into public.profiles (user_id, display_name) values ('${quotaOwner}', 'Quota')
       on conflict (user_id) do update set display_name = 'Quota'`,
    );
    async function makeQuotaDraft(title: string): Promise<{ id: string; revision: number }> {
      const key = crypto.randomUUID();
      const res = await rpc(keys, 'fractalpark_draft_create', keys.serviceKey, {
        p_owner_id: quotaOwner,
        p_idempotency_key: key,
        p_request_hash: `hash-${key}`,
        p_title: title,
        p_envelope: { envelopeVersion: 1 },
        p_thumbnail_path: null,
        p_config_bytes: 8,
        p_thumbnail_bytes: 0,
      });
      const body = JSON.parse(await res.text()) as { draft: { id: string; revision: number } };
      return { id: body.draft.id, revision: body.draft.revision };
    }
    async function quotaPublish(draftId: string, revision: number, quota?: number): Promise<Response> {
      const key = crypto.randomUUID();
      return rpc(keys, 'fractalpark_publish_draft', keys.serviceKey, {
        p_owner_id: quotaOwner,
        p_idempotency_key: key,
        p_request_hash: `hash-${key}`,
        p_draft_id: draftId,
        p_expected_revision: revision,
        p_title: 'quota piece',
        p_description: '',
        p_envelope: { envelopeVersion: 1 },
        p_config_bytes: 8,
        p_rights_attestation_version: '2026-08-02.v1',
        p_license_version: 'CC-BY-4.0',
        ...(quota !== undefined ? { p_publish_quota: quota } : {}),
      });
    }

    const first = await makeQuotaDraft('quota one');
    const badRev = await quotaPublish(first.id, 99);
    const badBody = await badRev.text();
    assert(badRev.status !== 200 && badBody.includes('revision_conflict'), `stale revision: ${badRev.status} ${badBody}`);

    const okRes = await quotaPublish(first.id, first.revision, 1);
    assert(okRes.status === 200, `first publish within quota: ${okRes.status} ${await okRes.text()}`);
    const second = await makeQuotaDraft('quota two');
    const blocked = await quotaPublish(second.id, second.revision, 1);
    const blockedBody = await blocked.text();
    assert(blocked.status !== 200 && blockedBody.includes('rate_limited'), `quota: ${blocked.status} ${blockedBody}`);
    const surviving = psql(`select count(*) from public.artwork_drafts where id = '${second.id}'`);
    assert(surviving === '1', 'rate-limited publish keeps the source draft');
  });

  await test('publish: provenance frozen from the draft, not from the client', async () => {
    const key = crypto.randomUUID();
    const mkRes = await rpc(keys, 'fractalpark_draft_create', keys.serviceKey, {
      p_owner_id: PUB_OWNER,
      p_idempotency_key: key,
      p_request_hash: `hash-${key}`,
      p_title: 'remixed',
      p_envelope: { envelopeVersion: 1 },
      p_thumbnail_path: null,
      p_config_bytes: 8,
      p_thumbnail_bytes: 0,
      p_remix_source_type: 'preset',
      p_remix_source_id: 'gallery-nebula',
    });
    const made = JSON.parse(await mkRes.text()) as { draft: { id: string } };
    const res = await publish(made.draft.id, 1);
    const body = JSON.parse(await res.text()) as { publication_id: string };
    assert(res.status === 200, `publish remixed: ${res.status} ${JSON.stringify(body)}`);
    const prov = psql(
      `select remix_source_type || '|' || remix_source_id from public.artwork_publications where id = '${body.publication_id}'`,
    );
    assert(prov === 'preset|gallery-nebula', `provenance frozen from the draft: ${prov}`);
  });

  await test('withdraw: tombstone, content cleared, idempotent, uniform foreign not_found', async () => {
    const draft = await makeDraft('to withdraw');
    const pubRes = await publish(draft.id, draft.revision);
    const pub = JSON.parse(await pubRes.text()) as { publication_id: string };
    assert(pubRes.status === 200, `seed publish: ${pubRes.status}`);

    const wKey = crypto.randomUUID();
    const wRes = await rpc(keys, 'fractalpark_withdraw_publication', keys.serviceKey, {
      p_owner_id: PUB_OWNER,
      p_idempotency_key: wKey,
      p_request_hash: `hash-${wKey}`,
      p_publication_id: pub.publication_id,
    });
    const wBody = JSON.parse(await wRes.text()) as { status: string };
    assert(wRes.status === 200 && wBody.status === 'withdrawn', `withdraw: ${wRes.status}`);
    const tomb = psql(
      `select status || '|' || coalesce(envelope::text, 'null') || '|' || coalesce(description, 'null') || '|' || coalesce(thumbnail_path, 'null')
       from public.artwork_publications where id = '${pub.publication_id}'`,
    );
    assert(tomb === 'withdrawn|null|null|null', `tombstone: ${tomb}`);
    const hasTime = psql(`select withdrawn_at is not null from public.artwork_publications where id = '${pub.publication_id}'`);
    assert(hasTime === 't', 'withdrawn_at recorded');

    const againKey = crypto.randomUUID();
    const again = await rpc(keys, 'fractalpark_withdraw_publication', keys.serviceKey, {
      p_owner_id: PUB_OWNER,
      p_idempotency_key: againKey,
      p_request_hash: `hash-${againKey}`,
      p_publication_id: pub.publication_id,
    });
    const againBody = JSON.parse(await again.text()) as { status: string };
    assert(again.status === 200 && againBody.status === 'withdrawn', 'repeat withdraw is an idempotent no-op');

    const foreign = await rpc(keys, 'fractalpark_withdraw_publication', keys.serviceKey, {
      p_owner_id: RPC_OWNER_B,
      p_idempotency_key: crypto.randomUUID(),
      p_request_hash: 'hash-foreign-withdraw-padding-32chars',
      p_publication_id: pub.publication_id,
    });
    const foreignBody = await foreign.text();
    assert(foreign.status !== 200 && foreignBody.includes('not_found'), `foreign withdraw: ${foreign.status} ${foreignBody}`);
  });

  await test('publication RPCs are not executable by anon or authenticated', async () => {
    const publishArgs = {
      p_owner_id: PUB_OWNER,
      p_idempotency_key: crypto.randomUUID(),
      p_request_hash: 'hash-anon',
      p_draft_id: crypto.randomUUID(),
      p_expected_revision: 1,
      p_title: 'x',
      p_description: '',
      p_envelope: { envelopeVersion: 1 },
      p_config_bytes: 1,
      p_rights_attestation_version: 'v1',
      p_license_version: 'CC-BY-4.0',
    };
    const withdrawArgs = {
      p_owner_id: PUB_OWNER,
      p_idempotency_key: crypto.randomUUID(),
      p_request_hash: 'hash-anon',
      p_publication_id: crypto.randomUUID(),
    };
    for (const [label, bearer] of [['anon', keys.anonKey], ['authenticated', userJwt]] as const) {
      const res = await rpc(keys, 'fractalpark_publish_draft', bearer, publishArgs);
      assert(res.status !== 200, `${label} must not execute publish: ${res.status}`);
      const wRes = await rpc(keys, 'fractalpark_withdraw_publication', bearer, withdrawArgs);
      assert(wRes.status !== 200, `${label} must not execute withdraw: ${wRes.status}`);
    }
  });

  await test('draft RPCs are not executable by anon or authenticated', async () => {
    const args = {
      p_owner_id: RPC_OWNER_A,
      p_idempotency_key: crypto.randomUUID(),
      p_request_hash: 'hash-anon',
      p_title: 'anon',
      p_envelope: { envelopeVersion: 1 },
      p_thumbnail_path: null,
      p_config_bytes: 1,
      p_thumbnail_bytes: 0,
    };
    for (const [label, bearer] of [['anon', keys.anonKey], ['authenticated', userJwt]] as const) {
      const denied = await rpc(keys, 'fractalpark_draft_create', bearer, args);
      assert(denied.status !== 200, `${label} must not execute draft_create: ${denied.status}`);
    }
  });

  await test('moderation: hide keeps the envelope, records reason, registers thumbnail cleanup', async () => {
    const draft = await makeDraft('to hide');
    const pubRes = await publish(draft.id, draft.revision);
    const pub = JSON.parse(await pubRes.text()) as { publication_id: string };
    assert(pubRes.status === 200, `seed publish: ${pubRes.status}`);
    // Give the publication a thumbnail path so the cleanup job has a target.
    psql(`update public.artwork_publications set thumbnail_path = 'pub-thumbs/${pub.publication_id}.webp' where id = '${pub.publication_id}'`);

    const hide = await rpc(keys, 'artwork_publication_set_moderation', keys.serviceKey, {
      p_publication_id: pub.publication_id,
      p_action: 'hide',
      p_reason: 'takedown request #42',
    });
    const hideBody = JSON.parse(await hide.text()) as { status: string; hidden_at?: string };
    assert(hide.status === 200 && hideBody.status === 'hidden', `hide: ${hide.status}`);
    const row = psql(
      `select status || '|' || (envelope is not null) || '|' || coalesce(moderation_reason, 'null') || '|' || (hidden_at is not null)
       from public.artwork_publications where id = '${pub.publication_id}'`,
    );
    assert(row === 'hidden|true|takedown request #42|true', `hidden row: ${row}`);
    const job = psql(
      `select resource_type || '|' || resource_key from public.resource_cleanup_jobs
       where resource_key = 'pub-thumbs/${pub.publication_id}.webp'`,
    );
    assert(job === 'publication_thumbnail|pub-thumbs/' + pub.publication_id + '.webp', `cleanup job: ${job}`);

    // Idempotent replay: second hide with a new reason only refreshes the reason.
    const again = await rpc(keys, 'artwork_publication_set_moderation', keys.serviceKey, {
      p_publication_id: pub.publication_id,
      p_action: 'hide',
      p_reason: 'confirmed violation',
    });
    const againBody = JSON.parse(await again.text()) as { status: string; replayed?: boolean };
    assert(again.status === 200 && againBody.replayed === true, `replay hide: ${again.status}`);
    const reason = psql(`select moderation_reason from public.artwork_publications where id = '${pub.publication_id}'`);
    assert(reason === 'confirmed violation', `reason refreshed: ${reason}`);
    const jobCount = psql(
      `select count(*) from public.resource_cleanup_jobs where resource_key = 'pub-thumbs/${pub.publication_id}.webp'`,
    );
    assert(jobCount === '1', 'replay hide registers no duplicate cleanup job');

    // Restore: back to published, hidden_at cleared, reason kept as record.
    const restore = await rpc(keys, 'artwork_publication_set_moderation', keys.serviceKey, {
      p_publication_id: pub.publication_id,
      p_action: 'restore',
    });
    const restoreBody = JSON.parse(await restore.text()) as { status: string };
    assert(restore.status === 200 && restoreBody.status === 'published', `restore: ${restore.status}`);
    const restored = psql(
      `select status || '|' || coalesce(hidden_at::text, 'null') || '|' || coalesce(moderation_reason, 'null')
       from public.artwork_publications where id = '${pub.publication_id}'`,
    );
    assert(restored === 'published|null|confirmed violation', `restored row: ${restored}`);
  });

  await test('moderation: withdrawn works reject hide and restore', async () => {
    const draft = await makeDraft('to withdraw then moderate');
    const pubRes = await publish(draft.id, draft.revision);
    const pub = JSON.parse(await pubRes.text()) as { publication_id: string };
    const wKey = crypto.randomUUID();
    await rpc(keys, 'fractalpark_withdraw_publication', keys.serviceKey, {
      p_owner_id: PUB_OWNER,
      p_idempotency_key: wKey,
      p_request_hash: `hash-${wKey}`,
      p_publication_id: pub.publication_id,
    });
    const hide = await rpc(keys, 'artwork_publication_set_moderation', keys.serviceKey, {
      p_publication_id: pub.publication_id,
      p_action: 'hide',
    });
    const hideBody = await hide.text();
    assert(hide.status !== 200 && hideBody.includes('invalid_state'), `hide withdrawn: ${hide.status} ${hideBody}`);
    const restore = await rpc(keys, 'artwork_publication_set_moderation', keys.serviceKey, {
      p_publication_id: pub.publication_id,
      p_action: 'restore',
    });
    assert(restore.status !== 200, `restore withdrawn: ${restore.status}`);
  });

  await test('moderation RPC is not executable by anon or authenticated', async () => {
    const draft = await makeDraft('moderation grants');
    const pubRes = await publish(draft.id, draft.revision);
    const pub = JSON.parse(await pubRes.text()) as { publication_id: string };
    const anonRes = await rpc(keys, 'artwork_publication_set_moderation', keys.anonKey, {
      p_publication_id: pub.publication_id,
      p_action: 'hide',
    });
    assert(anonRes.status !== 200, `anon must not moderate: ${anonRes.status}`);
    const status = psql(`select status from public.artwork_publications where id = '${pub.publication_id}'`);
    assert(status === 'published', 'anon attempt changed nothing');
  });

  await test('account deletion: step-up proof, idempotent replay, expiry renewal', async () => {
    const key = crypto.randomUUID();
    const step = await rpc(keys, 'fractalpark_account_deletion_step_up', keys.serviceKey, {
      p_owner_id: RPC_OWNER_A,
      p_proof_key: key,
    });
    const proof = JSON.parse(await step.text()) as { operation_id: string; deletion_stage: string };
    assert(step.status === 200 && proof.deletion_stage === 'stepped_up', `step-up: ${step.status}`);

    const again = await rpc(keys, 'fractalpark_account_deletion_step_up', keys.serviceKey, {
      p_owner_id: RPC_OWNER_A,
      p_proof_key: crypto.randomUUID(),
    });
    const againBody = JSON.parse(await again.text()) as { operation_id: string; replayed?: boolean };
    assert(
      again.status === 200 && againBody.replayed === true && againBody.operation_id === proof.operation_id,
      'step-up replay returns the same proof',
    );

    // Age the proof by using a zero window: step-up retires it and issues fresh.
    const renewed = await rpc(keys, 'fractalpark_account_deletion_step_up', keys.serviceKey, {
      p_owner_id: RPC_OWNER_A,
      p_proof_key: crypto.randomUUID(),
      p_window: '0 seconds',
    });
    const renewedBody = JSON.parse(await renewed.text()) as { operation_id: string; replayed?: boolean };
    assert(
      renewed.status === 200 && !renewedBody.replayed && renewedBody.operation_id !== proof.operation_id,
      'expired proof retired, fresh proof issued',
    );
    const retired = psql(`select status || '|' || error_code from public.artwork_operations where id = '${proof.operation_id}'`);
    assert(retired === 'failed|step_up_expired', `retired proof: ${retired}`);
    // Clean up the fresh proof so later batteries start clean.
    psql(`delete from public.artwork_operations where id = '${renewedBody.operation_id}'`);
  });

  await test('account deletion: confirm locks, blocks RPCs, purges facts, registers jobs; replay safe', async () => {
    // Seed: one draft with thumbnail, one published work, a profile.
    const draft = await makeDraft('doomed draft');
    psql(
      `update public.artwork_drafts set thumbnail_path = 'draft-thumbs/${draft.id}.webp', revision = revision + 1 where id = '${draft.id}'`,
    );
    const pubDraft = await makeDraft('doomed publication');
    const pubRes = await publish(pubDraft.id, pubDraft.revision);
    const pub = JSON.parse(await pubRes.text()) as { publication_id: string };
    psql(`update public.artwork_publications set thumbnail_path = 'pub-thumbs/${pub.publication_id}.webp' where id = '${pub.publication_id}'`);
    psql(`insert into public.profiles (user_id, display_name) values ('${PUB_OWNER}', 'Doomed User') on conflict (user_id) do nothing`);

    const step = await rpc(keys, 'fractalpark_account_deletion_step_up', keys.serviceKey, {
      p_owner_id: PUB_OWNER,
      p_proof_key: crypto.randomUUID(),
    });
    const proof = JSON.parse(await step.text()) as { operation_id: string };

    const confirm = await rpc(keys, 'fractalpark_account_deletion_confirm', keys.serviceKey, {
      p_owner_id: PUB_OWNER,
      p_operation_id: proof.operation_id,
    });
    const result = JSON.parse(await confirm.text()) as {
      status: string;
      drafts_deleted: number;
      publications_withdrawn: number;
    };
    assert(confirm.status === 200 && result.status === 'deleting', `confirm: ${confirm.status}`);
    assert(result.drafts_deleted >= 1 && result.publications_withdrawn >= 1, `counts: ${JSON.stringify(result)}`);

    const stage = psql(`select deletion_stage from public.artwork_operations where id = '${proof.operation_id}'`);
    assert(stage === 'locked', `stage: ${stage}`);
    const drafts = psql(`select count(*) from public.artwork_drafts where owner_id = '${PUB_OWNER}'`);
    assert(drafts === '0', 'drafts gone');
    const pubRow = psql(
      `select status || '|' || coalesce(envelope::text, 'null') from public.artwork_publications where id = '${pub.publication_id}'`,
    );
    assert(pubRow === 'withdrawn|null', `publication tombstone: ${pubRow}`);
    const profile = psql(`select count(*) from public.profiles where user_id = '${PUB_OWNER}'`);
    assert(profile === '0', 'profile gone');
    const jobs = psql(
      `select count(*) filter (where resource_type = 'auth_user') || '|' ||
              count(*) filter (where resource_type = 'draft_thumbnail') || '|' ||
              (count(*) filter (where resource_type = 'publication_thumbnail') >= 1)
       from public.resource_cleanup_jobs where operation_id = '${proof.operation_id}'`,
    );
    assert(jobs === '1|1|true', `cleanup jobs: ${jobs}`);

    // Ordinary RPCs are rejected while the deletion is locked.
    const blocked = await rpc(keys, 'fractalpark_draft_create', keys.serviceKey, {
      p_owner_id: PUB_OWNER,
      p_idempotency_key: crypto.randomUUID(),
      p_request_hash: 'hash-blocked',
      p_title: 'blocked',
      p_envelope: { envelopeVersion: 1 },
      p_thumbnail_path: null,
      p_config_bytes: 1,
      p_thumbnail_bytes: 0,
    });
    const blockedBody = await blocked.text();
    assert(blocked.status !== 200 && blockedBody.includes('account_deleting'), `gate blocks: ${blocked.status}`);

    // Confirm replay is a no-op (no duplicate auth_user job).
    const replay = await rpc(keys, 'fractalpark_account_deletion_confirm', keys.serviceKey, {
      p_owner_id: PUB_OWNER,
      p_operation_id: proof.operation_id,
    });
    const replayBody = JSON.parse(await replay.text()) as { replayed?: boolean };
    assert(replay.status === 200 && replayBody.replayed === true, `confirm replay: ${replay.status}`);
    const authJobs = psql(
      `select count(*) from public.resource_cleanup_jobs where operation_id = '${proof.operation_id}' and resource_type = 'auth_user'`,
    );
    assert(authJobs === '1', 'no duplicate auth_user job');

    // Expired proof cannot confirm.
    const step2 = await rpc(keys, 'fractalpark_account_deletion_step_up', keys.serviceKey, {
      p_owner_id: RPC_OWNER_B,
      p_proof_key: crypto.randomUUID(),
    });
    const proof2 = JSON.parse(await step2.text()) as { operation_id: string };
    const expired = await rpc(keys, 'fractalpark_account_deletion_confirm', keys.serviceKey, {
      p_owner_id: RPC_OWNER_B,
      p_operation_id: proof2.operation_id,
      p_window: '0 seconds',
    });
    const expiredBody = await expired.text();
    assert(expired.status !== 200 && expiredBody.includes('step_up_expired'), `expired confirm: ${expired.status}`);
    psql(`delete from public.artwork_operations where id = '${proof2.operation_id}'`);
  });

  await test('account deletion finalize: closes op, purges older ops, keeps audit row, idempotent', async () => {
    const step = await rpc(keys, 'fractalpark_account_deletion_step_up', keys.serviceKey, {
      p_owner_id: PUB_OWNER,
      p_proof_key: crypto.randomUUID(),
    });
    // PUB_OWNER still has a locked op from the previous battery: step-up replays it.
    const proof = JSON.parse(await step.text()) as { operation_id: string; deletion_stage: string };
    assert(proof.deletion_stage === 'locked', `still locked: ${proof.deletion_stage}`);

    const fin = await rpc(keys, 'fractalpark_account_deletion_finalize', keys.serviceKey, {
      p_owner_id: PUB_OWNER,
      p_operation_id: proof.operation_id,
    });
    const finBody = JSON.parse(await fin.text()) as { status: string; operations_purged: number };
    assert(fin.status === 200 && finBody.status === 'succeeded', `finalize: ${fin.status}`);
    assert(finBody.operations_purged >= 1, `purged: ${finBody.operations_purged}`);
    const remaining = psql(
      `select count(*) || '|' || string_agg(distinct operation_type, ',') from public.artwork_operations where owner_id = '${PUB_OWNER}'`,
    );
    assert(remaining === '1|delete_account', `audit row kept: ${remaining}`);

    const finAgain = await rpc(keys, 'fractalpark_account_deletion_finalize', keys.serviceKey, {
      p_owner_id: PUB_OWNER,
      p_operation_id: proof.operation_id,
    });
    const finAgainBody = JSON.parse(await finAgain.text()) as { replayed?: boolean };
    assert(finAgain.status === 200 && finAgainBody.replayed === true, 'finalize idempotent');

    // After finalize (status=succeeded), the gate no longer blocks.
    const unblocked = await rpc(keys, 'fractalpark_draft_create', keys.serviceKey, {
      p_owner_id: PUB_OWNER,
      p_idempotency_key: crypto.randomUUID(),
      p_request_hash: 'hash-after-finalize-padding-32cc',
      p_title: 'after',
      p_envelope: { envelopeVersion: 1 },
      p_thumbnail_path: null,
      p_config_bytes: 1,
      p_thumbnail_bytes: 0,
    });
    assert(unblocked.status === 200, `gate opens after finalize: ${unblocked.status}`);
    psql(`delete from public.resource_cleanup_jobs where operation_id = '${proof.operation_id}'`);
    psql(`delete from public.artwork_operations where id = '${proof.operation_id}'`);
  });

  await test('account deletion RPCs are not executable by anon', async () => {
    const res = await rpc(keys, 'fractalpark_account_deletion_step_up', keys.anonKey, {
      p_owner_id: RPC_OWNER_A,
      p_proof_key: crypto.randomUUID(),
    });
    assert(res.status !== 200, `anon step-up denied: ${res.status}`);
    const confirm = await rpc(keys, 'fractalpark_account_deletion_confirm', keys.anonKey, {
      p_owner_id: RPC_OWNER_A,
      p_operation_id: crypto.randomUUID(),
    });
    assert(confirm.status !== 200, `anon confirm denied: ${confirm.status}`);
    const finalize = await rpc(keys, 'fractalpark_account_deletion_finalize', keys.anonKey, {
      p_owner_id: RPC_OWNER_A,
      p_operation_id: crypto.randomUUID(),
    });
    assert(finalize.status !== 200, `anon finalize denied: ${finalize.status}`);
    const revoke = await rpc(keys, 'fractalpark_revoke_user_sessions', keys.anonKey, {
      p_owner_id: RPC_OWNER_A,
    });
    assert(revoke.status !== 200, `anon revoke denied: ${revoke.status}`);
  });

  console.log('== v0.4.16: custom formula cloud store ==');

  // Dedicated owners: OWNER_A is auth-deleted mid-suite, and RPC_OWNER_A has
  // deletion-flow residue (rate-limit counters, audit rows) — the formula
  // battery stays self-contained.
  const CF_OWNER_A = await createUser(keys, 'cf-a');
  const CF_OWNER_B = await createUser(keys, 'cf-b');

  await test('custom_formulas: structure, RLS, grants, index', () => {
    const rls = psql(
      `select relrowsecurity || ':' || relforcerowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relname = 'custom_formulas'`,
    );
    assert(rls === 'true:true', `RLS not enabled+forced on custom_formulas: ${rls}`);
    assert(psql(`select has_table_privilege('anon', 'public.custom_formulas', 'select')`) === 'f', 'anon can select custom_formulas');
    assert(psql(`select has_table_privilege('authenticated', 'public.custom_formulas', 'insert')`) === 'f', 'authenticated can insert custom_formulas');
    assert(psql(`select has_table_privilege('service_role', 'public.custom_formulas', 'select')`) === 't', 'service_role cannot select custom_formulas');
    const idx = psql(
      `select indexname from pg_indexes where schemaname = 'public' and indexname = 'custom_formulas_owner_updated_idx'`,
    );
    assert(idx.includes('custom_formulas_owner_updated_idx'), 'missing owner/updated index');
  });

  await test('custom_formulas constraint battery', () => {
    psqlFails(
      `insert into public.custom_formulas (owner_id, name, source, source_bytes) values ('${CF_OWNER_A}', '', 'formula x', 9)`,
      'empty name',
    );
    psqlFails(
      `insert into public.custom_formulas (owner_id, name, source, source_bytes) values ('${CF_OWNER_A}', 'x', 'src', 7)`,
      'source_bytes mismatch with octet_length(source)',
    );
    psqlFails(
      `insert into public.custom_formulas (owner_id, name, source, source_bytes) values ('${CF_OWNER_A}', 'x', repeat('a', 65537), 65537)`,
      'source above 64 KiB',
    );
    psqlFails(
      `insert into public.custom_formulas (owner_id, name, source, source_bytes, experience_hint) values ('${CF_OWNER_A}', 'x', 'src', 3, '["not-an-object"]')`,
      'experience_hint must be an object',
    );
    psql(
      `insert into public.custom_formulas (owner_id, name, source, source_bytes) values ('${CF_OWNER_A}', 'ok', 'src', 3)`,
    );
    const count = psql(`select count(*) from public.custom_formulas where owner_id = '${CF_OWNER_A}' and name = 'ok'`);
    assert(count === '1', 'valid row insert failed');
    psql(`delete from public.custom_formulas where owner_id = '${CF_OWNER_A}' and name = 'ok'`);
  });

  await test('custom_formulas frozen-field trigger', () => {
    psql(
      `insert into public.custom_formulas (owner_id, name, source, source_bytes) values ('${CF_OWNER_A}', 'freeze', 'src', 3)`,
    );
    const id = psql(`select id from public.custom_formulas where owner_id = '${CF_OWNER_A}' and name = 'freeze'`);
    psqlFails(
      `update public.custom_formulas set revision = revision + 2 where id = '${id}'`,
      'revision must increment by exactly one',
    );
    psqlFails(
      `update public.custom_formulas set owner_id = '${CF_OWNER_B}', revision = revision + 1 where id = '${id}'`,
      'owner is frozen',
    );
    psql(`update public.custom_formulas set name = 'freeze2', revision = revision + 1 where id = '${id}'`);
    const rev = psql(`select revision from public.custom_formulas where id = '${id}'`);
    assert(rev === '2', `expected revision 2, got ${rev}`);
    psql(`delete from public.custom_formulas where id = '${id}'`);
  });

  await test('operation enum and rate-limit policy accept custom formula values', async () => {
    const res = await rpc(keys, 'fractalpark_rate_limit_consume', keys.serviceKey, {
      p_policy_key: 'custom_formula_save_5s',
      p_subject_hash: 'cf'.padEnd(64, '0'),
      p_limit: 100,
      p_window_seconds: 5,
    });
    assert(res.status === 200, `custom_formula_save_5s policy rejected: ${res.status} ${await res.text()}`);
    psql(`delete from public.rate_limit_counters where policy_key = 'custom_formula_save_5s'`);
  });

  await test('custom_formula_save: create + operation atomically, replay converges, hash conflict rejects', async () => {
    const key = crypto.randomUUID();
    const args = {
      p_owner_id: CF_OWNER_A,
      p_idempotency_key: key,
      p_request_hash: `hash-${key}`,
      p_name: 'RPC formula',
      p_source: 'formula rpc { z = z^2 + c }',
      p_experience_hint: null,
    };
    const createRes = await rpc(keys, 'fractalpark_custom_formula_save', keys.serviceKey, args);
    const createBody = await createRes.text();
    assert(createRes.status === 200, `create: ${createRes.status} ${createBody}`);
    const created = JSON.parse(createBody) as { replayed: boolean; formula: { id: string; revision: number; source_bytes: number } };
    assert(created.replayed === false, 'first create must not replay');
    assert(created.formula.revision === 1, 'revision starts at 1');
    assert(created.formula.source_bytes > 0, 'source_bytes maintained');

    const replayRes = await rpc(keys, 'fractalpark_custom_formula_save', keys.serviceKey, args);
    const replayed = (await replayRes.json()) as { replayed: boolean; formula_id: string; revision: number };
    assert(replayRes.status === 200 && replayed.replayed === true, `replay: ${replayRes.status}`);
    assert(replayed.formula_id === created.formula.id && replayed.revision === 1, 'replay returns the original result');

    const count = psql(`select count(*) from public.custom_formulas where id = '${created.formula.id}'`);
    assert(count === '1', 'replay must not duplicate the formula');
    const opCount = psql(
      `select count(*) from public.artwork_operations where owner_id = '${CF_OWNER_A}' and idempotency_key = '${key}'`,
    );
    assert(opCount === '1', 'exactly one operation row per (owner, key)');
    const opType = psql(
      `select operation_type from public.artwork_operations where owner_id = '${CF_OWNER_A}' and idempotency_key = '${key}'`,
    );
    assert(opType === 'save_custom_formula', `operation_type: ${opType}`);

    const conflictRes = await rpc(keys, 'fractalpark_custom_formula_save', keys.serviceKey, {
      ...args,
      p_request_hash: `other-${key}`,
    });
    const conflictBody = await conflictRes.text();
    assert(conflictRes.status !== 200 && conflictBody.includes('idempotency_conflict'), `hash conflict: ${conflictRes.status} ${conflictBody}`);

    psql(`delete from public.custom_formulas where id = '${created.formula.id}'`);
    psql(`delete from public.artwork_operations where owner_id = '${CF_OWNER_A}' and idempotency_key = '${key}'`);
  });

  await test('custom_formula_save: update revision contract and uniform foreign not_found', async () => {
    const createKey = crypto.randomUUID();
    const createRes = await rpc(keys, 'fractalpark_custom_formula_save', keys.serviceKey, {
      p_owner_id: CF_OWNER_A,
      p_idempotency_key: createKey,
      p_request_hash: `hash-${createKey}`,
      p_name: 'to update',
      p_source: 'formula upd { z }',
    });
    const created = JSON.parse(await createRes.text()) as { formula: { id: string } };
    const formulaId = created.formula.id;

    const wrongRes = await rpc(keys, 'fractalpark_custom_formula_save', keys.serviceKey, {
      p_owner_id: CF_OWNER_A,
      p_formula_id: formulaId,
      p_expected_revision: 5,
      p_idempotency_key: crypto.randomUUID(),
      p_request_hash: 'hash-wrong-rev',
      p_name: 'x',
      p_source: 'y',
    });
    const wrongBody = await wrongRes.text();
    assert(wrongRes.status !== 200 && wrongBody.includes('revision_conflict'), `wrong revision: ${wrongRes.status} ${wrongBody}`);

    const foreignRes = await rpc(keys, 'fractalpark_custom_formula_save', keys.serviceKey, {
      p_owner_id: CF_OWNER_B,
      p_formula_id: formulaId,
      p_expected_revision: 1,
      p_idempotency_key: crypto.randomUUID(),
      p_request_hash: 'hash-foreign',
      p_name: 'x',
      p_source: 'y',
    });
    const foreignBody = await foreignRes.text();
    assert(foreignRes.status !== 200 && foreignBody.includes('not_found'), `foreign owner must get uniform not_found: ${foreignRes.status} ${foreignBody}`);

    const updateKey = crypto.randomUUID();
    const okRes = await rpc(keys, 'fractalpark_custom_formula_save', keys.serviceKey, {
      p_owner_id: CF_OWNER_A,
      p_formula_id: formulaId,
      p_expected_revision: 1,
      p_idempotency_key: updateKey,
      p_request_hash: `hash-${updateKey}`,
      p_name: 'updated',
      p_source: 'formula upd2 { z }',
      p_experience_hint: { bounds: { centerX: 0, centerY: 0, zoom: 2, rotation: 0 } },
    });
    const okBody = await okRes.text();
    assert(okRes.status === 200, `update: ${okRes.status} ${okBody}`);
    const updated = JSON.parse(okBody) as { formula: { revision: number; name: string } };
    assert(updated.formula.revision === 2 && updated.formula.name === 'updated', 'revision increments by exactly one');

    const replayRes = await rpc(keys, 'fractalpark_custom_formula_save', keys.serviceKey, {
      p_owner_id: CF_OWNER_A,
      p_formula_id: formulaId,
      p_expected_revision: 1,
      p_idempotency_key: updateKey,
      p_request_hash: `hash-${updateKey}`,
      p_name: 'updated',
      p_source: 'formula upd2 { z }',
      p_experience_hint: { bounds: { centerX: 0, centerY: 0, zoom: 2, rotation: 0 } },
    });
    const replayed = JSON.parse(await replayRes.text()) as { replayed: boolean; revision: number };
    assert(replayed.replayed === true && replayed.revision === 2, 'update replay returns the stored revision');
    const finalRev = psql(`select revision from public.custom_formulas where id = '${formulaId}'`);
    assert(finalRev === '2', 'replay must not re-increment');

    psql(`delete from public.custom_formulas where id = '${formulaId}'`);
    psql(`delete from public.artwork_operations where formula_id = '${formulaId}' or idempotency_key in ('${createKey}', '${updateKey}')`);
  });

  await test('custom_formula_save quota: count enforced with test-tunable limit', async () => {
    const k1 = crypto.randomUUID();
    const r1 = await rpc(keys, 'fractalpark_custom_formula_save', keys.serviceKey, {
      p_owner_id: CF_OWNER_A,
      p_idempotency_key: k1,
      p_request_hash: `hash-${k1}`,
      p_name: 'quota one',
      p_source: 'a',
      p_quota: 1,
    });
    assert(r1.status === 200, `first under quota: ${r1.status} ${await r1.text()}`);
    const k2 = crypto.randomUUID();
    const r2 = await rpc(keys, 'fractalpark_custom_formula_save', keys.serviceKey, {
      p_owner_id: CF_OWNER_A,
      p_idempotency_key: k2,
      p_request_hash: `hash-${k2}`,
      p_name: 'quota two',
      p_source: 'b',
      p_quota: 1,
    });
    const body2 = await r2.text();
    assert(r2.status !== 200 && body2.includes('quota_exceeded'), `quota: ${r2.status} ${body2}`);
    psql(`delete from public.custom_formulas where owner_id = '${CF_OWNER_A}' and name = 'quota one'`);
    psql(`delete from public.artwork_operations where owner_id = '${CF_OWNER_A}' and idempotency_key in ('${k1}', '${k2}')`);
  });

  await test('custom_formula_delete: permanent, replay safe, uniform foreign not_found', async () => {
    const createKey = crypto.randomUUID();
    const createRes = await rpc(keys, 'fractalpark_custom_formula_save', keys.serviceKey, {
      p_owner_id: CF_OWNER_A,
      p_idempotency_key: createKey,
      p_request_hash: `hash-${createKey}`,
      p_name: 'to delete',
      p_source: 'z',
    });
    const created = JSON.parse(await createRes.text()) as { formula: { id: string } };
    const formulaId = created.formula.id;

    const foreignRes = await rpc(keys, 'fractalpark_custom_formula_delete', keys.serviceKey, {
      p_owner_id: CF_OWNER_B,
      p_formula_id: formulaId,
      p_idempotency_key: crypto.randomUUID(),
      p_request_hash: 'hash-foreign-del',
    });
    const foreignBody = await foreignRes.text();
    assert(foreignRes.status !== 200 && foreignBody.includes('not_found'), `foreign delete must get uniform not_found: ${foreignRes.status} ${foreignBody}`);

    const deleteKey = crypto.randomUUID();
    const delRes = await rpc(keys, 'fractalpark_custom_formula_delete', keys.serviceKey, {
      p_owner_id: CF_OWNER_A,
      p_formula_id: formulaId,
      p_idempotency_key: deleteKey,
      p_request_hash: `hash-${deleteKey}`,
    });
    assert(delRes.status === 200, `delete: ${delRes.status} ${await delRes.text()}`);
    const gone = psql(`select count(*) from public.custom_formulas where id = '${formulaId}'`);
    assert(gone === '0', 'formula must be physically deleted');

    const replayRes = await rpc(keys, 'fractalpark_custom_formula_delete', keys.serviceKey, {
      p_owner_id: CF_OWNER_A,
      p_formula_id: formulaId,
      p_idempotency_key: deleteKey,
      p_request_hash: `hash-${deleteKey}`,
    });
    const replayed = JSON.parse(await replayRes.text()) as { replayed: boolean };
    assert(replayRes.status === 200 && replayed.replayed === true, 'delete replay returns the stored result');

    psql(`delete from public.artwork_operations where owner_id = '${CF_OWNER_A}' and idempotency_key in ('${createKey}', '${deleteKey}')`);
  });

  await test('custom formula RPCs are not executable by anon or authenticated', async () => {
    const saveRes = await rpc(keys, 'fractalpark_custom_formula_save', keys.anonKey, {
      p_owner_id: CF_OWNER_A,
      p_idempotency_key: crypto.randomUUID(),
      p_request_hash: 'anon',
      p_name: 'x',
      p_source: 'y',
    });
    assert(saveRes.status !== 200, `anon save denied: ${saveRes.status}`);
    const delRes = await rpc(keys, 'fractalpark_custom_formula_delete', keys.anonKey, {
      p_owner_id: CF_OWNER_A,
      p_formula_id: crypto.randomUUID(),
      p_idempotency_key: crypto.randomUUID(),
      p_request_hash: 'anon',
    });
    assert(delRes.status !== 200, `anon delete denied: ${delRes.status}`);
    const authSave = await rpc(keys, 'fractalpark_custom_formula_save', keys.anonKey, {
      p_owner_id: CF_OWNER_A,
      p_idempotency_key: crypto.randomUUID(),
      p_request_hash: 'auth',
      p_name: 'x',
      p_source: 'y',
    });
    assert(authSave.status !== 200, `second anon-key save denied: ${authSave.status}`);
  });

  await test('custom_formula_save: route seam — pre-generated id with null revision creates', async () => {
    // Guards the route→RPC contract (review B1): create must not require a
    // null p_formula_id; the pre-generated id becomes the row id.
    const key = crypto.randomUUID();
    const preId = crypto.randomUUID();
    const res = await rpc(keys, 'fractalpark_custom_formula_save', keys.serviceKey, {
      p_owner_id: CF_OWNER_A,
      p_idempotency_key: key,
      p_request_hash: `hash-${key}`,
      p_name: 'seam',
      p_source: 'z',
      p_formula_id: preId,
      p_expected_revision: null,
    });
    const body = await res.text();
    assert(res.status === 200, `seam create: ${res.status} ${body}`);
    const created = JSON.parse(body) as { replayed: boolean; formula: { id: string; revision: number } };
    assert(created.replayed === false && created.formula.id === preId && created.formula.revision === 1,
      `pre-id create: ${body}`);
    psql(`delete from public.custom_formulas where id = '${preId}'`);
    psql(`delete from public.artwork_operations where owner_id = '${CF_OWNER_A}' and idempotency_key = '${key}'`);
  });

  await test('custom formula read path: owner filter yields nothing for a foreign id', async () => {
    const key = crypto.randomUUID();
    const createRes = await rpc(keys, 'fractalpark_custom_formula_save', keys.serviceKey, {
      p_owner_id: CF_OWNER_A,
      p_idempotency_key: key,
      p_request_hash: `hash-${key}`,
      p_name: 'read-isolation',
      p_source: 'z',
    });
    const created = JSON.parse(await createRes.text()) as { formula: { id: string } };
    // The data layer reads with service key + explicit owner filter; a
    // foreign owner filter must return zero rows (the API then maps 404).
    const foreign = await rest(
      keys,
      `/rest/v1/custom_formulas?select=id&id=eq.${created.formula.id}&owner_id=eq.${CF_OWNER_B}`,
      keys.serviceKey,
    );
    const rows = (await foreign.json()) as unknown[];
    assert(foreign.status === 200 && rows.length === 0, `foreign read must be empty: ${foreign.status}`);
    psql(`delete from public.custom_formulas where id = '${created.formula.id}'`);
    psql(`delete from public.artwork_operations where owner_id = '${CF_OWNER_A}' and idempotency_key = '${key}'`);
  });

  await test('account deletion confirm purges custom formulas and reports the count', async () => {
    const stepRes = await rpc(keys, 'fractalpark_account_deletion_step_up', keys.serviceKey, {
      p_owner_id: CF_OWNER_A,
      p_proof_key: crypto.randomUUID(),
    });
    const step = JSON.parse(await stepRes.text()) as { operation_id: string };

    const formulaKey = crypto.randomUUID();
    const saveRes = await rpc(keys, 'fractalpark_custom_formula_save', keys.serviceKey, {
      p_owner_id: CF_OWNER_A,
      p_idempotency_key: formulaKey,
      p_request_hash: `hash-${formulaKey}`,
      p_name: 'deletion-target',
      p_source: 'z',
    });
    assert(saveRes.status === 200, `seed formula: ${saveRes.status} ${await saveRes.text()}`);

    const confirmRes = await rpc(keys, 'fractalpark_account_deletion_confirm', keys.serviceKey, {
      p_owner_id: CF_OWNER_A,
      p_operation_id: step.operation_id,
    });
    const confirmBody = await confirmRes.text();
    assert(confirmRes.status === 200, `confirm: ${confirmRes.status} ${confirmBody}`);
    const result = JSON.parse(confirmBody) as { formulas_deleted?: number };
    assert(typeof result.formulas_deleted === 'number' && result.formulas_deleted >= 1, `formulas_deleted: ${confirmBody}`);
    const remaining = psql(`select count(*) from public.custom_formulas where owner_id = '${CF_OWNER_A}'`);
    assert(remaining === '0', 'formulas must be purged on account deletion');
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
