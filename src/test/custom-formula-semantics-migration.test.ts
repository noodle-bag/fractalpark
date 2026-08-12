import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migrationPath = join(
  root,
  'supabase/migrations/20260812000000_custom_formula_semantics_rpc.sql',
);
const schemaTestPath = join(root, 'scripts/cloud-schema-test.ts');

describe('custom formula semantics RPC migration contract', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  const schemaBattery = readFileSync(schemaTestPath, 'utf8');

  it('removes the old overload and exposes one ten-argument service-role RPC', () => {
    expect(migration).toContain(
      'drop function public.fractalpark_custom_formula_save(',
    );
    expect(migration).toMatch(
      /p_quota integer default 50,\s+p_frm_semantics_version smallint default null/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.fractalpark_custom_formula_save\([\s\S]*smallint[\s\S]*\) to service_role;/,
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.fractalpark_custom_formula_save\([\s\S]*integer\s*\) to service_role;[\s\S]*grant execute on function public\.fractalpark_custom_formula_save\([\s\S]*smallint/,
    );
    expect(migration).toContain("notify pgrst, 'reload schema';");
  });

  it('validates and persists explicit versions while preserving ordinary updates', () => {
    expect(migration).toContain('p_frm_semantics_version not in (1, 2)');
    expect(migration).toMatch(
      /insert into public\.custom_formulas \([\s\S]*frm_semantics_version[\s\S]*p_frm_semantics_version[\s\S]*\) returning \* into v_formula;/,
    );
    expect(migration).toMatch(
      /frm_semantics_version = coalesce\(\s*p_frm_semantics_version,\s*v_formula\.frm_semantics_version\s*\)/,
    );
  });

  it('keeps a database-backed battery for create, preserve, revert, and reject', () => {
    expect(schemaBattery).toContain(
      'custom_formula_save persists explicit FRM semantics and preserves it on ordinary updates',
    );
    expect(schemaBattery).toContain("p_frm_semantics_version: 2");
    expect(schemaBattery).toContain("ordinary update must preserve v2");
    expect(schemaBattery).toContain("explicit revert must persist v1");
    expect(schemaBattery).toContain("p_frm_semantics_version: 3");
  });
});
