import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { compileClassicFrmEntry } from "@/engine/frm/compile";
import { compilePublishedFormulaPluginV1 } from "@/engine/formulas/v1/published-adapter";
import { registerBuiltins } from "@/engine/plugins/builtins";
import { pluginRegistry } from "@/engine/plugins/registry";
import { assembleShader, makeCacheKey } from "@/engine/shaders/assembler";

interface RuntimeRow {
  formulaId: string;
  displayName: string;
  family: string;
  implementationBasis: string;
  sourceRevision?: string;
  semanticHash: string;
  definition: string;
}

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function rows(revision: "rev3" | "rev4"): RuntimeRow[] {
  const root = join(process.cwd(), "resources/formula-library/v1/runtime", revision);
  const manifest = JSON.parse(
    readFileSync(join(root, "manifest.json"), "utf8"),
  ) as { shards: readonly { file: string }[] };
  return manifest.shards.flatMap((entry) => {
    const shard = JSON.parse(
      readFileSync(join(root, entry.file), "utf8"),
    ) as { rows: RuntimeRow[] };
    return shard.rows;
  });
}

async function compileRow(row: RuntimeRow) {
  return compilePublishedFormulaPluginV1({
    formulaId: row.formulaId,
    displayName: row.displayName,
    family: row.family,
    sourceRevision: row.sourceRevision ?? sha256(row.definition),
    semanticHash: row.semanticHash,
    source: row.definition,
  });
}

describe("published formula candidate-C adapter", () => {
  beforeAll(() => registerBuiltins({ quiet: true }));

  it("globalizes and resets v1 orbit state without mutating the shared framework template", async () => {
    const row = rows("rev4").find((entry) => entry.displayName === "mandelbrot");
    if (!row) throw new Error("fixture-row-missing");
    const compiled = await compileRow(row);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const { plugin, descriptor } = compiled.value;
    expect(plugin.orbitLifecycle).toEqual({
      kind: "frm-like-v1",
      resetFunction: "frmV1ResetState",
      continueFunction: "frmV1ShouldContinue",
      eventFunction: "frmV1HasEvent",
    });
    expect(plugin.cacheFingerprint).toBe(row.sourceRevision);
    expect(plugin.glsl).toContain("vec2 frmV1_z = vec2(0.0);");
    expect(plugin.glsl).toContain("void frmV1ResetState(");
    expect(plugin.glsl).toContain("bool frmV1ShouldContinue()");
    expect(plugin.glsl).toContain("bool frmV1HasEvent()");
    expect(plugin.glsl).not.toContain("uniform vec2 frmV1_pixel;");
    expect(descriptor.parameters).toEqual([
      expect.objectContaining({
        slotName: "power",
        type: "real",
        default: 2,
        uniformName: "frmV1_power",
      }),
    ]);

    const shader = assembleShader(
      {
        formulaId: plugin.id,
        outsideColoringId: "smooth",
        insideColoringId: "black",
        transformId: "none",
        pipelineVersion: 2,
      },
      plugin,
    );
    expect(shader).toMatch(/^#define PLUGIN_HAS_STATE_RESET$/m);
    expect(shader).toMatch(/^#define PLUGIN_HAS_CONTINUE_PREDICATE$/m);
    expect(shader.match(/frmV1ResetState\(point, c, u_maxIterations, !u_isJulia\);/g)).toHaveLength(2);
    expect(shader).toContain("#define ESCAPE_CHECK(z, zz) (!frmV1ShouldContinue())");
    expect(shader).toContain("if (frmV1HasEvent()) return 0.0;");
    expect(shader).toContain("escaped = frmV1HasEvent();");
    expect(shader).toContain("if (escaped) break;");
  });

  it("freezes function-slot option/default/uniform bindings", async () => {
    const row = rows("rev4").find((entry) => entry.displayName === "jm_16");
    if (!row) throw new Error("function-slot-row-missing");
    const compiled = await compileRow(row);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const slots = compiled.value.descriptor.parameters.filter(
      (parameter) => parameter.type === "function",
    );
    expect(slots).toHaveLength(4);
    expect(slots[0]).toMatchObject({
      slotName: "function1",
      default: "identity",
      classicBinding: "fn1",
      uniformName: "u_frm_function1",
    });
    expect(slots[0]?.options).toContain("sqr");
    expect(compiled.value.plugin.uniforms).toContainEqual(
      expect.objectContaining({ name: "u_frm_function1", type: "int" }),
    );
  });

  it("keeps all 94 builtins and a strict classic shader byte-identical", () => {
    const summaries = pluginRegistry
      .listFormulas()
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((formula) => {
        const source = assembleShader({
          formulaId: formula.id,
          outsideColoringId: "smooth",
          insideColoringId: "black",
          transformId: "none",
          pipelineVersion: 1,
        });
        return `${formula.id}:${sha256(source)}`;
      });
    expect(summaries).toHaveLength(94);
    expect(sha256(summaries.join("\n"))).toBe(
      "7eb974f1cf386184ae5c3122f195de2e3a103fbafe5eed898981973c69889908",
    );

    const classic = compileClassicFrmEntry(
      "FrozenClassic {\n\tz=0:\n\tz=z^2+c\n\t|z|<4\n}",
      undefined,
      "frozen-classic",
      2,
    );
    expect(classic.success).toBe(true);
    if (!classic.success || !classic.plugin) return;
    expect(
      sha256(
        assembleShader(
          {
            formulaId: classic.plugin.id,
            outsideColoringId: "smooth",
            insideColoringId: "black",
            transformId: "none",
            pipelineVersion: 2,
          },
          classic.plugin,
        ),
      ),
    ).toBe("b70a4994e7810b1768bf93b208b88a47c0907ec8dd22e28c928333f220801c8c");
  });

  it("keys candidate-C programs by immutable source revision", async () => {
    const row = rows("rev3")[0];
    if (!row) throw new Error("runtime-row-missing");
    const compiled = await compileRow(row);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const combo = {
      formulaId: compiled.value.plugin.id,
      outsideColoringId: "smooth",
      insideColoringId: "black",
      transformId: "none",
      pipelineVersion: 2 as const,
    };
    expect(makeCacheKey(combo, compiled.value.plugin)).toContain(
      `|src:${compiled.value.plugin.cacheFingerprint}`,
    );
  });
});
