import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

interface CompileProbeCase {
  readonly formulaId: string;
  readonly fullShaderSha256: string;
  readonly fullShader: string;
}

interface CompileProbePayload {
  readonly cases: readonly CompileProbeCase[];
}

const payloadPath = process.argv[2];
if (!payloadPath) throw new Error("julia-compile-probe-payload-missing");
const SHA256 = /^[a-f0-9]{64}$/;
const UUID_V5 = /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function main(): Promise<void> {
  const payload = JSON.parse(
    readFileSync(payloadPath, "utf8"),
  ) as CompileProbePayload;
  if (
    !Array.isArray(payload.cases) ||
    payload.cases.length !== 8 ||
    new Set(payload.cases.map((row) => row.formulaId)).size !== 8 ||
    payload.cases.some(
      (row) =>
        !UUID_V5.test(row.formulaId) ||
        !SHA256.test(row.fullShaderSha256) ||
        typeof row.fullShader !== "string" ||
        sha256(row.fullShader) !== row.fullShaderSha256,
    )
  )
    throw new Error("julia-compile-probe-payload-invalid");

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
    await page.evaluate(
      "globalThis.__name = globalThis.__name || ((value) => value);",
    );
    const results = await page.evaluate((cases) => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl", {
        antialias: false,
        preserveDrawingBuffer: true,
      });
      if (!gl) throw new Error("webgl-unavailable");
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = String(
        debug
          ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
      );
      if (!renderer.includes("SwiftShader"))
        throw new Error("swiftshader-renderer-required");
      const vertexSource =
        "attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }";
      const compile = (type: number, source: string): WebGLShader | null => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };
      return cases.map((testCase) => {
        const vertex = compile(gl.VERTEX_SHADER, vertexSource);
        const fragment = compile(gl.FRAGMENT_SHADER, testCase.fullShader);
        if (!vertex || !fragment) {
          if (vertex) gl.deleteShader(vertex);
          if (fragment) gl.deleteShader(fragment);
          return {
            formulaId: testCase.formulaId,
            fullShaderSha256: testCase.fullShaderSha256,
            compileLink: false,
            failureCode: "shader-compile-or-link-failed",
          };
        }
        const program = gl.createProgram();
        if (!program) {
          gl.deleteShader(vertex);
          gl.deleteShader(fragment);
          return {
            formulaId: testCase.formulaId,
            fullShaderSha256: testCase.fullShaderSha256,
            compileLink: false,
            failureCode: "shader-compile-or-link-failed",
          };
        }
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        const linked = Boolean(gl.getProgramParameter(program, gl.LINK_STATUS));
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        gl.deleteProgram(program);
        return {
          formulaId: testCase.formulaId,
          fullShaderSha256: testCase.fullShaderSha256,
          compileLink: linked,
          failureCode: linked ? null : "shader-compile-or-link-failed",
        };
      });
    }, payload.cases);
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        rendererClass: "SwiftShader-software",
        rowCount: results.length,
        rows: results,
      })}\n`,
    );
  } finally {
    await browser.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      code:
        error instanceof Error
          ? error.message.split(":", 1)[0]
          : "julia-compile-probe-failed",
    })}\n`,
  );
  process.exitCode = 1;
});
