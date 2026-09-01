import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

const readSource = (path: string): string =>
  readFileSync(join(process.cwd(), path), 'utf8');

const expectInOrder = (source: string, entries: string[]): void => {
  let cursor = -1;
  for (const entry of entries) {
    const index = source.indexOf(entry, cursor + 1);
    expect(index, `missing ordered entry: ${entry}`).toBeGreaterThan(cursor);
    cursor = index;
  }
};

const tempDirs: string[] = [];

const writeBackupFixture = (options: {
  lifecycleMigration: boolean;
  includeRevisions: boolean;
}): string => {
  const directory = mkdtempSync(join(tmpdir(), 'fractalpark-restore-contract-'));
  tempDirs.push(directory);
  const formulaId = '11111111-1111-4111-8111-111111111111';
  const ownerId = '22222222-2222-4222-8222-222222222222';
  const revisionId = '33333333-3333-4333-8333-333333333333';
  const rowsByFile: Record<string, unknown[]> = {
    profiles: [],
    artwork_drafts: [],
    custom_formulas: options.includeRevisions
      ? [
          {
            id: formulaId,
            owner_id: ownerId,
            editable_head_revision_id: revisionId,
            active_runnable_revision_id: revisionId,
          },
        ]
      : [],
    artwork_publications: [],
    artwork_operations: [],
    resource_cleanup_jobs: [],
    auth_users: [],
    schema_migrations: options.lifecycleMigration
      ? [{ version: '20260816090000' }]
      : [{ version: '20260803120000' }],
  };
  if (options.includeRevisions) {
    rowsByFile.custom_formula_revisions = [
      {
        id: revisionId,
        formula_id: formulaId,
        owner_id: ownerId,
        runnable: true,
      },
    ];
  }

  const files: Record<string, { rows: number; sha256: string }> = {};
  for (const [name, rows] of Object.entries(rowsByFile)) {
    const text = `${JSON.stringify(rows, null, 2)}\n`;
    writeFileSync(join(directory, `${name}.json`), text);
    files[name] = {
      rows: rows.length,
      sha256: createHash('sha256').update(text).digest('hex'),
    };
  }
  writeFileSync(
    join(directory, 'manifest.json'),
    `${JSON.stringify({ files }, null, 2)}\n`,
  );
  return directory;
};

const restoreDryRun = (directory: string) =>
  spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/restore-cloud.ts',
      '--in',
      directory,
      '--dry-run',
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        SUPABASE_SERVICE_ROLE_KEY: 'dry-run-fixture-key',
      },
    },
  );

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('cloud backup and restore durable-table contract', () => {
  it('exports and restores formula revisions after their parent formulas', () => {
    const backup = readSource('scripts/backup-cloud.ts');
    const restore = readSource('scripts/restore-cloud.ts');

    expectInOrder(backup, [
      "['custom_formulas', 'id']",
      "['custom_formula_revisions', 'formula_id, revision']",
      "['artwork_publications', 'id']",
    ]);
    expect(backup).toContain(
      'supabase_migrations.schema_migrations order by version',
    );
    expectInOrder(restore, [
      "'custom_formulas'",
      "'custom_formula_revisions'",
      "'artwork_publications'",
    ]);
    expect(restore).toContain(
      '/rest/v1/rpc/fractalpark_custom_formula_restore_revision',
    );
    expect(restore).toContain(
      '/rest/v1/rpc/fractalpark_custom_formula_restore_heads',
    );
  });

  it('keeps the migration and recovery runbook bound to the same durable table', () => {
    const migration = readSource(
      'supabase/migrations/20260816090000_mine_formula_lifecycle.sql',
    );
    const recoveryPrivileges = readSource(
      'supabase/migrations/20260902002500_custom_formula_revision_backup_restore_privileges.sql',
    );
    const runbook = readSource('docs/runbooks/cloud-backup-recovery.md');

    expect(migration).toContain('create table public.custom_formula_revisions');
    expect(recoveryPrivileges).toContain(
      'grant select on table public.custom_formula_revisions',
    );
    expect(recoveryPrivileges).toContain(
      'revoke insert, update, delete on table public.custom_formula_revisions',
    );
    expect(recoveryPrivileges).not.toContain(
      'grant select, insert, update, delete',
    );
    expect(recoveryPrivileges).toContain(
      "set_config('fractalpark.formula_restore', 'on', true)",
    );
    expect(recoveryPrivileges).toContain(
      'security definer\nset search_path',
    );
    expect(recoveryPrivileges).toContain(
      'grant execute on function public.fractalpark_custom_formula_restore_heads',
    );
    expect(recoveryPrivileges).toContain("notify pgrst, 'reload schema'");
    expect(runbook).toContain('`custom_formula_revisions`');
  });

  it('restores a pre-lifecycle snapshot without a revisions payload', () => {
    const result = restoreDryRun(
      writeBackupFixture({ lifecycleMigration: false, includeRevisions: false }),
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      'skip custom_formula_revisions: pre-lifecycle backup',
    );
  });

  it('rejects a lifecycle snapshot that omits its revisions payload', () => {
    const result = restoreDryRun(
      writeBackupFixture({ lifecycleMigration: true, includeRevisions: false }),
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'backup includes the formula lifecycle migration but omits custom_formula_revisions.json',
    );
  });

  it('accepts a complete lifecycle snapshot', () => {
    const result = restoreDryRun(
      writeBackupFixture({ lifecycleMigration: true, includeRevisions: true }),
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      'ok  custom_formula_revisions: backup 1, target 1 (dry run)',
    );
    expect(result.stdout).toContain('formula head pointers: 1 restored (dry run)');
  });
});
