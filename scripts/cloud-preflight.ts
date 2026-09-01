/**
 * cloud-preflight — fail-closed environment gate for the creation loop.
 * Contract: docs/specs/web-creation-loop-v1.md §1.
 *
 * Two checks, both must pass:
 *
 * 1. Environment contract. With the master switch off (the default for
 *    production and ordinary previews), the check passes and reports which
 *    cloud variables happen to be set. With the switch on (only the
 *    designated integration preview), every required server-only variable
 *    must be present, and no NEXT_PUBLIC_ cloud variant may exist.
 *    Values are never printed.
 *
 * 2. Schema parity. The repo migration set is compared with the applied
 *    migrations reported by the Supabase CLI. Any drift fails the check:
 *    an old deployment meeting an incompatible schema must fail closed,
 *    never attempt repairs.
 *
 * Usage:
 *   npm run db:preflight               # env contract only
 *   npm run db:preflight -- --local    # + schema parity against local stack
 *   npm run db:preflight -- --linked   # + schema parity against linked staging
 */

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseAppliedMigrationVersions } from './cloud-migration-parity';

import { CLOUD_SERVER_ONLY_VARIABLES } from '../src/lib/cloud/config';

const REQUIRED_WHEN_ENABLED = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'FRACTALPARK_SESSION_ENCRYPTION_KEY',
  'FRACTALPARK_RATE_LIMIT_HMAC_KEY',
  'CRON_SECRET',
] as const;

function checkEnvContract(): boolean {
  const enabled = process.env.FRACTALPARK_CREATION_CLOUD_ENABLED === 'true';
  console.log(
    `==> Cloud feature switch: ${enabled ? 'ON (integration environment)' : 'off (default)'}`,
  );

  let ok = true;

  // Leak detection derives from the single source of truth in
  // src/lib/cloud/config.ts: every server-only cloud variable is forbidden
  // with a NEXT_PUBLIC_ prefix.
  const publicLeaks = CLOUD_SERVER_ONLY_VARIABLES.filter(
    (name) => process.env[`NEXT_PUBLIC_${name}`] !== undefined,
  ).map((name) => `NEXT_PUBLIC_${name}`);
  if (publicLeaks.length > 0) {
    ok = false;
    for (const name of publicLeaks) {
      console.error(
        `    FAIL: ${name} is a cloud variable with a public prefix. Cloud variables are server-only.`,
      );
    }
  }

  if (enabled) {
    const missing = REQUIRED_WHEN_ENABLED.filter(
      (name) => !process.env[name] || process.env[name]!.trim() === '',
    );
    for (const name of missing) {
      ok = false;
      console.error(`    FAIL: missing required variable ${name}`);
    }
    if (missing.length === 0) {
      console.log('    required server-only variables: present (values not shown)');
    }
    const backupEnabled =
      process.env.FRACTALPARK_ARTWORK_EMAIL_BACKUP_ENABLED === 'true';
    if (backupEnabled) {
      const smtpMissing = CLOUD_SERVER_ONLY_VARIABLES.filter(
        (name) =>
          name.startsWith('FRACTALPARK_SMTP_') &&
          (!process.env[name] || process.env[name]!.trim() === ''),
      );
      for (const name of smtpMissing) {
        ok = false;
        console.error(`    FAIL: backup email is on but ${name} is missing`);
      }
    }
  } else {
    const setCloudVars = CLOUD_SERVER_ONLY_VARIABLES.filter(
      (name) => process.env[name] && process.env[name]!.trim() !== '',
    );
    console.log(
      setCloudVars.length === 0
        ? '    no cloud variables set; site runs with the creation loop disabled.'
        : `    cloud variables set while the switch is off (inert): ${setCloudVars.join(', ')}`,
    );
  }
  return ok;
}

function checkSchemaParity(target: 'local' | 'linked'): boolean {
  const dir = join(process.cwd(), 'supabase', 'migrations');
  const repoVersions = readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => name.split('_')[0])
    .sort();
  console.log(
    `==> Schema parity (${target}): ${repoVersions.length} repo migration(s)`,
  );

  let out: string;
  try {
    const args =
      target === 'local'
        ? ['supabase', 'migration', 'list', '--local']
        : ['supabase', 'migration', 'list', '--linked'];
    out = execFileSync('npx', args, { encoding: 'utf-8' });
  } catch {
    console.error(
      '    FAIL: could not query applied migrations (is the stack running or the project linked?).',
    );
    return false;
  }
  console.log(
    out
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n'),
  );

  // CLI 2.111.0 can return either its historical backtick table or a wrapper
  // JSON payload. Both formats merge repo files and applied history; only the
  // Remote field/column may count as applied. Trusting Local makes drift
  // undetectable.
  const appliedVersions = parseAppliedMigrationVersions(out);
  const missing = repoVersions.filter((v) => !appliedVersions.has(v));
  const extra = [...appliedVersions].filter((v) => !repoVersions.includes(v));
  if (missing.length > 0) {
    console.error(
      `    FAIL: repo migrations not applied on ${target}: ${missing.join(', ')}. ` +
        'Fail closed: run the migration owner tool instead of letting the app reconcile.',
    );
    return false;
  }
  if (extra.length > 0) {
    console.error(
      `    FAIL: ${target} database has applied migrations with no repo file: ${extra.join(', ')}. ` +
        'Fail closed: the deployment is older than the schema and must not reconcile.',
    );
    return false;
  }
  console.log('    schema parity OK');
  return true;
}

function main(): void {
  const argv = process.argv.slice(2);
  const target = argv.includes('--local')
    ? ('local' as const)
    : argv.includes('--linked')
      ? ('linked' as const)
      : null;
  for (const arg of argv) {
    if (arg !== '--local' && arg !== '--linked') {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }

  const envOk = checkEnvContract();
  const schemaOk = target ? checkSchemaParity(target) : true;

  if (!envOk || !schemaOk) {
    console.error('==> Preflight FAILED (fail closed).');
    process.exit(1);
  }
  console.log('==> Preflight passed.');
}

main();
