#!/usr/bin/env tsx
/**
 * Planned commit 12d: per-row conformance diagnosis for the two failing
 * census stages (release-oracle and webgl-cpu) under the current engine.
 *
 * For every failing row this records aggregate-only evidence: the first
 * divergence step, the delta at that step, the bit-exact prefix length, the
 * growth pattern, and escape-index/event differences. No corpus content, no
 * orbit values — indices and magnitudes only. The classification is a
 * hypothesis for 12d review, never a silent verdict.
 *
 * Usage:
 *   FRACTALPARK_FORMULA_HANDOFF=… FRACTALPARK_FRM_CORPUS_DIR=… \
 *   FRACTALPARK_FORMULA_ORACLE_DIR=… npx tsx scripts/diagnose-conformance.ts
 *
 * Writes .formula-library-private/formula-library-v1/conformance-diagnosis-v1.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { runFormulaLibraryOracle } from "../src/engine/formulas/v1/bulk-migration";
import {
  assertPrivateMode,
  preflight,
  prepareDefinitionRow,
  type GpuCase,
} from "./formula-library-bulk-migration";

type DeltaCurve = {
  readonly firstDivergenceStep: number | null;
  readonly firstDivergenceDelta: number | null;
  readonly bitExactPrefixSteps: number;
  readonly maxDelta: number;
  readonly growthRatios: readonly number[];
};

function relDelta(
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const scale = Math.max(1, Math.abs(a[0]), Math.abs(a[1]), Math.abs(b[0]), Math.abs(b[1]));
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) / scale;
}

function deltaCurve(
  actual: readonly (readonly [number | "non-finite", number | "non-finite"])[],
  expected: readonly (readonly [number, number])[],
): DeltaCurve {
  let firstStep: number | null = null;
  let firstDelta: number | null = null;
  let bitExact = 0;
  let maxDelta = 0;
  const deltas: number[] = [];
  const n = Math.min(actual.length, expected.length);
  for (let i = 0; i < n; i++) {
    const a = actual[i]!;
    if (a[0] === "non-finite" || a[1] === "non-finite") {
      if (firstStep === null) {
        firstStep = i;
        firstDelta = Number.POSITIVE_INFINITY;
      }
      deltas.push(Number.POSITIVE_INFINITY);
      continue;
    }
    const d = relDelta(a as readonly [number, number], expected[i]!);
    deltas.push(d);
    if (d > maxDelta) maxDelta = d;
    if (d === 0 && firstStep === null) bitExact = i + 1;
    if (d > 3e-4 && firstStep === null) {
      firstStep = i;
      firstDelta = d;
    }
  }
  const growthRatios: number[] = [];
  for (let i = Math.max(1, firstStep ?? 1); i < deltas.length && growthRatios.length < 6; i++) {
    const prev = deltas[i - 1]!;
    const cur = deltas[i]!;
    if (Number.isFinite(prev) && Number.isFinite(cur) && prev > 0) growthRatios.push(cur / prev);
  }
  return {
    firstDivergenceStep: firstStep,
    firstDivergenceDelta: firstDelta,
    bitExactPrefixSteps: bitExact,
    maxDelta,
    growthRatios,
  };
}

type Classification =
  | "chaotic-amplification"
  | "transcendental-primitive-precision"
  | "threshold-crossing"
  | "immediate-semantic-divergence"
  | "orbit-length-or-event-mismatch"
  | "unclassified";

function classify(
  curve: DeltaCurve,
  escapedAtDiff: boolean,
  eventDiff: boolean,
  lengthDiff: boolean,
): Classification {
  if (eventDiff || lengthDiff) return "orbit-length-or-event-mismatch";
  if (curve.firstDivergenceStep === null) {
    return escapedAtDiff ? "threshold-crossing" : "unclassified";
  }
  if (curve.firstDivergenceDelta !== null && curve.firstDivergenceDelta >= 0.05)
    return "immediate-semantic-divergence";
  if (curve.bitExactPrefixSteps >= 3 && curve.growthRatios.length >= 2) {
    const ratios = curve.growthRatios;
    const geometric = ratios.every((r) => r >= 1.2 && r <= 30);
    if (geometric) return "chaotic-amplification";
  }
  if (
    curve.firstDivergenceStep !== null &&
    curve.firstDivergenceStep <= 6 &&
    curve.firstDivergenceDelta !== null &&
    curve.firstDivergenceDelta < 0.01
  )
    return "transcendental-primitive-precision";
  return escapedAtDiff ? "threshold-crossing" : "unclassified";
}

/** v1 GLSL orbit for one case (census fragment template, chunked-safe). */
async function glslOrbits(
  gpuCase: GpuCase,
): Promise<readonly (readonly [number, number])[][]> {
  const fragmentSource = `precision highp float;
${gpuCase.declarations}
uniform float u_bulk_steps;
void main(){
  frmV1NonFiniteEvent=false;
  ${gpuCase.init}
  bool active=true;
  float iterations=0.0;
  for(int i=0;i<${gpuCase.maxIterations};i++){
    if(active&&float(i)<u_bulk_steps){
      ${gpuCase.loop}
      iterations+=1.0;
      if(${gpuCase.eventFlag}) active=false;
      else active=${gpuCase.continuePredicate};
    }
  }
  gl_FragColor=vec4(z,iterations,${gpuCase.eventFlag}?1.0:0.0);
}`;
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
    const runs = await page.evaluate(
      (payload) => {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const gl = canvas.getContext("webgl", {
          antialias: false,
          preserveDrawingBuffer: true,
        });
        if (!gl) throw new Error("webgl-unavailable");
        gl.getExtension("OES_texture_float");
        if (!gl.getExtension("WEBGL_color_buffer_float"))
          throw new Error("webgl-color-buffer-float-unavailable");
        const compile = (type: number, source: string): WebGLShader => {
          const shader = gl.createShader(type);
          if (!shader) throw new Error("shader-allocation-failed");
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw new Error(`shader-compile-failed:${gl.getShaderInfoLog(shader)}`);
          return shader;
        };
        const vertex = compile(
          gl.VERTEX_SHADER,
          "attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}",
        );
        const fragment = compile(gl.FRAGMENT_SHADER, payload.fragmentSource);
        const program = gl.createProgram();
        if (!program) throw new Error("program-allocation-failed");
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw new Error(`program-link-failed:${gl.getProgramInfoLog(program)}`);
        gl.useProgram(program);
        const positionLocation = gl.getAttribLocation(program, "a");
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 3, -1, -1, 3]),
          gl.STATIC_DRAW,
        );
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
        const framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          texture,
          0,
        );
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
          throw new Error("framebuffer-incomplete");
        gl.viewport(0, 0, 1, 1);
        const setScalar = (name: string, value: number) => {
          const location = gl.getUniformLocation(program, name);
          if (location) gl.uniform1f(location, value);
        };
        const setVector = (name: string, value: readonly number[]) => {
          const location = gl.getUniformLocation(program, name);
          if (!location) return;
          if (value.length === 2) gl.uniform2f(location, value[0]!, value[1]!);
          else if (value.length === 3)
            gl.uniform3f(location, value[0]!, value[1]!, value[2]!);
          else if (value.length === 4)
            gl.uniform4f(location, value[0]!, value[1]!, value[2]!, value[3]!);
        };
        const ismand = gl.getUniformLocation(program, "ismand");
        if (ismand) gl.uniform1i(ismand, 1);
        for (const parameter of payload.parameters)
          if (parameter.type === "function") {
            const selected = payload.functionOptions.indexOf(String(parameter.value));
            const location = gl.getUniformLocation(program, `u_frm_${parameter.name}`);
            if (location && selected >= 0) gl.uniform1i(location, selected);
          } else if (parameter.type === "real")
            setScalar(parameter.name, parameter.value as number);
          else setVector(parameter.name, [...(parameter.value as readonly number[])]);
        const out: [number, number][][] = [];
        for (const run of payload.runs) {
          const orbit: [number, number][] = [];
          for (let steps = 1; steps <= run.expectedOrbit.length; steps++) {
            setVector("pixel", run.pixel);
            setVector("c", run.pixel);
            setScalar("u_bulk_steps", steps);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.finish();
            const raw = new Float32Array(4);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, raw);
            orbit.push([raw[0]!, raw[1]!]);
          }
          out.push(orbit);
        }
        return out;
      },
      {
        fragmentSource,
        parameters: gpuCase.parameters,
        functionOptions: gpuCase.functionOptions,
        runs: gpuCase.runs,
      },
    );
    return runs;
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const repositoryRoot = process.cwd();
  const ledger = JSON.parse(
    readFileSync(
      ".formula-library-private/formula-library-v1/bulk-migration-ledger.json",
      "utf8",
    ),
  ) as {
    rows: readonly { formulaId: string; reasonCode?: string }[];
    ledgerContentHash: string;
  };
  const oracleIds = new Set(
    ledger.rows
      .filter((row) => row.reasonCode === "release-oracle-mismatch")
      .map((row) => row.formulaId),
  );
  const webglIds = new Set(
    ledger.rows
      .filter((row) => row.reasonCode === "webgl-cpu-mismatch")
      .map((row) => row.formulaId),
  );

  const context = preflight(repositoryRoot);
  const rows: Record<string, unknown>[] = [];
  let gpuCursor = 0;
  for (const workRow of context.workPackage.rows) {
    const isOracle = oracleIds.has(workRow.formulaId);
    const isWebgl = webglIds.has(workRow.formulaId);
    if (!isOracle && !isWebgl) continue;
    const prepared = await prepareDefinitionRow(workRow, context);
    if (!("definition" in prepared)) {
      rows.push({
        formulaId: workRow.formulaId,
        stage: isOracle ? "release-oracle" : "webgl-cpu",
        error: "prepare-failed",
      });
      continue;
    }
    const expected = prepared.expectedOracle;
    if (!expected) {
      rows.push({
        formulaId: workRow.formulaId,
        stage: isOracle ? "release-oracle" : "webgl-cpu",
        error: "expected-oracle-missing",
      });
      continue;
    }
    const actual = runFormulaLibraryOracle(
      prepared.backend,
      expected.runs.map((run) => run.pixel),
      expected.maxIterations,
    );
    const perRun = expected.runs.map((expectedRun, runIndex) => {
      const actualRun = actual[runIndex]!;
      const expectedOrbit =
        expectedRun.orbit ??
        ([] as readonly (readonly [number, number])[]);
      const curve = deltaCurve(actualRun.orbit, expectedOrbit);
      const escapedAtDiff = actualRun.escapedAt !== expectedRun.escapedAt;
      const eventDiff = actualRun.event !== null;
      const lengthDiff =
        expectedRun.rounds !== undefined &&
        actualRun.orbit.length !== expectedRun.rounds;
      return {
        runIndex,
        curve,
        escapedAtDiff,
        eventDiff,
        lengthDiff,
        classification: classify(curve, escapedAtDiff, eventDiff, lengthDiff),
      };
    });
    const entry: Record<string, unknown> = {
      formulaId: workRow.formulaId,
      stage: isOracle ? "release-oracle" : "webgl-cpu",
      sourceRevision: prepared.sourceRevision,
      maxIterations: expected.maxIterations,
      runs: perRun,
    };
    if (isWebgl) {
      // The GPU leg: compare v1 GLSL orbits against the v1 CPU oracle.
      const gpuRuns = actual.map((run) => ({
        pixel: run.pixel,
        expectedOrbit: run.orbit.map((point) => {
          if (point[0] === "non-finite" || point[1] === "non-finite")
            throw new Error("gpu-orbit-non-finite");
          return [point[0], point[1]] as const;
        }),
      }));
      const gpuCase: GpuCase = {
        formulaId: workRow.formulaId,
        declarations: prepared.backend.glsl.declarations,
        init: prepared.backend.glsl.init,
        loop: prepared.backend.glsl.loop,
        continuePredicate: prepared.backend.glsl.continuePredicate,
        eventFlag: prepared.backend.glsl.eventFlag,
        maxIterations: expected.maxIterations,
        runs: gpuRuns,
        parameters: prepared.definition.parameters.map((parameter) => ({
          name: parameter.name,
          type: parameter.type,
          value: parameter.default,
        })),
        functionOptions: prepared.backend.glsl.functionOptions,
      };
      try {
        const glsl = await glslOrbits(gpuCase);
        entry.gpuRuns = glsl.map((orbit, runIndex) => {
          const cpuOrbit = actual[runIndex]!.orbit.filter(
            (point): point is readonly [number, number] =>
              point[0] !== "non-finite" && point[1] !== "non-finite",
          );
          const curve = deltaCurve(orbit, cpuOrbit);
          return { runIndex, curve, classification: classify(curve, false, false, false) };
        });
      } catch (error) {
        entry.gpuError = error instanceof Error ? error.message.slice(0, 120) : "unknown";
      }
      gpuCursor += 1;
      if (gpuCursor % 6 === 0)
        console.error(`progress: ${gpuCursor}/${webglIds.size} gpu legs`);
    }
    rows.push(entry);
  }

  const report = {
    schema: "fractalpark-conformance-diagnosis/v1",
    ledgerContentHash: ledger.ledgerContentHash,
    oracleRows: oracleIds.size,
    webglRows: webglIds.size,
    rows,
  };
  const directory = join(
    repositoryRoot,
    ".formula-library-private",
    "formula-library-v1",
  );
  assertPrivateMode(directory, "directory");
  const path = join(directory, "conformance-diagnosis-v1.json");
  writeFileSync(path, `${JSON.stringify(report, null, 1)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.log(JSON.stringify({ ok: true, rows: rows.length, path }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
