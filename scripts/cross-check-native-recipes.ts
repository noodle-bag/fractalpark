#!/usr/bin/env tsx
/**
 * Native recipe cross-check (planned commit 12b).
 *
 * For every registered native recipe, drives three legs over the shared
 * probe contract:
 *   1. v1 CPU standard32 oracle (production backend);
 *   2. v1 WebGL parity (production census harness, SwiftShader);
 *   3. native plugin WebGL orbit probe (production assembler semantics:
 *      complex-math library + plugin uniforms at their declared defaults +
 *      initFormula wrapper + diverge escape check before each step).
 * Legs 1 and 3 are compared with compareNativeRecipeOrbitsV1; leg 2 must
 * report the census "passed" status. Any mismatch fails the script.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";

import { pluginRegistry } from "../src/engine/plugins/registry";
import { registerBuiltins } from "../src/engine/plugins/builtins";
import type { FormulaPlugin, PluginUniformDescriptor } from "../src/engine/plugins/types";
import { parseFrmLikeV1 } from "../src/engine/frm/v1";
import { compileFrmLikeV1Backend } from "../src/engine/frm/v1-backend";
import {
  NATIVE_FORMULA_RECIPES_V1,
  NATIVE_RECIPE_CROSS_CHECK_CONTRACT_V1,
  auditNativeRecipeFidelityV1,
  compareNativeRecipeOrbitsV1,
  nativeRecipeProbesToOrbitRunV1,
  validateNativeRecipeV1,
  type NativeRecipeOrbitRunV1,
  type NativeRecipeProbeV1,
} from "../src/engine/formulas/v1/native-recipes";
import {
  runFormulaLibraryOracle,
} from "../src/engine/formulas/v1/bulk-migration";
import {
  runWebgl,
  type GpuCase,
} from "./formula-library-bulk-migration";

type NativeProbeResult = NativeRecipeProbeV1;

const complexMathLib = readFileSync(
  join(__dirname, "../src/engine/shaders/complex-math.glsl"),
  "utf8",
);

function nativeFragmentSource(plugin: FormulaPlugin): string {
  const converge = plugin.escapeType === "converge";
  const uniformDeclaration = (uniform: PluginUniformDescriptor): string => {
    const glslType =
      uniform.type === "float"
        ? "float"
        : uniform.type === "int"
          ? "int"
          : uniform.type === "bool"
            ? "bool"
            : uniform.type === "vec2"
              ? "vec2"
              : "vec3";
    return `uniform ${glslType} ${uniform.name};`;
  };
  const init = plugin.initGlsl
    ? plugin.initGlsl.includes("vec2 initFormula(")
      ? plugin.initGlsl
      : `vec2 initFormula(vec2 z, vec2 c, vec2 point) {\n  vec2 pixel = u_isJulia ? point : c;\n${plugin.initGlsl}\n  return z;\n}`
    : "";
  return `precision highp float;
${complexMathLib}
uniform float u_power;
uniform bool u_isJulia;
uniform vec2 u_juliaC;
${plugin.uniforms.map(uniformDeclaration).join("\n")}
${init}
${plugin.glsl}
uniform vec2 u_pixel;
uniform float u_steps;
uniform float u_bailout2;
void main() {
  vec2 point = u_pixel;
  ${converge ? "// Newton-type: start from point to avoid div-by-zero.\n  vec2 z = point;" : "vec2 z = u_isJulia ? point : vec2(0.0);"}
  vec2 c = u_isJulia ? u_juliaC : point;
  ${plugin.initGlsl ? "z = initFormula(z, c, point);" : ""}
  vec2 zPrev = vec2(0.0);
  float iterations = 0.0;
  float escaped = 0.0;
  for (int i = 0; i < 64; i++) {
    if (float(i) >= u_steps) break;
    ${converge ? "if (i > 0 && length(z - zPrev) < 0.000001) { escaped = 1.0; break; }" : "if (dot(z, z) > u_bailout2) { escaped = 1.0; break; }"}
    vec2 nextZ = iterateStep(z, c, zPrev, point);
    zPrev = z;
    z = nextZ;
    iterations += 1.0;
  }
  gl_FragColor = vec4(z, iterations, escaped);
}`;
}

async function runNativeProbes(
  cases: readonly { formulaId: string; source: string; plugin: FormulaPlugin }[],
  pixels: readonly (readonly [number, number])[],
  maxIterations: number,
): Promise<ReadonlyMap<string, readonly NativeProbeResult[][]>> {
  const output = new Map<string, readonly NativeProbeResult[][]>();
  if (cases.length === 0) return output;
  // SwiftShader accumulates state across many heavy shader compilations in
  // one browser session and eventually wedges the GPU channel at 0% CPU.
  // Chunk the cases and give each chunk a fresh browser.
  const CHUNK = 4;
  for (let offset = 0; offset < cases.length; offset += CHUNK) {
    const chunk = cases.slice(offset, offset + CHUNK);
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--disable-gpu-sandbox",
      ],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 8, height: 8 } });
      await page.evaluate(
        "globalThis.__name = globalThis.__name || function(target){ return target; };",
      );
      const evaluated = await page.evaluate(
        ({ cases: payloadCases, pixels: payloadPixels, maxIterations: budget }) => {
        const results: Record<string, { z: [number, number]; iterations: number; escaped: boolean }[][]> = {};
        for (const payload of payloadCases) {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = 1;
            canvas.height = 1;
            const gl = canvas.getContext("webgl", {
              antialias: false,
              preserveDrawingBuffer: true,
            });
            if (!gl) throw new Error("webgl-unavailable");
            if (!gl.getExtension("OES_texture_float")) throw new Error("oes-texture-float-unavailable");
            if (!gl.getExtension("WEBGL_color_buffer_float")) throw new Error("webgl-color-buffer-float-unavailable");
            const debug = gl.getExtension("WEBGL_debug_renderer_info");
            const renderer = String(
              debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            );
            if (!renderer.includes("SwiftShader")) throw new Error("swiftshader-renderer-required");
            const compile = (type: number, source: string): WebGLShader => {
              const shader = gl.createShader(type);
              if (!shader) throw new Error("shader-allocation-failed");
              gl.shaderSource(shader, source);
              gl.compileShader(shader);
              if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
                throw new Error(`shader-compile-failed:${gl.getShaderInfoLog(shader)}`);
              return shader;
            };
            const vertex = compile(gl.VERTEX_SHADER, "attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}");
            const fragment = compile(gl.FRAGMENT_SHADER, payload.source);
            const program = gl.createProgram();
            if (!program) throw new Error("program-allocation-failed");
            gl.attachShader(program, vertex);
            gl.attachShader(program, fragment);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("program-link-failed");
            gl.useProgram(program);
            const position = gl.getAttribLocation(program, "a");
            const buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(position);
            gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
            const framebuffer = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
              throw new Error("float-framebuffer-incomplete");

            const setFloat = (name: string, value: number) => {
              const location = gl.getUniformLocation(program, name);
              if (location !== null) gl.uniform1f(location, value);
            };
            const setInt = (name: string, value: number) => {
              const location = gl.getUniformLocation(program, name);
              if (location !== null) gl.uniform1i(location, value);
            };
            const setVec = (name: string, values: readonly number[]) => {
              const location = gl.getUniformLocation(program, name);
              if (location === null) return;
              if (values.length === 2) gl.uniform2f(location, values[0]!, values[1]!);
              else if (values.length === 3) gl.uniform3f(location, values[0]!, values[1]!, values[2]!);
            };
            setFloat("u_power", 2.0);
            setInt("u_isJulia", 0);
            for (const uniform of payload.uniforms) {
              if (uniform.type === "bool") setInt(uniform.name, uniform.value ? 1 : 0);
              else if (uniform.type === "int") setInt(uniform.name, Number(uniform.value));
              else if (uniform.type === "float") setFloat(uniform.name, Number(uniform.value));
              else setVec(uniform.name, uniform.value as readonly number[]);
            }

            const draw = (pixel: readonly number[], steps: number): { z: [number, number]; iterations: number; escaped: boolean } => {
              setVec("u_pixel", pixel);
              setFloat("u_steps", steps);
              setFloat("u_bailout2", payload.bailout2);
              gl.viewport(0, 0, 1, 1);
              gl.drawArrays(gl.TRIANGLES, 0, 3);
              gl.finish();
              const raw = new Float32Array(4);
              gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, raw);
              if (gl.getError() !== gl.NO_ERROR) throw new Error("draw-failed");
              return { z: [raw[0]!, raw[1]!], iterations: raw[2]!, escaped: raw[3]! >= 0.5 };
            };

            const perPixel: { z: [number, number]; iterations: number; escaped: boolean }[][] = [];
            for (const pixel of payloadPixels) {
              const probes: { z: [number, number]; iterations: number; escaped: boolean }[] = [];
              // budget + 1: the escape check runs before each step, so an
              // escape at exactly the budgeted step is only observed by one
              // extra draw (which contributes no orbit point).
              for (let steps = 1; steps <= budget + 1; steps++) {
                const result = draw(pixel as readonly number[], steps);
                probes.push(result);
                if (result.escaped) break;
              }
              perPixel.push(probes);
            }
            results[payload.formulaId] = perPixel;
          } catch (error) {
            results[payload.formulaId] = [];
            (results as Record<string, unknown>)[`${payload.formulaId}__error`] =
              error instanceof Error ? error.message.slice(0, 160) : "unknown";
          }
        }
        return results;
      },
      {
        cases: chunk.map((item) => ({
          formulaId: item.formulaId,
          source: item.source,
          bailout2: item.plugin.bailout ?? 4.0,
          uniforms: item.plugin.uniforms.map((uniform) => ({
            name: uniform.name,
            type: uniform.type,
            value: uniform.default,
          })),
        })),
        pixels,
        maxIterations,
      },
      );
      for (const item of chunk) {
        const rows = evaluated[item.formulaId];
        const error = (evaluated as Record<string, unknown>)[`${item.formulaId}__error`];
        if (!rows || rows.length === 0)
          throw new Error(`native-probe-failed:${item.formulaId}:${String(error ?? "no-output")}`);
        output.set(item.formulaId, rows);
      }
    } finally {
      await browser.close();
    }
  }
  return output;
}

function nativeProbesToRuns(
  probes: readonly NativeProbeResult[][],
  pixels: readonly (readonly [number, number])[],
  maxIterations: number,
): NativeRecipeOrbitRunV1[] {
  return probes.map((perPixel, index) =>
    nativeRecipeProbesToOrbitRunV1(perPixel, pixels[index]!, maxIterations),
  );
}

async function main(): Promise<void> {
  registerBuiltins({ quiet: true });
  // Batch-migration support: when FRACTALPARK_RECIPE_BATCH_FILE points at a
  // module exporting `RECIPES`, cross-check that batch instead of the
  // built-in registry. Same harness, same contract, same verdict shape.
  const batchFile = process.env.FRACTALPARK_RECIPE_BATCH_FILE;
  const recipes: readonly import("../src/engine/formulas/v1/native-recipes").NativeFormulaRecipeV1[] =
    batchFile
      ? (await import(
          batchFile.startsWith("/") ? batchFile : join(process.cwd(), batchFile)
        )).RECIPES
      : NATIVE_FORMULA_RECIPES_V1;
  const contract = NATIVE_RECIPE_CROSS_CHECK_CONTRACT_V1;
  const extraProbeRaw = process.env.FRACTALPARK_RECIPE_EXTRA_PROBE;
  const extraProbe = extraProbeRaw
    ? extraProbeRaw.split(",").map(Number)
    : undefined;
  if (
    extraProbe !== undefined &&
    (extraProbe.length !== 2 || !extraProbe.every(Number.isFinite))
  )
    throw new Error("recipe-extra-probe-invalid");
  const pixels: Array<readonly [number, number]> = contract.probePixels.map(
    (pixel) => [pixel[0], pixel[1]] as const,
  );
  if (extraProbe) pixels.push([extraProbe[0]!, extraProbe[1]!]);
  const rows: unknown[] = [];
  let failed = 0;

  const nativeCases: { formulaId: string; source: string; plugin: FormulaPlugin }[] = [];
  const gpuCases: GpuCase[] = [];
  const prepared: {
    recipeId: string;
    cpuRuns: NativeRecipeOrbitRunV1[];
    sourceRevision: string;
  }[] = [];

  for (const recipe of recipes) {
    const validation = await validateNativeRecipeV1(recipe);
    if (!validation.ok) {
      failed += 1;
      rows.push({ formulaId: recipe.formulaId, runtimeId: recipe.runtimeId, ok: false, reasonCode: validation.reasonCode });
      continue;
    }
    const fidelity = auditNativeRecipeFidelityV1(recipe);
    if (!fidelity.ok) {
      failed += 1;
      rows.push({ formulaId: recipe.formulaId, runtimeId: recipe.runtimeId, ok: false, reasonCode: fidelity.reasonCode });
      continue;
    }
    const parsedSource = parseFrmLikeV1(recipe.source);
    if (!parsedSource.ok) throw new Error(`parse-unexpected:${recipe.runtimeId}`);
    const parsed = compileFrmLikeV1Backend(parsedSource.ir);
    if (!parsed.ok) throw new Error(`backend-unexpected:${recipe.runtimeId}`);
    const backend = parsed.backend;
    const cpuOracle = runFormulaLibraryOracle(backend, pixels, contract.maxIterations);
    const cpuRuns: NativeRecipeOrbitRunV1[] = cpuOracle.map((run) => ({
      pixel: run.pixel,
      escapedAt: run.escapedAt,
      event: run.event,
      orbit: run.orbit,
    }));
    prepared.push({ recipeId: recipe.formulaId, cpuRuns, sourceRevision: validation.sourceRevision });

    gpuCases.push({
      formulaId: recipe.formulaId,
      declarations: backend.glsl.declarations,
      init: backend.glsl.init,
      loop: backend.glsl.loop,
      continuePredicate: backend.glsl.continuePredicate,
      eventFlag: backend.glsl.eventFlag,
      maxIterations: contract.maxIterations,
      runs: cpuOracle.map((run) => ({
        pixel: run.pixel,
        expectedEvent: run.event !== null,
        expectedEscapedAt: run.escapedAt,
        expectedOrbit: run.orbit.map((point) => {
          if (point[0] === "non-finite" || point[1] === "non-finite")
            throw new Error("gpu-orbit-non-finite");
          return [point[0], point[1]] as const;
        }),
      })),
      parameters: parsedSource.ir.parameters.map((parameter) => ({
        name: parameter.name,
        type: parameter.type,
        value: parameter.default,
      })),
      functionOptions: backend.glsl.functionOptions,
    });

    const plugin = pluginRegistry.getFormula(recipe.runtimeId);
    if (!plugin) throw new Error(`plugin-missing:${recipe.runtimeId}`);
    nativeCases.push({
      formulaId: recipe.formulaId,
      source: nativeFragmentSource(plugin),
      plugin,
    });
  }

  // runWebgl keeps one browser for all cases; SwiftShader wedges after
  // several heavy shader compilations in a single session, so chunk the
  // v1 leg the same way as the native probe leg.
  const gpuResults = new Map<string, string>();
  for (let offset = 0; offset < gpuCases.length; offset += 3) {
    const chunk = gpuCases.slice(offset, offset + 3);
    const chunkResults = await runWebgl(chunk);
    for (const [key, value] of chunkResults) gpuResults.set(key, value);
  }
  const nativeResults = await runNativeProbes(nativeCases, pixels, contract.maxIterations);

  for (const item of prepared) {
    const recipe = recipes.find((entry) => entry.formulaId === item.recipeId)!;
    const gpuStatus = gpuResults.get(item.recipeId) ?? "failed";
    const nativeRuns = nativeProbesToRuns(nativeResults.get(item.recipeId)!, pixels, contract.maxIterations);
    const verdict = compareNativeRecipeOrbitsV1(item.cpuRuns, nativeRuns);
    const ok = gpuStatus === "passed" && verdict.ok;
    if (!ok) failed += 1;
    rows.push({
      formulaId: item.recipeId,
      runtimeId: recipe.runtimeId,
      family: recipe.family,
      ok,
      v1WebglParity: gpuStatus,
      nativeCrossCheck: verdict,
      orbitPoints: item.cpuRuns.reduce((total, run) => total + run.orbit.length, 0),
      sourceRevision: item.sourceRevision,
    });
  }

  const summary = {
    ok: failed === 0,
    contract: {
      probePixels: pixels.length,
      extraProbe: extraProbe ?? null,
      maxIterations: contract.maxIterations,
      relativeTolerance: contract.relativeTolerance,
    },
    recipes: recipes.length,
    passed: recipes.length - failed,
    failed,
    rows,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ ok: false, code: error instanceof Error ? error.message : "unknown" })}\n`,
  );
  process.exitCode = 1;
});
