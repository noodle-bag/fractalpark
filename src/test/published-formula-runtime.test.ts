import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  createPublishedFormulaRuntimeLoaderV1,
  parsePublishedFormulaRuntimeIndexV1,
  PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1,
} from "@/engine/formulas/v1/published-runtime";
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from "@/engine/formulas/v1/revisions";
import { registerBuiltins } from "@/engine/plugins/builtins";
import { assembleShader } from "@/engine/shaders/assembler";

const ROOT = join(
  process.cwd(),
  "public/formula-library/v1/runtime/published",
);
const DECISIONS_PATH = join(
  process.cwd(),
  "resources/formula-library/v1/publication-decisions.json",
);
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

type JsonRecord = Record<string, unknown>;

function readJson(path: string): JsonRecord {
  return JSON.parse(readFileSync(path, "utf8")) as JsonRecord;
}

describe("published formula runtime loader", () => {
  beforeAll(() => registerBuiltins({ quiet: true }));

  it("builds an exact publish-only 534-row index with content-addressed bodies", () => {
    const decisions = readJson(DECISIONS_PATH);
    const expected = new Set(
      (decisions.rows as JsonRecord[])
        .filter((row) => row.publicationDecision === "publish")
        .map((row) => String(row.formulaId)),
    );
    const held = new Set(
      (decisions.rows as JsonRecord[])
        .filter((row) => row.publicationDecision !== "publish")
        .map((row) => String(row.formulaId)),
    );
    const manifest = readJson(join(ROOT, "manifest.json"));
    const indexBytes = readFileSync(join(ROOT, String(manifest.indexFile)));
    expect(sha256(indexBytes)).toBe(manifest.indexSha256);
    const index = JSON.parse(indexBytes.toString("utf8"));
    expect(sha256HexSyncV1(canonicalJsonV1(index, 131_072))).toBe(
      PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1,
    );
    expect(manifest.indexCanonicalSha256).toBe(
      PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1,
    );
    const parsed = parsePublishedFormulaRuntimeIndexV1(index);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.rowCount).toBe(expected.size);
    expect(parsed.value.rowCount).toBe(534);
    expect(new Set(parsed.value.rows.map((row) => row.formulaId))).toEqual(
      expected,
    );
    expect(
      parsed.value.rows.some((row) => held.has(row.formulaId)),
    ).toBe(false);
    expect(
      parsed.value.rows.filter((row) => row.profile.quality === "none"),
    ).toHaveLength(0);
    expect(
      parsed.value.rows.filter((row) => row.profile.quality === "mechanical"),
    ).toHaveLength(332);
    expect(
      parsed.value.rows.filter((row) => row.profile.quality === "family"),
    ).toHaveLength(202);

    const bodyFiles = readdirSync(join(ROOT, "definitions"));
    expect(bodyFiles).toHaveLength(expected.size);
    for (const row of parsed.value.rows) {
      const body = readFileSync(join(ROOT, row.definitionPath));
      expect(sha256(body)).toBe(row.sourceRevision);
    }
    expect(indexBytes.toString("utf8")).not.toContain('"definition":');
  });

  it("loads and compiles one function-slot formula while rejecting unknown and tampered bodies", async () => {
    const index = readJson(join(ROOT, "index.json"));
    const loaderResult = createPublishedFormulaRuntimeLoaderV1(
      index,
      async (path) => readFileSync(join(ROOT, path), "utf8"),
    );
    expect(loaderResult.ok).toBe(true);
    if (!loaderResult.ok) return;
    const row = loaderResult.value.index.rows.find(
      (entry) => entry.parameters.filter((parameter) => parameter.type === "function").length >= 4,
    );
    if (!row) throw new Error("function-slot-row-missing");
    const loaded = await loaderResult.value.load(row.formulaId);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(
        loaded.value.descriptor.parameters.filter(
          (parameter) => parameter.type === "function",
        ),
      ).toHaveLength(4);
    }
    await expect(
      loaderResult.value.load("00000000-0000-4000-8000-000000000000"),
    ).resolves.toEqual({ ok: false, code: "formula-not-published" });

    const tamperedLoader = createPublishedFormulaRuntimeLoaderV1(
      index,
      async (path) => `${readFileSync(join(ROOT, path), "utf8")}\n; tampered`,
    );
    expect(tamperedLoader.ok).toBe(true);
    if (!tamperedLoader.ok) return;
    await expect(tamperedLoader.value.load(row.formulaId)).resolves.toEqual({
      ok: false,
      code: "definition-compile-failed",
    });
  });

  it("snapshots and deeply freezes the validated index before lookup", () => {
    const index = readJson(join(ROOT, "index.json"));
    const loader = createPublishedFormulaRuntimeLoaderV1(index, async () => "");
    expect(loader.ok).toBe(true);
    if (!loader.ok) return;
    const first = loader.value.index.rows[0];
    if (!first) throw new Error("runtime-index-row-missing");
    expect(Object.isFrozen(loader.value.index)).toBe(true);
    expect(Object.isFrozen(loader.value.index.rows)).toBe(true);
    expect(Object.isFrozen(first.parameters)).toBe(true);
    expect(Object.isFrozen(first.profile)).toBe(true);
    const rawRows = index.rows as JsonRecord[];
    rawRows[0] = { ...rawRows[0], formulaId: "mutated" };
    expect(loader.value.get(first.formulaId)).toBe(first);
    expect(loader.value.get("mutated")).toBeUndefined();
  });

  it("fails closed when the indexed parameter descriptor drifts", () => {
    const index = readJson(join(ROOT, "index.json"));
    const rows = index.rows as JsonRecord[];
    const row = rows.find(
      (candidate) =>
        Array.isArray(candidate.parameters) &&
        (candidate.parameters as JsonRecord[]).some(
          (parameter) => parameter.type === "real",
        ),
    );
    if (!row) throw new Error("real-parameter-row-missing");
    const parameterIndex = (row.parameters as JsonRecord[]).findIndex(
      (parameter) => parameter.type === "real",
    );
    const parameter = (row.parameters as JsonRecord[])[parameterIndex];
    const changed = structuredClone(index);
    const changedRow = (changed.rows as JsonRecord[]).find(
      (candidate) => candidate.formulaId === row.formulaId,
    );
    if (!changedRow) throw new Error("changed-parameter-row-missing");
    const changedParameters = changedRow.parameters as JsonRecord[];
    changedParameters[parameterIndex] = {
      ...changedParameters[parameterIndex],
      default: Number(parameter.default) + 1,
    };
    expect(
      createPublishedFormulaRuntimeLoaderV1(changed, async () => ""),
    ).toEqual({ ok: false, code: "index-invalid" });
  });

  it("rejects a held-ID substitution that preserves row and basis counts", () => {
    const index = readJson(join(ROOT, "index.json"));
    const decisions = readJson(DECISIONS_PATH);
    const held = (decisions.rows as JsonRecord[]).find(
      (row) => row.publicationDecision === "hold",
    );
    if (!held) throw new Error("held-formula-row-missing");
    const changed = structuredClone(index);
    const rows = changed.rows as JsonRecord[];
    rows[0] = { ...rows[0], formulaId: held.formulaId };
    expect(changed.rowCount).toBe(534);
    expect(
      rows.filter(
        (row) => row.implementationBasis === "separated-independent-rewrite",
      ),
    ).toHaveLength(339);
    expect(
      createPublishedFormulaRuntimeLoaderV1(changed, async () => ""),
    ).toEqual({ ok: false, code: "index-invalid" });
  });

  it("fails closed on duplicate, malformed, or path/hash-inconsistent index rows", () => {
    const index = readJson(join(ROOT, "index.json"));
    const rows = index.rows as JsonRecord[];
    expect(
      parsePublishedFormulaRuntimeIndexV1({
        ...index,
        rows: [rows[0], rows[0]],
        rowCount: 2,
      }),
    ).toEqual({ ok: false, code: "index-invalid" });
    expect(
      parsePublishedFormulaRuntimeIndexV1({
        ...index,
        rows: [
          {
            ...rows[0],
            definitionPath: `definitions/${"0".repeat(64)}.frm`,
          },
          ...rows.slice(1),
        ],
      }),
    ).toEqual({ ok: false, code: "index-invalid" });
  });

  it(
    "parses, validates, compiles, and assembles every published definition",
    async () => {
      const index = readJson(join(ROOT, "index.json"));
      const loader = createPublishedFormulaRuntimeLoaderV1(
        index,
        async (path) => readFileSync(join(ROOT, path), "utf8"),
      );
      expect(loader.ok).toBe(true);
      if (!loader.ok) return;
      let assembled = 0;
      for (const row of loader.value.index.rows) {
        const loaded = await loader.value.load(row.formulaId);
        expect(loaded.ok, row.formulaId).toBe(true);
        if (!loaded.ok) continue;
        const shader = assembleShader(
          {
            formulaId: row.formulaId,
            outsideColoringId: "smooth",
            insideColoringId: "black",
            transformId: "none",
            pipelineVersion: 2,
          },
          loaded.value.plugin,
        );
        expect(shader).toContain("frmV1ResetState");
        expect(shader).toContain("frmV1ShouldContinue");
        expect(shader).not.toContain("/* INJECT_");
        assembled += 1;
      }
      expect(assembled).toBe(loader.value.index.rowCount);
    },
    120_000,
  );
});
