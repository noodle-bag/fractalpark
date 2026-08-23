import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { hashFrmLikeV1, parseFrmLikeV1 } from "@/engine/frm/v1";
import { NATIVE_RECIPE_HOLDS_V1 } from "@/engine/formulas/v1/native-recipes-b94-held";
import {
  NATIVE_FORMULA_RECIPES_V1,
  validateNativeRecipeV1,
} from "@/engine/formulas/v1/native-recipes";
import { registerBuiltins } from "@/engine/plugins/builtins";

type JsonRecord = Record<string, unknown>;

const RUNTIME_DIR = join(
  process.cwd(),
  "resources/formula-library/v1/runtime/rev4",
);
const DECISIONS_PATH = join(
  process.cwd(),
  "resources/formula-library/v1/publication-decisions.json",
);
const SHA256 = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJson(path: string): JsonRecord {
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isRecord(value)) throw new Error("test-json-invalid");
  return value;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

describe("formula runtime revision 4 public assets", () => {
  beforeAll(() => registerBuiltins({ quiet: true }));

  it("contains exactly the 106 direct-adaptation and 68 project-owned published rows", () => {
    const decisions = readJson(DECISIONS_PATH);
    expect(decisions.decisionRevision).toBe(3);
    expect(decisions.contentHash).toBe(
      "7106736785e8bbb7cc310056f93f550413b6a0b76ad21e648b50e55480a2a52c",
    );
    expect(decisions.decisionCounts).toEqual({
      publish: 513,
      hold: 164,
      exclude: 0,
    });
    expect(Array.isArray(decisions.rows)).toBe(true);
    const expected = (decisions.rows as unknown[])
      .filter(
        (row): row is JsonRecord =>
          isRecord(row) &&
          row.publicationDecision === "publish" &&
          (row.implementationBasis === "direct-adaptation" ||
            row.implementationBasis === "project-owned"),
      )
      .map((row) => String(row.formulaId));
    const manifest = readJson(join(RUNTIME_DIR, "manifest.json"));
    expect(manifest).toMatchObject({
      schema: "fractalpark-formula-library-runtime-manifest/v1",
      decisionRevision: 3,
      runtimeRevision: 4,
      rowCount: 174,
      shardCount: 3,
      publicationDecisionsContentHash: decisions.contentHash,
    });
    expect(manifest.releaseManifestSha256).toMatch(SHA256);
    expect(Array.isArray(manifest.shards)).toBe(true);
    const publicRows: JsonRecord[] = [];
    const expectedFiles = ["manifest.json"];
    for (const [index, rawEntry] of (
      manifest.shards as unknown[]
    ).entries()) {
      expect(isRecord(rawEntry)).toBe(true);
      if (!isRecord(rawEntry)) throw new Error("test-shard-entry-invalid");
      const file = String(rawEntry.file);
      expectedFiles.push(file);
      const bytes = readFileSync(join(RUNTIME_DIR, file));
      expect(sha256(bytes)).toBe(rawEntry.sha256);
      const shard = JSON.parse(bytes.toString("utf8")) as unknown;
      expect(isRecord(shard)).toBe(true);
      if (!isRecord(shard)) throw new Error("test-shard-invalid");
      expect(shard).toMatchObject({
        schema: "fractalpark-formula-library-runtime-shard/v1",
        decisionRevision: 3,
        runtimeRevision: 4,
        shardIndex: index,
        shardCount: 3,
      });
      expect(Array.isArray(shard.rows)).toBe(true);
      publicRows.push(...(shard.rows as JsonRecord[]));
    }
    expect(sorted(readdirSync(RUNTIME_DIR))).toEqual(sorted(expectedFiles));
    expect(publicRows).toHaveLength(174);
    expect(
      sorted(publicRows.map((row) => String(row.formulaId))),
    ).toEqual(sorted(expected));
    expect(
      publicRows.filter(
        (row) => row.implementationBasis === "direct-adaptation",
      ),
    ).toHaveLength(106);
    expect(
      publicRows.filter((row) => row.implementationBasis === "project-owned"),
    ).toHaveLength(68);
  });

  it("pins every source byte string to sourceRevision and semanticHash", async () => {
    const manifest = readJson(join(RUNTIME_DIR, "manifest.json"));
    if (!Array.isArray(manifest.shards)) throw new Error("test-manifest-invalid");
    const seen = new Set<string>();
    for (const rawEntry of manifest.shards) {
      if (!isRecord(rawEntry)) throw new Error("test-shard-entry-invalid");
      const shard = readJson(join(RUNTIME_DIR, String(rawEntry.file)));
      if (!Array.isArray(shard.rows)) throw new Error("test-shard-invalid");
      for (const rawRow of shard.rows) {
        if (!isRecord(rawRow)) throw new Error("test-row-invalid");
        const formulaId = String(rawRow.formulaId);
        const definition = String(rawRow.definition);
        expect(seen.has(formulaId)).toBe(false);
        seen.add(formulaId);
        expect(sha256(definition)).toBe(rawRow.sourceRevision);
        const parsed = parseFrmLikeV1(definition);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) continue;
        const revisions = await hashFrmLikeV1(definition, parsed.ir);
        expect(revisions.sourceRevision).toBe(rawRow.sourceRevision);
        expect(revisions.semanticHash).toBe(rawRow.semanticHash);
      }
    }
    expect(seen.size).toBe(174);
  });

  it("keeps 68 public project-owned rows while all 21 recovered recipes remain decision-held", async () => {
    const manifest = readJson(join(RUNTIME_DIR, "manifest.json"));
    if (!Array.isArray(manifest.shards)) throw new Error("test-manifest-invalid");
    const publicById = new Map<string, JsonRecord>();
    for (const rawEntry of manifest.shards) {
      if (!isRecord(rawEntry)) throw new Error("test-shard-entry-invalid");
      const shard = readJson(join(RUNTIME_DIR, String(rawEntry.file)));
      if (!Array.isArray(shard.rows)) throw new Error("test-shard-invalid");
      for (const rawRow of shard.rows) {
        if (!isRecord(rawRow)) throw new Error("test-row-invalid");
        publicById.set(String(rawRow.formulaId), rawRow);
      }
    }

    const decisions = readJson(DECISIONS_PATH);
    if (!Array.isArray(decisions.rows)) throw new Error("test-decisions-invalid");
    const projectHeldIds = new Set(
      decisions.rows
        .filter(
          (row): row is JsonRecord =>
            isRecord(row) &&
            row.rightsStatus === "project-owned" &&
            row.publicationDecision === "hold",
        )
        .map((row) => String(row.formulaId)),
    );
    expect(projectHeldIds.size).toBe(21);

    const recipeById = new Map(
      NATIVE_FORMULA_RECIPES_V1.map((recipe) => [recipe.formulaId as string, recipe]),
    );
    expect(recipeById.size).toBe(89);
    const publicationHoldIds = new Set(
      NATIVE_RECIPE_HOLDS_V1.map((entry) => entry.recipe.formulaId as string),
    );
    expect(publicationHoldIds.size).toBe(21);
    expect(publicationHoldIds).toEqual(projectHeldIds);
    const recoveredHeldIds = [...publicationHoldIds];
    expect(recoveredHeldIds).toHaveLength(21);
    for (const formulaId of recoveredHeldIds) {
      expect(publicationHoldIds.has(formulaId)).toBe(true);
      expect(recipeById.has(formulaId)).toBe(true);
      expect(publicById.has(formulaId)).toBe(false);
    }

    const publicProjectRows = [...publicById.values()].filter(
      (row) => row.implementationBasis === "project-owned",
    );
    expect(publicProjectRows).toHaveLength(68);
    for (const row of publicProjectRows) {
      const formulaId = String(row.formulaId);
      expect(projectHeldIds.has(formulaId)).toBe(false);
      const recipe = recipeById.get(formulaId);
      expect(recipe).toBeDefined();
      if (!recipe) continue;
      const validated = await validateNativeRecipeV1(recipe);
      expect(validated.ok).toBe(true);
      if (!validated.ok) continue;
      expect(row.definition).toBe(validated.definition.source);
      expect(row.sourceRevision).toBe(validated.sourceRevision);
      expect(row.semanticHash).toBe(validated.semanticHash);
    }

  });
});
