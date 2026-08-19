import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { compilePublishedFormulaPluginV1 } from "../src/engine/formulas/v1/published-adapter";
import type { PublishedFormulaRuntimeIndexV1 } from "../src/engine/formulas/v1/published-runtime";
import type { FrmLikeV1Backend } from "../src/engine/frm/v1-backend";
import { registerBuiltins } from "../src/engine/plugins/builtins";
import type { PluginUniformDescriptor } from "../src/engine/plugins/types";
import { assembleShader } from "../src/engine/shaders/assembler";

interface WorkerPayload {
  readonly ids: readonly string[];
}

interface ProbeExpectation {
  readonly point: readonly [number, number];
  readonly c: readonly [number, number];
  readonly parameterPlane: boolean;
  readonly steps: number;
  readonly z: readonly [number, number];
  readonly event: boolean;
  readonly shouldContinue: boolean;
}

interface BrowserCase {
  readonly formulaId: string;
  readonly fullShader: string;
  readonly parityShader: string;
  readonly uniforms: readonly PluginUniformDescriptor[];
  readonly probes: readonly ProbeExpectation[];
}

const ROOT = process.cwd();
const INDEX_ROOT = join(
  ROOT,
  "public/formula-library/v1/runtime/published",
);
const payloadPath = process.argv[2];
if (!payloadPath) throw new Error("published-webgl-worker-payload-missing");

function expectation(
  backend: FrmLikeV1Backend,
  point: readonly [number, number],
  c: readonly [number, number],
  parameterPlane: boolean,
  steps: number,
): ProbeExpectation {
  const state = backend.cpu.createState({
    pixel: { re: point[0], im: point[1] },
    c: { re: c[0], im: c[1] },
    ismand: parameterPlane,
    maxit: steps,
  });
  const initialized = backend.cpu.init(state);
  let shouldContinue = initialized.event === undefined;
  if (shouldContinue) {
    for (let index = 0; index < steps; index += 1) {
      const stepped = backend.cpu.step(state);
      const continuation = backend.cpu.shouldContinue(state);
      shouldContinue =
        stepped.event === undefined &&
        continuation.event === undefined &&
        continuation.continue !== false;
      if (!shouldContinue) break;
    }
  }
  const bounded = (value: number): number =>
    value / (1 + Math.abs(value));
  return {
    point,
    c,
    parameterPlane,
    steps,
    z: [
      bounded(state.values.z?.re ?? 0),
      bounded(state.values.z?.im ?? 0),
    ],
    event: state.terminated === "nonFinite",
    shouldContinue,
  };
}

function parityShader(
  formulaGlsl: string,
  uniforms: readonly PluginUniformDescriptor[],
): string {
  const declarations = uniforms
    .map((uniform) => `uniform ${uniform.type} ${uniform.name};`)
    .join("\n");
  return `precision highp float;
${declarations}
uniform vec2 u_probePoint;
uniform vec2 u_probeC;
uniform int u_probeParameterPlane;
uniform int u_probeSteps;
${formulaGlsl}
void main() {
  frmV1ResetState(u_probePoint, u_probeC, u_probeSteps, u_probeParameterPlane == 1);
  vec2 orbitZ = initFormula(vec2(0.0), u_probeC, u_probePoint);
  bool keepGoing = !frmV1NonFiniteEvent;
  for (int i = 0; i < 16; i++) {
    if (i >= u_probeSteps || !keepGoing) break;
    orbitZ = iterateStep(orbitZ, u_probeC, vec2(0.0), u_probePoint);
    keepGoing = frmV1ShouldContinue();
  }
  vec2 boundedOrbitZ = orbitZ / (vec2(1.0) + abs(orbitZ));
  gl_FragColor = vec4(boundedOrbitZ, frmV1NonFiniteEvent ? 1.0 : 0.0, keepGoing ? 1.0 : 0.0);
}`;
}

async function buildCases(ids: readonly string[]): Promise<BrowserCase[]> {
  registerBuiltins({ quiet: true });
  const index = JSON.parse(
    readFileSync(join(INDEX_ROOT, "index.json"), "utf8"),
  ) as PublishedFormulaRuntimeIndexV1;
  const byId = new Map(index.rows.map((row) => [row.formulaId, row]));
  const cases: BrowserCase[] = [];
  for (const formulaId of ids) {
    const row = byId.get(formulaId);
    if (!row) throw new Error(`published-webgl-row-missing:${formulaId}`);
    const source = readFileSync(join(INDEX_ROOT, row.definitionPath), "utf8");
    const compiled = await compilePublishedFormulaPluginV1({
      formulaId: row.formulaId,
      displayName: row.displayName,
      family: row.family,
      sourceRevision: row.sourceRevision,
      semanticHash: row.semanticHash,
      source,
    });
    if (!compiled.ok)
      throw new Error(`published-webgl-compile-failed:${formulaId}`);
    const plugin = compiled.value.plugin;
    cases.push({
      formulaId,
      fullShader: assembleShader(
        {
          formulaId,
          outsideColoringId: "smooth",
          insideColoringId: "black",
          transformId: "none",
          pipelineVersion: 2,
        },
        plugin,
      ),
      parityShader: parityShader(plugin.glsl, plugin.uniforms),
      uniforms: plugin.uniforms,
      probes: [
        expectation(
          compiled.value.backend,
          [0.01, 0.02],
          [0.01, 0.02],
          true,
          1,
        ),
        expectation(
          compiled.value.backend,
          [0.02, -0.01],
          [-0.1, 0.05],
          false,
          1,
        ),
      ],
    });
  }
  return cases;
}

async function main(): Promise<void> {
  const payload = JSON.parse(readFileSync(payloadPath, "utf8")) as WorkerPayload;
  if (!Array.isArray(payload.ids) || payload.ids.length === 0)
    throw new Error("published-webgl-worker-payload-invalid");
  const cases = await buildCases(payload.ids);
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--disable-gpu-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  try {
    const page = await browser.newPage();
    const results = await page.evaluate((browserCases) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const gl = canvas.getContext("webgl", {
        antialias: false,
        preserveDrawingBuffer: true,
      });
      if (!gl) throw new Error("webgl-unavailable");
      if (!gl.getExtension("OES_texture_float"))
        throw new Error("oes-texture-float-unavailable");
      if (!gl.getExtension("WEBGL_color_buffer_float"))
        throw new Error("webgl-color-buffer-float-unavailable");
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = String(
        debug
          ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
      );
      if (!renderer.includes("SwiftShader"))
        throw new Error(`swiftshader-renderer-required:${renderer}`);

      const vertexSource =
        "attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }";
      const compile = (type: number, source: string): WebGLShader => {
        const shader = gl.createShader(type);
        if (!shader) throw new Error("shader-allocation-failed");
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          const message = String(gl.getShaderInfoLog(shader) ?? "shader-compile-failed");
          gl.deleteShader(shader);
          throw new Error(message.slice(0, 800));
        }
        return shader;
      };
      const link = (fragmentSource: string): WebGLProgram => {
        const vertex = compile(gl.VERTEX_SHADER, vertexSource);
        const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
        const program = gl.createProgram();
        if (!program) throw new Error("program-allocation-failed");
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          const message = String(gl.getProgramInfoLog(program) ?? "program-link-failed");
          gl.deleteProgram(program);
          throw new Error(message.slice(0, 800));
        }
        return program;
      };
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error("buffer-allocation-failed");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
      );
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();
      if (!texture || !framebuffer) throw new Error("framebuffer-allocation-failed");
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.FLOAT,
        null,
      );
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

      const close = (actual: number, expected: number): boolean => {
        if (!Number.isFinite(actual) || !Number.isFinite(expected))
          return Object.is(actual, expected);
        return (
          Math.abs(actual - expected) <=
          0.005 * Math.max(1, Math.abs(actual), Math.abs(expected))
        );
      };
      const output: Array<{
        formulaId: string;
        ok: boolean;
        code?: string;
        renderer: string;
      }> = [];
      for (const testCase of browserCases) {
        let fullProgram: WebGLProgram | undefined;
        let parityProgram: WebGLProgram | undefined;
        try {
          fullProgram = link(testCase.fullShader);
          parityProgram = link(testCase.parityShader);
          gl.useProgram(parityProgram);
          const position = gl.getAttribLocation(parityProgram, "a");
          gl.enableVertexAttribArray(position);
          gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
          for (const uniform of testCase.uniforms) {
            const location = gl.getUniformLocation(parityProgram, uniform.name);
            if (!location) continue;
            if (uniform.type === "int" || uniform.type === "bool")
              gl.uniform1i(location, Number(uniform.default));
            else if (uniform.type === "float")
              gl.uniform1f(location, Number(uniform.default));
            else if (uniform.type === "vec2") {
              const value = Array.isArray(uniform.default)
                ? uniform.default
                : [uniform.default, uniform.default];
              gl.uniform2f(location, Number(value[0] ?? 0), Number(value[1] ?? 0));
            }
          }
          for (const probe of testCase.probes) {
            const point = gl.getUniformLocation(parityProgram, "u_probePoint");
            const c = gl.getUniformLocation(parityProgram, "u_probeC");
            const parameterPlane = gl.getUniformLocation(
              parityProgram,
              "u_probeParameterPlane",
            );
            const steps = gl.getUniformLocation(parityProgram, "u_probeSteps");
            if (!point || !c || !parameterPlane || !steps)
              throw new Error("probe-uniform-missing");
            gl.uniform2f(point, probe.point[0], probe.point[1]);
            gl.uniform2f(c, probe.c[0], probe.c[1]);
            gl.uniform1i(parameterPlane, probe.parameterPlane ? 1 : 0);
            gl.uniform1i(steps, probe.steps);
            gl.viewport(0, 0, 1, 1);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.finish();
            const pixel = new Float32Array(4);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, pixel);
            if (gl.getError() !== gl.NO_ERROR) throw new Error("draw-failed");
            if (
              !close(pixel[0] ?? Number.NaN, probe.z[0]) ||
              !close(pixel[1] ?? Number.NaN, probe.z[1]) ||
              (pixel[2] ?? 0) >= 0.5 !== probe.event ||
              (pixel[3] ?? 0) >= 0.5 !== probe.shouldContinue
            )
              throw new Error(
                `cpu-gpu-mismatch:${Array.from(pixel).join(",")}:${probe.z.join(",")}:${probe.event}:${probe.shouldContinue}`,
              );
          }
          output.push({ formulaId: testCase.formulaId, ok: true, renderer });
        } catch (error) {
          output.push({
            formulaId: testCase.formulaId,
            ok: false,
            code: error instanceof Error ? error.message : "webgl-worker-failed",
            renderer,
          });
        } finally {
          if (fullProgram) gl.deleteProgram(fullProgram);
          if (parityProgram) gl.deleteProgram(parityProgram);
        }
      }
      return output;
    }, cases);
    process.stdout.write(`${JSON.stringify({ ok: true, results })}\n`);
  } finally {
    await browser.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      code: error instanceof Error ? error.message : "published-webgl-worker-failed",
    })}\n`,
  );
  process.exitCode = 1;
});
