import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260816090000_mine_formula_lifecycle.sql",
  ),
  "utf8",
);

describe("Mine formula lifecycle migration contract", () => {
  it("adds forward-only revision storage and private ACLs", () => {
    expect(migration).toContain("create table public.custom_formula_revisions");
    expect(migration).toContain(
      "alter table public.custom_formula_revisions force row level security",
    );
    expect(migration).toContain(
      "revoke all privileges on table public.custom_formula_revisions from public, anon, authenticated",
    );
  });

  it("models editable and runnable heads with invalid-draft preservation", () => {
    expect(migration).toContain("editable_head_revision_id");
    expect(migration).toContain("active_runnable_revision_id");
    expect(migration).toContain(
      "check (not runnable or jsonb_array_length(diagnostics) = 0)",
    );
    expect(migration).toContain(
      "check (runnable or jsonb_array_length(diagnostics) > 0)",
    );
    expect(migration).toContain("custom_formula_revisions_head_identity_idx");
    expect(migration).toContain(
      "foreign key (editable_head_revision_id, id, owner_id)",
    );
    expect(migration).toContain("revision = v_next_revision");
    expect(migration).toContain("v_next_revision := v_formula.revision + 1");
    expect(migration).not.toContain("v_next_revision := 1;");
    expect(migration).not.toContain("custom_formulas_lifecycle_heads_coherent");
  });

  it("serializes owner writes and keeps import/remix/source provenance out of public fields", () => {
    expect(migration).toContain(
      "pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0))",
    );
    expect(migration).toContain("p_supersedes uuid default null");
    expect(migration).toContain("p_imported_from_formula_id uuid default null");
    expect(migration).toContain("p_remixed_from_formula_id uuid default null");
    expect(migration).toContain("p_lineage_source_revision text default null");
    expect(migration).toContain("p_lineage_profile_revision text default null");
    expect(migration).toContain(
      "octet_length(coalesce(p_definition->>'source', '')) > 65536",
    );
    expect(migration).not.toContain("original_source");
    expect(migration).not.toContain("originalSource");
    expect(migration).toContain("custom_formula_revisions_immutable");
    expect(migration).toContain("custom_formulas_runnable_head_guard");
    expect(migration).toContain(
      "revoke all privileges on table public.custom_formula_revisions from public, anon, authenticated, service_role",
    );
    expect(migration).not.toContain(
      "grant select, insert, update, delete on table public.custom_formula_revisions",
    );
  });
});
