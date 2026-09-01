import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "src");

function sourceFiles(directory = ROOT): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "test") return [];
      return sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function filesMatching(pattern: RegExp): string[] {
  return sourceFiles()
    .filter((path) => pattern.test(readFileSync(path, "utf8")))
    .map((path) => relative(process.cwd(), path).replaceAll("\\", "/"))
    .sort();
}

describe("Julia runtime consumer inventory", () => {
  it("keeps every renderer projection on the shared effective gate", () => {
    expect(filesMatching(/documentToRuntimeParams\(/)).toEqual([
      "src/app/[locale]/gallery/[slug]/page.tsx",
      "src/cli/render-commands.ts",
      "src/cli/score-commands.ts",
      "src/engine/document-adapter.ts",
      "src/engine/render-snapshot.ts",
      "src/hooks/useExploreDocumentState.ts",
      "src/lib/artwork-preview.ts",
      "src/lib/gallery-presets.ts",
      "src/lib/published-artworks.ts",
    ]);
  });

  it("allows raw Julia intent reads only in classified persistence and mutation paths", () => {
    expect(filesMatching(/\.formula\.isJulia/)).toEqual([
      "src/cli/explore-commands.ts",
      "src/components/fractal/FrmEditorWorkspace.tsx",
      "src/content/published-formula-directory.ts",
      "src/engine/document-adapter.ts",
      "src/engine/document-migrate.ts",
      "src/engine/document-v3.ts",
      "src/lib/frm-semantics-comparison.ts",
    ]);
    expect(filesMatching(/\.formula\.juliaC/)).toEqual([
      "src/cli/explore-commands.ts",
      "src/components/fractal/FrmEditorWorkspace.tsx",
      "src/content/published-formula-directory.ts",
      "src/engine/document-adapter.ts",
      "src/engine/document-v3.ts",
      "src/hooks/useExploreDocumentState.ts",
      "src/lib/cloud/envelope.ts",
      "src/lib/frm-semantics-comparison.ts",
    ]);
  });

  it("has no production consumer trusting a broad plugin supportsJulia property", () => {
    expect(filesMatching(/\.supportsJulia\b/)).toEqual([]);
  });

  it("keeps predecessor Profile resolution isolated from product consumers", () => {
    expect(filesMatching(/resolvePublishedFormulaDefaultProfileV1/)).toEqual([
      "src/engine/formulas/v1/published-runtime.ts",
    ]);
    expect(filesMatching(/resolveActivatedPublishedFormulaDefaultProfileV1/)).toEqual([
      "src/app/[locale]/explore/ExploreClient.tsx",
      "src/engine/formulas/v1/julia-runtime-activation-v1.ts",
      "src/lib/formula-records.ts",
      "src/lib/published-formula-remix.ts",
    ]);
  });

  it("keeps URL serialization on the lossless pre-gate projection", () => {
    const urlSource = readFileSync(join(ROOT, "lib/url-params.ts"), "utf8");
    expect(urlSource).toContain("projectDocumentToRuntimeParams(doc)");
    expect(urlSource).not.toContain("const runtime = documentToRuntimeParams(doc)");
    for (const path of sourceFiles()) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/isJulia=\{[^}\n]*document\.formula\.isJulia/);
    }
  });
});
