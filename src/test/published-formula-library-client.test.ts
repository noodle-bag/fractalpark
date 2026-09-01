import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  createPublishedFormulaLibraryClient,
  PUBLISHED_FORMULA_LIBRARY_DIRECTORY_URL,
  PUBLISHED_FORMULA_LIBRARY_INDEX_URL,
  PUBLISHED_FORMULA_LIBRARY_ROOT_URL,
} from "@/lib/published-formula-library";
import { pickPublishedFormulaLuckyRow } from "@/lib/published-formula-selection";
import { buildPublishedFormulaSourceReferenceV1 } from "@/lib/published-formula-source";
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from "@/engine/formulas/v1";

const ROOT = join(
  process.cwd(),
  "public/formula-library/v1/runtime/published",
);
const DIRECTORY_PATH = join(
  process.cwd(),
  "public/formula-library/v1/directory/index.json",
);
const ALIASES_PATH = join(
  process.cwd(),
  "resources/formula-library/v1/legacy-formula-aliases.json",
);

function readIndexText(): string {
  return readFileSync(join(ROOT, "index.json"), "utf8");
}

function readIndex(): unknown {
  return JSON.parse(readIndexText());
}

describe("published formula library client", () => {
  it("loads the compact index first and fetches only the selected Definition", async () => {
    const index = readIndex() as {
      rows: Array<{
        formulaId: string;
        definitionPath: string;
        sourceRevision: string;
        semanticHash: string;
      }>;
    };
    const selected = index.rows.find((row) => row.definitionPath.endsWith(".frm"));
    expect(selected).toBeDefined();

    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === PUBLISHED_FORMULA_LIBRARY_INDEX_URL) {
        return new Response(readIndexText(), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === PUBLISHED_FORMULA_LIBRARY_DIRECTORY_URL) {
        return new Response(readFileSync(DIRECTORY_PATH, "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      const prefix = `${PUBLISHED_FORMULA_LIBRARY_ROOT_URL}/`;
      expect(url.startsWith(prefix)).toBe(true);
      const relative = url.slice(prefix.length);
      return new Response(readFileSync(join(ROOT, relative), "utf8"), {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    });

    const created = await createPublishedFormulaLibraryClient(fetcher);
    expect(created.ok).toBe(true);
    if (!created.ok || !selected) return;

    expect(created.value.index.rows).toHaveLength(534);
    expect(created.value.directory.rows).toHaveLength(534);
    expect(created.value.directory.categoryCounts.classic).toBe(94);
    expect(created.value.directory.categoryCounts["root-finding"]).toBe(14);
    const runtimeAliases = (
      JSON.parse(readFileSync(ALIASES_PATH, "utf8")) as {
        aliases: Array<{ kind: string; value: string; formulaId: string }>;
      }
    ).aliases.filter((alias) => alias.kind === "runtime-id");
    expect(runtimeAliases).toHaveLength(94);
    expect(Object.keys(created.value.directory.runtimeAliasFormulaIds)).toHaveLength(94);
    for (const alias of runtimeAliases) {
      expect(created.value.resolveRuntimeAlias(alias.value)?.formulaId).toBe(
        alias.formulaId,
      );
    }
    expect(fetcher).toHaveBeenCalledTimes(2);

    const classicIds = new Set<string>(
      created.value.directory.rows
        .filter((row) => row.categories.includes("classic"))
        .map((row) => row.formulaId),
    );
    const nonClassicIndex = created.value.index.rows.findIndex(
      (row) => !classicIds.has(row.formulaId),
    );
    expect(nonClassicIndex).toBeGreaterThanOrEqual(0);
    expect(
      pickPublishedFormulaLuckyRow(
        created.value.index.rows,
        undefined,
        () => (nonClassicIndex + 0.5) / created.value.index.rows.length,
      )?.formulaId,
    ).toBe(created.value.index.rows[nonClassicIndex]?.formulaId);

    const loaded = await created.value.load(selected.formulaId);
    expect(loaded.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[2]?.[0]).toBe(
      `${PUBLISHED_FORMULA_LIBRARY_ROOT_URL}/${selected.definitionPath}`,
    );

    const sourceReference = buildPublishedFormulaSourceReferenceV1(selected);
    expect(sourceReference).toBeDefined();
    if (!sourceReference) return;
    const source = await created.value.loadSource(sourceReference);
    expect(source.ok).toBe(true);
    // Runtime compile and both source workspaces share one verified cache.
    expect(fetcher).toHaveBeenCalledTimes(3);

    const other = index.rows.find((row) => row.formulaId !== selected.formulaId);
    const otherReference = other
      ? buildPublishedFormulaSourceReferenceV1(other)
      : undefined;
    expect(otherReference).toBeDefined();
    if (!otherReference) return;
    await expect(
      created.value.loadSource({
        ...otherReference,
        formulaId: selected.formulaId,
      }),
    ).resolves.toEqual({ ok: false, code: "source-authority-mismatch" });
    expect(fetcher).toHaveBeenCalledTimes(3);

    const missing = await created.value.load(
      "00000000-0000-4000-8000-000000000000",
    );
    expect(missing).toEqual({ ok: false, code: "formula-not-published" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("fails closed when the index cannot be fetched or validated", async () => {
    const unavailable = await createPublishedFormulaLibraryClient(
      vi.fn(async () => new Response("unavailable", { status: 503 })),
    );
    expect(unavailable).toEqual({ ok: false, code: "library-unavailable" });

    const invalid = await createPublishedFormulaLibraryClient(
      vi.fn(async (input: RequestInfo | URL) =>
        new Response(
          String(input) === PUBLISHED_FORMULA_LIBRARY_INDEX_URL
            ? JSON.stringify({ schema: "wrong", rows: [] })
            : readFileSync(DIRECTORY_PATH, "utf8"),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );
    expect(invalid).toEqual({ ok: false, code: "index-invalid" });
  });

  it("fails closed when the Directory is not byte-bound to the runtime index", async () => {
    const reformattedIndex = JSON.stringify(readIndex());
    const result = await createPublishedFormulaLibraryClient(
      vi.fn(async (input: RequestInfo | URL) =>
        new Response(
          String(input) === PUBLISHED_FORMULA_LIBRARY_INDEX_URL
            ? reformattedIndex
            : readFileSync(DIRECTORY_PATH, "utf8"),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );
    expect(result).toEqual({ ok: false, code: "directory-invalid" });
  });

  it("rejects a self-hashed Directory that swaps the curated Classic membership", async () => {
    const directory = JSON.parse(readFileSync(DIRECTORY_PATH, "utf8")) as {
      contentHash: string;
      rows: Array<{
        formulaId: string;
        primaryFamily: string;
        categories: string[];
      }>;
      [key: string]: unknown;
    };
    const originalHash = directory.contentHash;
    const classic = directory.rows.find((row) => row.categories.includes("classic"));
    const replacement = directory.rows.find(
      (row) => !row.categories.includes("classic"),
    );
    expect(classic).toBeDefined();
    expect(replacement).toBeDefined();
    if (!classic || !replacement) return;
    classic.categories = [classic.primaryFamily];
    replacement.categories = ["classic", replacement.primaryFamily];
    const unsigned: Record<string, unknown> = { ...directory };
    delete unsigned.contentHash;
    directory.contentHash = sha256HexSyncV1(canonicalJsonV1(unsigned, 262_144));
    expect(directory.contentHash).not.toBe(originalHash);
    expect(
      directory.rows.filter((row) => row.categories.includes("classic")),
    ).toHaveLength(94);

    const result = await createPublishedFormulaLibraryClient(
      vi.fn(async (input: RequestInfo | URL) =>
        new Response(
          String(input) === PUBLISHED_FORMULA_LIBRARY_INDEX_URL
            ? readIndexText()
            : JSON.stringify(directory),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );
    expect(result).toEqual({ ok: false, code: "directory-invalid" });
  });
});
