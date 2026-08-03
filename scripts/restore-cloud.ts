/**
 * Logical cloud restore (spec section 12 operations): re-ingest a backup
 * produced by scripts/backup-cloud.ts into a fresh project whose schema has
 * already been rolled forward (supabase db push / npm run db:migrate).
 *
 * Order matters: auth identities first (owner ids must resolve), then rows
 * in FK order (profiles -> drafts -> publications -> operations). When a
 * restored auth user receives a NEW id (the target already has that email,
 * or the provider re-keys), the restore emits uuid-remap.json and rewrites
 * every owner_id reference through it — the remap is how a backup survives
 * an identity-provider rebuild (docs/runbooks/cloud-backup-recovery.md).
 *
 * Auth import uses the GoTrue admin API (service key): users are recreated
 * with email + email_confirm, NO password (passwordless OTP project; the
 * first sign-in after restore is a fresh OTP).
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node --import tsx scripts/restore-cloud.ts \
 *     --in backups/20260803-local [--dry-run]
 */

export {};

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
function arg(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index >= 0) return args[index + 1];
  const equals = args.find((a) => a.startsWith(`--${name}=`));
  return equals ? equals.slice(name.length + 3) : undefined;
}
const IN = arg('in');
const DRY_RUN = args.includes('--dry-run');
if (!IN) {
  console.error('usage: restore-cloud.ts --in <backup-dir> [--dry-run]');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set (target stack service key)');

interface Row {
  [key: string]: unknown;
}

function load(name: string): Row[] {
  return JSON.parse(readFileSync(join(IN as string, `${name}.json`), 'utf8')) as Row[];
}

// Refuse to restore from a corrupted or truncated export: every payload
// file must hash to its manifest entry (review: restore previously trusted
// the files blindly).
function verifyManifest(): void {
  const manifest = JSON.parse(readFileSync(join(IN as string, 'manifest.json'), 'utf8')) as {
    files: Record<string, { rows: number; sha256: string }>;
  };
  for (const [name, entry] of Object.entries(manifest.files)) {
    const text = readFileSync(join(IN as string, `${name}.json`), 'utf8');
    const digest = createHash('sha256').update(text).digest('hex');
    if (digest !== entry.sha256) {
      throw new Error(`manifest checksum mismatch for ${name}.json — export is corrupt, aborting`);
    }
  }
  console.log(`manifest verified (${Object.keys(manifest.files).length} files)`);
}

async function adminCreateUser(email: string): Promise<{ id: string; existed: boolean }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY as string,
      authorization: `Bearer ${SERVICE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (res.ok) {
    const user = (await res.json()) as { id: string };
    return { id: user.id, existed: false };
  }
  // 422/email_exists: adopt the existing account's id.
  const list = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=1000`,
    { headers: { apikey: SERVICE_KEY as string, authorization: `Bearer ${SERVICE_KEY}` } },
  );
  // NOTE: the fallback scans one page of 1000 admin users; on a target with
  // more identities a pre-existing account could be missed (the create then
  // 422s again and the restore aborts loudly — acceptable, never silent).
  const body = (await list.json()) as { users?: Array<{ id: string; email?: string }> };
  const match = (body.users ?? []).find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
  if (!match) throw new Error(`auth import failed for ${email}: ${res.status}`);
  return { id: match.id, existed: true };
}

async function postgrestInsert(table: string, rows: Row[]): Promise<void> {
  if (rows.length === 0) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY as string,
      authorization: `Bearer ${SERVICE_KEY}`,
      'content-type': 'application/json',
      prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(`insert ${table} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

async function postgrestCount(table: string): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: SERVICE_KEY as string,
      authorization: `Bearer ${SERVICE_KEY}`,
      prefer: 'count=exact',
      range: '0-0',
    },
  });
  const contentRange = res.headers.get('content-range') ?? '';
  return Number(contentRange.split('/')[1] ?? 0);
}

function remapRows(rows: Row[], remap: Map<string, string>): Row[] {
  return rows.map((row) => {
    const copy = { ...row };
    for (const field of ['owner_id', 'user_id', 'created_by', 'updated_by', 'owner']) {
      const value = copy[field];
      if (typeof value === 'string' && remap.has(value)) {
        copy[field] = remap.get(value);
      }
    }
    return copy;
  });
}

async function main(): Promise<void> {
  verifyManifest();
  const authUsers = load('auth_users');
  const remap = new Map<string, string>();
  console.log(`auth identities: ${authUsers.length}`);
  if (!DRY_RUN) {
    for (const record of authUsers) {
      const email = record.email as string | null;
      const oldId = record.id as string;
      if (!email) continue;
      const created = await adminCreateUser(email);
      if (created.id !== oldId) {
        remap.set(oldId, created.id);
        console.log(`  remap ${oldId} -> ${created.id} (${email}${created.existed ? ', pre-existing' : ''})`);
      }
    }
  }
  writeFileSync(
    join(IN as string, DRY_RUN ? 'uuid-remap.dryrun.json' : 'uuid-remap.json'),
    JSON.stringify(Object.fromEntries(remap), null, 2),
  );
  console.log(`uuid remap: ${remap.size} identities re-keyed`);

  // FK order: profiles -> drafts -> publications -> operations -> jobs.
  // remapRows rewrites every auth-user reference (owner_id, user_id, and
  // the defensive created_by/updated_by/owner variants) through the map.
  const order = [
    'profiles',
    'artwork_drafts',
    'custom_formulas',
    'artwork_publications',
    'artwork_operations',
    'resource_cleanup_jobs',
  ] as const;
  for (const table of order) {
    const rows = remapRows(load(table), remap);
    if (!DRY_RUN) {
      await postgrestInsert(table, rows);
    }
    const expected = rows.length;
    const actual = DRY_RUN ? expected : await postgrestCount(table);
    // Strict equality: on the fresh target this runbook mandates, anything
    // else (ignore-duplicates skipping a same-PK row, pre-existing rows)
    // is a divergence to investigate, not a pass.
    const ok = expected === actual;
    console.log(
      `${ok ? 'ok' : 'FAIL'}  ${table}: backup ${expected}, target ${actual}${DRY_RUN ? ' (dry run)' : ''}`,
    );
    if (!ok) process.exitCode = 1;
  }
  if (DRY_RUN) {
    console.log('\ndry run: no writes performed');
    return;
  }
  console.log('\nrestore complete; verify with npm run db:preflight and a smoke login per identity');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
