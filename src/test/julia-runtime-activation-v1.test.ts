import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import activationAsset from "../../resources/formula-library/v1/julia-runtime-activation.v1.json";
import skeletonAsset from "../../resources/formula-library/v1/julia-capability-census.v1.json";
import runtimeIndexAsset from "../../public/formula-library/v1/runtime/published/index.json";
import {
  documentToRuntimeParams,
  projectDocumentToRuntimeParams,
  resolveEffectiveJuliaStateV1,
} from "@/engine/document-adapter";
import { DEFAULT_FRACTAL_DOCUMENT, type FractalDocument } from "@/engine/document";
import {
  JULIA_RUNTIME_ACTIVATION_DENIED_COUNT_V1,
  JULIA_RUNTIME_ACTIVATION_MAX_BYTES_V1,
  JULIA_RUNTIME_ACTIVATION_SUPPORTED_COUNT_V1,
  JULIA_RUNTIME_ACTIVATION_V1,
  parseJuliaRuntimeActivationV1,
  resolveJuliaRuntimeCapabilityV1,
  verifyJuliaRuntimeActivationSetV1,
} from "@/engine/formulas/v1/julia-runtime-activation-v1";
import { compilePublishedFormulaPluginV1 } from "@/engine/formulas/v1/published-adapter";
import { registerBuiltins } from "@/engine/plugins/builtins";
import { pluginRegistry } from "@/engine/plugins/registry";
import type { FormulaPlugin } from "@/engine/plugins/types";

type RuntimeRow = (typeof runtimeIndexAsset.rows)[number];

function documentFor(formulaId: string): FractalDocument {
  const document = structuredClone(DEFAULT_FRACTAL_DOCUMENT);
  document.formula.formulaId = formulaId;
  document.formula.isJulia = true;
  document.formula.juliaC = [-0.745, 0.113];
  return document;
}

async function compileSupportedPlugin(): Promise<{
  row: RuntimeRow;
  plugin: FormulaPlugin;
}> {
  const supported = JULIA_RUNTIME_ACTIVATION_V1!.rows[0]!;
  const row = runtimeIndexAsset.rows.find(
    (candidate) => candidate.formulaId === supported.formulaId,
  );
  if (!row) throw new Error("supported-runtime-row-missing");
  const source = readFileSync(
    join(
      process.cwd(),
      "public/formula-library/v1/runtime/published",
      row.definitionPath,
    ),
    "utf8",
  );
  const compiled = await compilePublishedFormulaPluginV1({
    formulaId: row.formulaId,
    displayName: row.displayName,
    family: row.family,
    sourceRevision: row.sourceRevision,
    semanticHash: row.semanticHash,
    source,
  });
  if (!compiled.ok) throw new Error(compiled.code);
  return { row, plugin: compiled.value.plugin };
}

describe("Julia runtime activation v1", () => {
  beforeAll(() => registerBuiltins({ quiet: true }));

  it("ships a bounded, immutable, exact-195 supported-only projection", () => {
    const parsed = parseJuliaRuntimeActivationV1(activationAsset);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.rows).toHaveLength(
      JULIA_RUNTIME_ACTIVATION_SUPPORTED_COUNT_V1,
    );
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.rows)).toBe(true);
    expect(
      statSync(
        join(
          process.cwd(),
          "resources/formula-library/v1/julia-runtime-activation.v1.json",
        ),
      ).size,
    ).toBeLessThanOrEqual(JULIA_RUNTIME_ACTIVATION_MAX_BYTES_V1);

    const supported = new Set(parsed.value.rows.map((row) => row.formulaId));
    expect(supported.size).toBe(JULIA_RUNTIME_ACTIVATION_SUPPORTED_COUNT_V1);
    const denied = skeletonAsset.rows.filter((row) => !supported.has(row.formulaId));
    expect(denied).toHaveLength(JULIA_RUNTIME_ACTIVATION_DENIED_COUNT_V1);
    for (const row of parsed.value.rows) {
      expect(resolveJuliaRuntimeCapabilityV1(row.formulaId, row.sourceRevision)).toMatchObject({
        status: "supported",
        reason: "active",
        supportsEditing: true,
        supportsRuntime: true,
      });
    }
    for (const row of denied) {
      expect(resolveJuliaRuntimeCapabilityV1(row.formulaId, row.sourceRevision)).toMatchObject({
        status: "unsupported",
        supportsEditing: false,
        supportsRuntime: false,
      });
    }
  });

  it("fails closed on sparse, reordered, widened, stale, or coherently rehashed tampering", () => {
    const cases: unknown[] = [];

    const missing = structuredClone(activationAsset);
    missing.rows.pop();
    missing.supportedCount -= 1;
    cases.push(missing);

    const widened = structuredClone(activationAsset);
    widened.rows.push({
      formulaId: skeletonAsset.rows.find(
        (row) => !activationAsset.rows.some((entry) => entry.formulaId === row.formulaId),
      )!.formulaId,
      sourceRevision: skeletonAsset.rows.find(
        (row) => !activationAsset.rows.some((entry) => entry.formulaId === row.formulaId),
      )!.sourceRevision,
    });
    widened.supportedCount += 1;
    cases.push(widened);

    const reordered = structuredClone(activationAsset);
    [reordered.rows[0], reordered.rows[1]] = [reordered.rows[1]!, reordered.rows[0]!];
    cases.push(reordered);

    const stale = structuredClone(activationAsset);
    stale.rows[0]!.sourceRevision = "0".repeat(64);
    cases.push(stale);

    const coherentEdit = structuredClone(activationAsset);
    coherentEdit.rows[0]!.sourceRevision = "f".repeat(64);
    coherentEdit.contentHash = "a".repeat(64);
    cases.push(coherentEdit);

    const sparse = structuredClone(activationAsset) as typeof activationAsset & {
      rows: Array<(typeof activationAsset.rows)[number] | undefined>;
    };
    delete sparse.rows[0];
    cases.push(sparse);

    for (const value of cases) {
      expect(parseJuliaRuntimeActivationV1(value)).toEqual({
        ok: false,
        code: "julia-runtime-activation-invalid",
      });
    }

    const trap = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("proxy-trap");
        },
      },
    );
    expect(parseJuliaRuntimeActivationV1(trap)).toEqual({
      ok: false,
      code: "julia-runtime-activation-invalid",
    });
  });

  it("treats runtime-index drift as a global activation failure", () => {
    expect(verifyJuliaRuntimeActivationSetV1(runtimeIndexAsset)).toBe(true);
    const oneRowDrift = structuredClone(runtimeIndexAsset);
    oneRowDrift.rows[0]!.sourceRevision = "0".repeat(64);
    expect(verifyJuliaRuntimeActivationSetV1(oneRowDrift)).toBe(false);

    const missing = structuredClone(runtimeIndexAsset);
    missing.rows.pop();
    missing.rowCount -= 1;
    expect(verifyJuliaRuntimeActivationSetV1(missing)).toBe(false);

    const extra = structuredClone(runtimeIndexAsset);
    extra.rows.push(structuredClone(extra.rows[0]!));
    extra.rowCount += 1;
    expect(verifyJuliaRuntimeActivationSetV1(extra)).toBe(false);
  });

  it("separates persisted intent from effective renderer state without trusting broad plugin metadata", async () => {
    const { row, plugin } = await compileSupportedPlugin();
    expect(Object.isFrozen(plugin)).toBe(true);
    expect(plugin.supportsJulia).toBe(false);
    pluginRegistry.register(plugin);

    const supportedDocument = documentFor(row.formulaId);
    expect(projectDocumentToRuntimeParams(supportedDocument).isJulia).toBe(true);
    expect(resolveEffectiveJuliaStateV1(supportedDocument)).toEqual({
      persistedIntent: true,
      effective: true,
      reason: "active",
    });
    expect(documentToRuntimeParams(supportedDocument).isJulia).toBe(true);

    const stalePlugin: FormulaPlugin = Object.freeze({
      ...plugin,
      cacheFingerprint: "0".repeat(64),
      supportsJulia: true,
    });
    pluginRegistry.register(stalePlugin);
    expect(resolveEffectiveJuliaStateV1(supportedDocument)).toEqual({
      persistedIntent: true,
      effective: false,
      reason: "stale",
    });
    expect(documentToRuntimeParams(supportedDocument).isJulia).toBe(false);
    expect(supportedDocument.formula.isJulia).toBe(true);
    expect(supportedDocument.formula.juliaC).toEqual([-0.745, 0.113]);

    const unsupported = skeletonAsset.rows.find(
      (candidate) =>
        !activationAsset.rows.some((entry) => entry.formulaId === candidate.formulaId),
    )!;
    pluginRegistry.register(
      Object.freeze({
        ...plugin,
        id: unsupported.formulaId,
        cacheFingerprint: unsupported.sourceRevision,
        supportsJulia: true,
      }),
    );
    const unsupportedDocument = documentFor(unsupported.formulaId);
    expect(resolveEffectiveJuliaStateV1(unsupportedDocument)).toMatchObject({
      persistedIntent: true,
      effective: false,
      reason: "unsupported",
    });
    expect(documentToRuntimeParams(unsupportedDocument).isJulia).toBe(false);
    expect(projectDocumentToRuntimeParams(unsupportedDocument).isJulia).toBe(true);

    pluginRegistry.unregister("formula", row.formulaId);
    pluginRegistry.unregister("formula", unsupported.formulaId);
  });

  it("keeps every legacy built-in and alias fail closed", () => {
    const builtins = pluginRegistry.listFormulas().filter((plugin) => plugin.source === "builtin");
    expect(builtins).toHaveLength(94);
    expect(builtins.every((plugin) => plugin.supportsJulia === false)).toBe(true);
    for (const plugin of builtins) {
      const document = documentFor(plugin.id);
      expect(documentToRuntimeParams(document).isJulia).toBe(false);
      expect(document.formula.isJulia).toBe(true);
    }
  });
});
