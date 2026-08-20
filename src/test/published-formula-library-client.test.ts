import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  createPublishedFormulaLibraryClient,
  PUBLISHED_FORMULA_LIBRARY_INDEX_URL,
  PUBLISHED_FORMULA_LIBRARY_ROOT_URL,
} from "@/lib/published-formula-library";

const ROOT = join(
  process.cwd(),
  "public/formula-library/v1/runtime/published",
);

function readIndex(): unknown {
  return JSON.parse(readFileSync(join(ROOT, "index.json"), "utf8"));
}

describe("published formula library client", () => {
  it("loads the compact index first and fetches only the selected Definition", async () => {
    const index = readIndex() as {
      rows: Array<{ formulaId: string; definitionPath: string }>;
    };
    const selected = index.rows.find((row) => row.definitionPath.endsWith(".frm"));
    expect(selected).toBeDefined();

    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === PUBLISHED_FORMULA_LIBRARY_INDEX_URL) {
        return new Response(JSON.stringify(index), {
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

    expect(created.value.index.rows).toHaveLength(513);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const loaded = await created.value.load(selected.formulaId);
    expect(loaded.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      `${PUBLISHED_FORMULA_LIBRARY_ROOT_URL}/${selected.definitionPath}`,
    );

    const missing = await created.value.load(
      "00000000-0000-4000-8000-000000000000",
    );
    expect(missing).toEqual({ ok: false, code: "formula-not-published" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the index cannot be fetched or validated", async () => {
    const unavailable = await createPublishedFormulaLibraryClient(
      vi.fn(async () => new Response("unavailable", { status: 503 })),
    );
    expect(unavailable).toEqual({ ok: false, code: "library-unavailable" });

    const invalid = await createPublishedFormulaLibraryClient(
      vi.fn(async () =>
        new Response(JSON.stringify({ schema: "wrong", rows: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    expect(invalid).toEqual({ ok: false, code: "index-invalid" });
  });
});
