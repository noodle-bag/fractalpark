/**
 * Logical cloud backup (spec section 12 operations): export every durable
 * byte the web creation loop owns, in a form a fresh project can re-ingest.
 *
 * What is exported (per docs/runbooks/cloud-backup-recovery.md):
 *  - public.creator_profiles, artwork_drafts, artwork_publications,
 *    artwork_operations       (durable rows, original ids preserved)
 *  - auth identities          (id <-> email map for the UUID-remap path;
 *    credentials themselves only ever live in platform backups)
 *  - storage object listings  (draft-thumbnails + publication-thumbnails:
 *    paths, sizes, mtimes — objects themselves are re-downloadable by path
 *    and re-uploadable verbatim)
 *  - supabase_migrations.schema_migrations (migration history)
 *  - manifest.json            (counts + sha256 per file, schema fingerprint)
 *
 * Two read modes:
 *  --mode=postgrest   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (default;
 *                     local stack, or any project whose service key you hold)
 *  --mode=management  SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF via the
 *                     Management API SQL endpoint (staging: no service key
 *                     leaves the credential vault)
 *
 * Usage:
 *   node --import tsx scripts/backup-cloud.ts --out backups/20260803-local
 *   node --import tsx scripts/backup-cloud.ts --mode=management \
 *     --ref btiamknhwitqdxvuzfzx --out backups/20260803-staging
 */

export {};

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface BackupRow {
  [key: string]: unknown;
}

const args = process.argv.slice(2);
function arg(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index >= 0) return args[index + 1];
  const equals = args.find((a) => a.startsWith(`--${name}=`));
  return equals ? equals.slice(name.length + 3) : undefined;
}
const MODE = arg('mode') ?? 'postgrest';
const OUT = arg('out');
if (!OUT) {
  console.error('usage: backup-cloud.ts --out <dir> [--mode=postgrest|management] [--ref <project-ref>]');
  process.exit(1);
}

const TABLES = [
  'profiles',
  'artwork_drafts',
  'artwork_publications',
  'artwork_operations',
  // The cleanup-job audit trail is durable history; rate_limit_counters is
  // deliberately excluded (ephemeral — restoring it would only resurrect
  // stale limits).
  'resource_cleanup_jobs',
] as const;

const BUCKETS = ['draft-thumbnails', 'publication-thumbnails'] as const;

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// ---------- postgrest mode ---------------------------------------------------

function postgrestConfig(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set for --mode=postgrest');
  return { url, key };
}

async function postgrestGet(path: string): Promise<unknown> {
  const { url, key } = postgrestConfig();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`postgrest ${path} -> ${res.status}`);
  return res.json();
}

async function postgrestTable(table: string): Promise<BackupRow[]> {
  return (await postgrestGet(`${table}?select=*`)) as BackupRow[];
}

async function postgrestAuthUsers(): Promise<BackupRow[]> {
  const { url, key } = postgrestConfig();
  const users: BackupRow[] = [];
  let page = 1;
  for (;;) {
    const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`admin users page ${page} -> ${res.status}`);
    const body = (await res.json()) as { users?: Array<Record<string, unknown>> };
    const batch = body.users ?? [];
    for (const user of batch) {
      users.push({
        id: user.id,
        email: user.email ?? null,
        created_at: user.created_at ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
      });
    }
    if (batch.length < 200) return users;
    page += 1;
  }
}

async function postgrestStorageList(bucket: string): Promise<BackupRow[]> {
  const { url, key } = postgrestConfig();
  const objects: BackupRow[] = [];
  // Storage list API is prefix-based; walk top-level owner prefixes.
  async function walk(prefix: string): Promise<void> {
    const res = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!res.ok) throw new Error(`storage list ${bucket}/${prefix} -> ${res.status}`);
    const entries = (await res.json()) as Array<Record<string, unknown>>;
    for (const entry of entries) {
      if (entry.id === null || entry.id === undefined) {
        await walk(prefix ? `${prefix}/${entry.name}` : String(entry.name));
      } else {
        objects.push({
          path: prefix ? `${prefix}/${entry.name}` : entry.name,
          size: (entry.metadata as { size?: number } | undefined)?.size ?? null,
          mtime: entry.updated_at ?? entry.created_at ?? null,
        });
      }
    }
  }
  await walk('');
  return objects;
}

async function postgrestMigrations(): Promise<BackupRow[]> {
  // PostgREST exposes only `public`; the migration history's source of
  // truth for a redeploy is the repository's migration set itself.
  const { readdirSync } = await import('node:fs');
  return readdirSync('supabase/migrations')
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ version: name.replace(/_.*$/, ''), name }));
}

// ---------- management api mode ----------------------------------------------

function managementConfig(): { token: string; ref: string } {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = arg('ref') ?? process.env.SUPABASE_PROJECT_REF;
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN must be set for --mode=management');
  if (!ref) throw new Error('pass --ref <project-ref> or set SUPABASE_PROJECT_REF');
  return { token, ref };
}

async function managementSql<T>(sql: string): Promise<T[]> {
  const { token, ref } = managementConfig();
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`management query -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T[];
}

async function managementTable(table: string): Promise<BackupRow[]> {
  return managementSql<BackupRow>(`select row_to_json(t) as row from public.${table} t`).then((rows) =>
    rows.map((r) => r.row as BackupRow),
  );
}

async function managementAuthUsers(): Promise<BackupRow[]> {
  return managementSql<BackupRow>(
    `select row_to_json(t) as row from (select id, email, created_at, last_sign_in_at from auth.users order by created_at) t`,
  ).then((rows) => rows.map((r) => r.row as BackupRow));
}

async function managementStorageList(bucket: string): Promise<BackupRow[]> {
  return managementSql<BackupRow>(
    `select row_to_json(t) as row from (select name as path, (metadata->>'size')::bigint as size, updated_at as mtime from storage.objects where bucket_id = '${bucket}' order by name) t`,
  ).then((rows) => rows.map((r) => r.row as BackupRow));
}

async function managementMigrations(): Promise<BackupRow[]> {
  return managementSql<BackupRow>(
    `select row_to_json(t) as row from supabase_migrations.schema_migrations t`,
  ).then((rows) => rows.map((r) => r.row as BackupRow));
}

// ---------- driver ------------------------------------------------------------

async function main(): Promise<void> {
  const stamp = new Date().toISOString();
  mkdirSync(OUT as string, { recursive: true });
  const manifest: Record<string, unknown> = {
    created_at: stamp,
    mode: MODE,
    source: MODE === 'management' ? `project:${arg('ref') ?? process.env.SUPABASE_PROJECT_REF}` : (process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'),
    files: {} as Record<string, { rows: number; sha256: string }>,
  };
  const files = manifest.files as Record<string, { rows: number; sha256: string }>;

  async function dump(name: string, load: () => Promise<BackupRow[]>): Promise<void> {
    const rows = await load();
    const text = JSON.stringify(rows, null, 2);
    writeFileSync(join(OUT as string, `${name}.json`), text);
    files[name] = { rows: rows.length, sha256: sha256(text) };
    console.log(`ok  ${name}: ${rows.length} rows`);
  }

  for (const table of TABLES) {
    await dump(table, () => (MODE === 'management' ? managementTable(table) : postgrestTable(table)));
  }
  await dump('auth_users', () => (MODE === 'management' ? managementAuthUsers() : postgrestAuthUsers()));
  for (const bucket of BUCKETS) {
    await dump(`storage_${bucket}`, () =>
      MODE === 'management' ? managementStorageList(bucket) : postgrestStorageList(bucket),
    );
  }
  await dump('schema_migrations', () =>
    MODE === 'management' ? managementMigrations() : postgrestMigrations(),
  );

  writeFileSync(join(OUT as string, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nmanifest written to ${OUT}/manifest.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
