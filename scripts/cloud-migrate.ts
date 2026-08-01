/**
 * cloud-migrate — the only sanctioned way to apply creation-loop
 * migrations. Contract: docs/specs/web-creation-loop-v1.md §1 and
 * docs/testing/v0.4.15-regression-matrix.md.
 *
 * Discipline encoded by this tool:
 * - Migrations run only when the designated migration owner executes this
 *   command explicitly. It is never invoked by build, application start,
 *   preview deploys, or health checks.
 * - The run is serial: one owner, one target, one confirmation at a time.
 * - Before applying anything it prints the repo migration set, the applied
 *   set reported by the Supabase CLI, the rollback boundary, and requires
 *   `--confirm` to proceed.
 *
 * Usage:
 *   npm run db:migrate -- --local [--confirm]
 *   npm run db:migrate -- --linked [--confirm]
 *
 * `--local`  applies migrations to the local Supabase stack
 *            (`npm run db:start`).
 * `--linked` applies migrations to the project linked via
 *            `supabase link` (the designated staging project). Requires
 *            FRACTALPARK_MIGRATION_TARGET=staging in the environment.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

type Target = 'local' | 'linked';

function parseArgs(argv: string[]): { target: Target; confirm: boolean } {
  let target: Target | null = null;
  let confirm = false;
  for (const arg of argv) {
    if (arg === '--local' || arg === '--linked') {
      if (target !== null && target !== arg.slice(2)) {
        console.error('Specify exactly one target: --local or --linked');
        process.exit(2);
      }
      target = arg.slice(2) as Target;
    } else if (arg === '--confirm') confirm = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  if (!target) {
    console.error('Specify exactly one target: --local or --linked');
    process.exit(2);
  }
  return { target, confirm };
}

function repoMigrations(): string[] {
  const dir = join(process.cwd(), 'supabase', 'migrations');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

function run(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function main(): void {
  const { target, confirm } = parseArgs(process.argv.slice(2));

  if (target === 'linked') {
    const declared = process.env.FRACTALPARK_MIGRATION_TARGET;
    if (declared !== 'staging') {
      console.error(
        'Refusing to run against a linked project: set FRACTALPARK_MIGRATION_TARGET=staging ' +
          'in the migration owner environment. Production is never a migration target for this tool.',
      );
      process.exit(1);
    }
  }

  const migrations = repoMigrations();
  console.log('==> Migration owner tool (creation loop)');
  console.log(`    target: ${target}`);
  console.log(`    repo migrations (${migrations.length}):`);
  for (const name of migrations) console.log(`      - ${name}`);
  if (migrations.length === 0) {
    console.log('      (none yet — schema migrations land with the schema commit)');
  }

  console.log('==> Applied migrations reported by Supabase CLI:');
  try {
    const listArgs =
      target === 'local'
        ? ['supabase', 'migration', 'list', '--local']
        : ['supabase', 'migration', 'list', '--linked'];
    const out = run('npx', listArgs);
    console.log(
      out
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n'),
    );
  } catch {
    console.error(
      '    Could not list applied migrations. Is the local stack running (`npm run db:start`), ' +
        'or the staging project linked?',
    );
    process.exit(1);
  }

  console.log('==> Rollback boundary:');
  console.log(
    '    Forward-only, serial migrations. Rollback = revert the application to the previous ' +
      'compatible version; never edit an applied migration file. Local recovery: `npm run db:reset`.',
  );

  if (!confirm) {
    console.log('==> Dry run. Re-run with --confirm to apply pending migrations.');
    return;
  }

  console.log('==> Applying migrations...');
  const upArgs =
    target === 'local'
      ? ['supabase', 'migration', 'up', '--local']
      : ['supabase', 'db', 'push'];
  try {
    execFileSync('npx', upArgs, { stdio: 'inherit' });
  } catch {
    console.error(
      '==> Migration failed. Fail closed: inspect the output above, recover ' +
        'the database per the rollback boundary, and re-run explicitly.',
    );
    process.exit(1);
  }
  console.log('==> Done. Record the applied versions in the pull request evidence.');
}

main();
