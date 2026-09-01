import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { compileClassicFrmEntry } from "@/engine/frm/compile";
import { RECOVERED_AMPLIFIED_RECIPES_V1 } from "@/engine/formulas/v1/native-recipes-b94-held";
import { compilePublishedFormulaPluginV1 } from "@/engine/formulas/v1/published-adapter";
import { RECIPES as RECOVERED_TRANSCENDENTAL_RECIPES } from "@/engine/formulas/v1/native-recipes-b94-recovered-transcendental";
import { registerBuiltins } from "@/engine/plugins/builtins";
import { RECOVERED_AMPLIFIED_MATH_GLSL_V1 } from "@/engine/plugins/builtins/formulas/recoveredAmplifiedMath";
import { RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1 } from "@/engine/plugins/builtins/formulas/recoveredTranscendentalMath";
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
    expect(plugin.supportsJulia).toBe(false);
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

  it("keeps 73 untouched builtins byte-identical and scopes recovery bytes to exact 21", () => {
    const formulas = pluginRegistry
      .listFormulas()
      .sort((left, right) => left.id.localeCompare(right.id));
    const transcendentalIds = new Set(
      RECOVERED_TRANSCENDENTAL_RECIPES.map((recipe) => recipe.runtimeId),
    );
    const amplifiedIds = new Set(
      RECOVERED_AMPLIFIED_RECIPES_V1.map((recipe) => recipe.runtimeId),
    );
    const summaries = formulas.map((formula) => {
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
    const untouched = summaries.filter(
      (summary) => {
        const id = summary.slice(0, summary.indexOf(":"));
        return !transcendentalIds.has(id) && !amplifiedIds.has(id);
      },
    );
    const transcendental = summaries.filter((summary) =>
      transcendentalIds.has(summary.slice(0, summary.indexOf(":"))),
    );
    const amplified = summaries.filter((summary) =>
      amplifiedIds.has(summary.slice(0, summary.indexOf(":"))),
    );
    expect(untouched).toHaveLength(73);
    expect(transcendental).toHaveLength(12);
    expect(amplified).toHaveLength(9);
    expect(sha256(untouched.join("\n"))).toBe(
      "17697b5caeb6ba9860dca3fc05b0b98f287f245722b4bba46bdcda17b76f53b0",
    );
    expect(sha256(transcendental.join("\n"))).toBe(
      "81f9175c0e23d5a67ca181b39a526d78fd9478797d2ccdcbe62bedb45792cb6a",
    );
    expect(sha256(amplified.join("\n"))).toBe(
      "17f7029cb911a219712477ac79276a743465fa48ce664348983dcbd48bb25e1a",
    );
    for (const formula of formulas) {
      expect(formula.glsl.includes(RECOVERED_TRANSCENDENTAL_MATH_GLSL_V1)).toBe(
        transcendentalIds.has(formula.id),
      );
      expect(formula.glsl.includes(RECOVERED_AMPLIFIED_MATH_GLSL_V1)).toBe(
        amplifiedIds.has(formula.id),
      );
    }

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
