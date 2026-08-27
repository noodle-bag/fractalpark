import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import candidateAsset from "../resources/formula-library/v1/julia-pixel-recovery-candidates.v1.json";
import preGpuAsset from "../resources/formula-library/v1/julia-pre-gpu-recovery-census.v2.json";
import { canonicalizeFrmLikeV1, parseFrmLikeV1 } from "../src/engine/frm/v1";
import type {
  FrmLikeV1Backend,
  FrmLikeV1CpuState,
} from "../src/engine/frm/v1-backend";
import type { FrmV1UnaryFunctionName } from "../src/engine/frm/frm-v1-stdlib";
import type { OrbitConstantBindingV1 } from "../src/engine/formulas/v1/julia-binding";
import {
  parseJuliaPixelRecoveryCandidatesV1,
  type JuliaPixelRecoveryCandidatesRowV1,
} from "../src/engine/formulas/v1/julia-pixel-recovery-candidates";
import {
  parseJuliaPreGpuRecoveryCensusV2,
  type JuliaPreGpuRecoveryRowV2,
} from "../src/engine/formulas/v1/julia-pre-gpu-recovery-v2";
import {
  buildJuliaRendererProfileV2,
  JULIA_RENDERER_CONSTANTS_V2,
  JULIA_RENDERER_IMAGE_HEIGHT_V2,
  JULIA_RENDERER_IMAGE_ITERATIONS_V2,
  JULIA_RENDERER_IMAGE_WIDTH_V2,
  JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_ID_V2,
  JULIA_RENDERER_MAX_DEPTH_V2,
  JULIA_RENDERER_POINTS_V2,
  type JuliaRendererProfileV2,
  type JuliaRendererReportRowV2,
} from "../src/engine/formulas/v1/julia-renderer-evidence-v2";
import { compilePublishedFormulaPluginV1 } from "../src/engine/formulas/v1/published-adapter";
import {
  parsePublishedFormulaRuntimeIndexV1,
  type PublishedFormulaRuntimeIndexRowV1,
} from "../src/engine/formulas/v1/published-runtime";
import { blackInsideColoring } from "../src/engine/plugins/builtins/coloring/inside-black";
import { smoothColoring } from "../src/engine/plugins/builtins/coloring/smooth";
import { noneTransform } from "../src/engine/plugins/builtins/transforms/none";
import { pluginRegistry } from "../src/engine/plugins/registry";
import type { PluginUniformDescriptor } from "../src/engine/plugins/types";
import { assembleShader } from "../src/engine/shaders/assembler";

interface WorkerPayload {
  readonly ids: readonly string[];
}

interface BrowserCase {
  readonly formulaId: string;
  readonly candidateContentHash: string;
  readonly sourceRevision: string;
  readonly semanticHash: string;
  readonly binding: OrbitConstantBindingV1;
  readonly bindingRevision: string;
  readonly supportLane: JuliaRendererProfileV2["supportLane"];
  readonly profileDigest: string;
  readonly profile: JuliaRendererProfileV2;
  readonly bindingUniformName: string | null;
  readonly fullShader: string;
  readonly integrationShader: string | null;
  readonly parityShader: string;
  readonly uniforms: readonly PluginUniformDescriptor[];
  readonly traceExpected: readonly number[];
  readonly imageExpectedA: readonly number[];
  readonly imageExpectedB: readonly number[];
}

type RuntimeParameter =
  number | readonly [number, number] | FrmV1UnaryFunctionName;

const ROOT = process.cwd();
const RUNTIME_ROOT = join(ROOT, "public/formula-library/v1/runtime/published");
const RUNTIME_INDEX_PATH = join(RUNTIME_ROOT, "index.json");
const payloadPath = process.argv[2];
if (!payloadPath) throw new Error("julia-tier2-v2-worker-payload-missing");

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function bounded(value: number): number {
  return Number.isFinite(value) ? value / (1 + Math.abs(value)) : 0;
}

function stateProjection(
  state: FrmLikeV1CpuState,
  event: boolean,
  shouldContinue: boolean,
): readonly [number, number, number, number] {
  const z = state.values.z;
  return [
    bounded(z?.re ?? 0),
    bounded(z?.im ?? 0),
    event ? 1 : 0,
    shouldContinue ? 1 : 0,
  ];
}

function runtimeParameters(
  profile: JuliaRendererProfileV2,
  juliaC: readonly [number, number],
): Readonly<Record<string, RuntimeParameter>> {
  const base = profile.parameters as Readonly<Record<string, RuntimeParameter>>;
  return profile.binding.kind === "parameter"
    ? Object.freeze({ ...base, [profile.binding.slotName]: juliaC })
    : base;
}

function runCpuTrace(
  backend: FrmLikeV1Backend,
  profile: JuliaRendererProfileV2,
  point: readonly [number, number],
  juliaC: readonly [number, number],
  maximumDepth: number = JULIA_RENDERER_MAX_DEPTH_V2,
): number[] {
  const state = backend.cpu.createState({
    pixel: { re: point[0], im: point[1] },
    c:
      profile.binding.kind === "parameter"
        ? { re: point[0], im: point[1] }
        : { re: juliaC[0], im: juliaC[1] },
    ismand: false,
    maxit: maximumDepth,
    parameters: runtimeParameters(profile, juliaC),
  });
  const initialized = backend.cpu.init(state);
  let event = initialized.event === "nonFinite";
  let shouldContinue = !event;
  const output: number[] = [];
  for (let step = 1; step <= maximumDepth; step++) {
    if (shouldContinue) {
      const stepped = backend.cpu.step(state);
      const continuation = backend.cpu.shouldContinue(state);
      event =
        event ||
        stepped.event === "nonFinite" ||
        continuation.event === "nonFinite" ||
        state.terminated === "nonFinite";
      shouldContinue =
        !event &&
        continuation.event === undefined &&
        continuation.continue !== false;
    }
    output.push(...stateProjection(state, event, shouldContinue));
  }
  return output;
}

function imagePoint(
  profile: JuliaRendererProfileV2,
  x: number,
  y: number,
): readonly [number, number] {
  const localX =
    (((x + 0.5) / JULIA_RENDERER_IMAGE_WIDTH_V2) * 2 - 1) / profile.view.zoom;
  const localY =
    ((((y + 0.5) / JULIA_RENDERER_IMAGE_HEIGHT_V2) * 2 - 1) *
      (JULIA_RENDERER_IMAGE_HEIGHT_V2 / JULIA_RENDERER_IMAGE_WIDTH_V2)) /
    profile.view.zoom;
  const cosine = Math.cos(profile.view.rotation);
  const sine = Math.sin(profile.view.rotation);
  return [
    profile.view.centerX + localX * cosine - localY * sine,
    profile.view.centerY + localX * sine + localY * cosine,
  ];
}

function runCpuImage(
  backend: FrmLikeV1Backend,
  profile: JuliaRendererProfileV2,
  juliaC: readonly [number, number],
): number[] {
  const output: number[] = [];
  for (let y = 0; y < JULIA_RENDERER_IMAGE_HEIGHT_V2; y++) {
    for (let x = 0; x < JULIA_RENDERER_IMAGE_WIDTH_V2; x++) {
      const point = imagePoint(profile, x, y);
      const trace = runCpuTrace(
        backend,
        profile,
        point,
        juliaC,
        JULIA_RENDERER_IMAGE_ITERATIONS_V2,
      );
      output.push(...trace.slice(-4));
    }
  }
  return output;
}

function selectPairFunction(
  name: string,
  values: readonly (readonly [number, number])[],
): string {
  const branches = values
    .map(
      (value, index) =>
        `  ${index === 0 ? "if" : "else if"} (index == ${index}) return vec2(${value[0]}, ${value[1]});`,
    )
    .join("\n");
  return `vec2 ${name}(int index) {\n${branches}\n  return vec2(0.0);\n}`;
}

function parityShader(
  formulaGlsl: string,
  uniforms: readonly PluginUniformDescriptor[],
  binding: JuliaRendererProfileV2["binding"],
): string {
  const declarations = uniforms
    .map((uniform) => `uniform ${uniform.type} ${uniform.name};`)
    .join("\n");
  const orbitConstant =
    binding.kind === "parameter" ? "point" : "u_imageJuliaC";
  return `precision highp float;
${declarations}
uniform int u_probeKind;
uniform vec2 u_imageJuliaC;
uniform vec2 u_imageCenter;
uniform float u_imageZoom;
uniform float u_imageRotation;
${selectPairFunction("juliaTier2Point", JULIA_RENDERER_POINTS_V2)}
${formulaGlsl}
vec4 juliaTier2Run(vec2 point, vec2 orbitC, int requestedSteps) {
  frmV1ResetState(point, orbitC, ${JULIA_RENDERER_MAX_DEPTH_V2}, false);
  vec2 orbitZ = initFormula(vec2(0.0), orbitC, point);
  bool keepGoing = !frmV1NonFiniteEvent;
  for (int i = 0; i < ${JULIA_RENDERER_MAX_DEPTH_V2}; i++) {
    if (i >= requestedSteps || !keepGoing) break;
    orbitZ = iterateStep(orbitZ, orbitC, vec2(0.0), point);
    keepGoing = frmV1ShouldContinue();
  }
  vec2 boundedOrbitZ = orbitZ / (vec2(1.0) + abs(orbitZ));
  return vec4(boundedOrbitZ, frmV1NonFiniteEvent ? 1.0 : 0.0, keepGoing ? 1.0 : 0.0);
}
void main() {
  if (u_probeKind == 0) {
    int requestedDepth = int(floor(gl_FragCoord.x)) + 1;
    vec2 point = juliaTier2Point(int(floor(gl_FragCoord.y)));
    gl_FragColor = juliaTier2Run(point, ${orbitConstant}, requestedDepth);
    return;
  }
  float width = ${JULIA_RENDERER_IMAGE_WIDTH_V2}.0;
  float height = ${JULIA_RENDERER_IMAGE_HEIGHT_V2}.0;
  float localX = ((gl_FragCoord.x / width) * 2.0 - 1.0) / u_imageZoom;
  float localY = ((gl_FragCoord.y / height) * 2.0 - 1.0) * (height / width) / u_imageZoom;
  float cosine = cos(u_imageRotation);
  float sine = sin(u_imageRotation);
  vec2 point = u_imageCenter + vec2(
    localX * cosine - localY * sine,
    localX * sine + localY * cosine
  );
  gl_FragColor = juliaTier2Run(point, ${orbitConstant}, ${JULIA_RENDERER_IMAGE_ITERATIONS_V2});
}`;
}

function sourceFor(
  runtimeRow: PublishedFormulaRuntimeIndexRowV1,
  preGpuRow: JuliaPreGpuRecoveryRowV2,
  candidateById: ReadonlyMap<string, JuliaPixelRecoveryCandidatesRowV1>,
): string {
  const baseline = readFileSync(join(RUNTIME_ROOT, runtimeRow.definitionPath), "utf8");
  if (preGpuRow.binding?.kind === "parameter") {
    const parsed = parseFrmLikeV1(baseline);
    invariant(parsed.ok, `julia-tier2-v2-parameter-source-invalid:${runtimeRow.formulaId}`);
    return canonicalizeFrmLikeV1(parsed.ir);
  }
  if (preGpuRow.binding?.kind === "source-split") {
    const candidate = candidateById.get(runtimeRow.formulaId);
    invariant(
      candidate?.status === "candidate" &&
        candidate.candidate !== undefined &&
        candidate.candidate.sourceRevision === preGpuRow.evaluatedSourceRevision,
      `julia-tier2-v2-source-split-binding-invalid:${runtimeRow.formulaId}`,
    );
    invariant(candidate.candidate !== undefined, "julia-tier2-v2-candidate-missing");
    return readFileSync(
      join(ROOT, "resources/formula-library/v1", candidate.candidate.definitionPath),
      "utf8",
    );
  }
  return baseline;
}

async function buildCases(ids: readonly string[]): Promise<BrowserCase[]> {
  pluginRegistry.register(smoothColoring);
  pluginRegistry.register(blackInsideColoring);
  pluginRegistry.register(noneTransform);
  const preGpu = parseJuliaPreGpuRecoveryCensusV2(preGpuAsset);
  invariant(preGpu.ok, "julia-tier2-v2-pre-gpu-invalid");
  const candidates = parseJuliaPixelRecoveryCandidatesV1(candidateAsset);
  invariant(candidates.ok, "julia-tier2-v2-candidates-invalid");
  const runtime = parsePublishedFormulaRuntimeIndexV1(
    JSON.parse(readFileSync(RUNTIME_INDEX_PATH, "utf8")),
  );
  invariant(runtime.ok, "julia-tier2-v2-runtime-index-invalid");
  const preGpuById = new Map(
    preGpu.value.rows.map((row) => [row.formulaId, row]),
  );
  const runtimeById = new Map(
    runtime.value.rows.map((row) => [row.formulaId, row]),
  );
  const candidateById = new Map(
    candidates.value.rows.map((row) => [row.formulaId, row]),
  );
  const cases: BrowserCase[] = [];
  for (const formulaId of ids) {
    const preGpuRow = preGpuById.get(formulaId);
    const runtimeRow = runtimeById.get(formulaId);
    invariant(
      preGpuRow?.status === "tier2-queue" &&
        runtimeRow &&
        preGpuRow.evaluatedSourceRevision !== null &&
        preGpuRow.evaluatedSemanticHash !== null &&
        preGpuRow.binding !== null &&
        preGpuRow.bindingRevision !== null &&
        preGpuRow.candidateContentHash !== null &&
        preGpuRow.supportLane !== "none",
      `julia-tier2-v2-row-invalid:${formulaId}`,
    );
    const source = sourceFor(runtimeRow, preGpuRow, candidateById);
    const compiled = await compilePublishedFormulaPluginV1({
      formulaId,
      displayName: runtimeRow.displayName,
      family: runtimeRow.family,
      sourceRevision: preGpuRow.evaluatedSourceRevision,
      semanticHash: preGpuRow.evaluatedSemanticHash,
      source,
    });
    invariant(compiled.ok, `julia-tier2-v2-compile-failed:${formulaId}`);
    const { profile, profileDigest } = buildJuliaRendererProfileV2(
      runtimeRow,
      preGpuRow,
    );
    const traceExpected: number[] = [];
    for (const constant of JULIA_RENDERER_CONSTANTS_V2)
      for (const point of JULIA_RENDERER_POINTS_V2)
        traceExpected.push(
          ...runCpuTrace(compiled.value.backend, profile, point, constant),
        );
    const plugin = compiled.value.plugin;
    const fullShader = assembleShader(
      {
        formulaId,
        outsideColoringId: "smooth",
        insideColoringId: "black",
        transformId: "none",
        pipelineVersion: 2,
      },
      plugin,
    );
    const integrationWitness =
      formulaId === JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_ID_V2;
    let integrationShader: string | null = null;
    if (integrationWitness) {
      const frameworkLoopAnchor = "for (int i = 0; i < 10000; i++) {";
      const frameworkLoopCount =
        fullShader.split(frameworkLoopAnchor).length - 1;
      invariant(
        frameworkLoopCount === 2,
        `full-framework-loop-cap-anchor-count:${formulaId}:${frameworkLoopCount}`,
      );
      integrationShader = fullShader.replaceAll(
        frameworkLoopAnchor,
        "for (int i = 0; i < 1; i++) {",
      );
    }
    const parameterSlot =
      profile.binding.kind === "parameter" ? profile.binding.slotName : null;
    const bindingUniformName =
      parameterSlot !== null
        ? (compiled.value.descriptor.parameters.find(
            (parameter) => parameter.slotName === parameterSlot,
          )?.uniformName ?? null)
        : null;
    invariant(
      profile.binding.kind !== "parameter" || bindingUniformName !== null,
      `julia-tier2-v2-parameter-uniform-missing:${formulaId}`,
    );
    cases.push({
      formulaId,
      candidateContentHash: preGpuRow.candidateContentHash,
      sourceRevision: preGpuRow.evaluatedSourceRevision,
      semanticHash: preGpuRow.evaluatedSemanticHash,
      binding: profile.binding,
      bindingRevision: preGpuRow.bindingRevision,
      supportLane: preGpuRow.supportLane,
      profileDigest,
      profile,
      bindingUniformName,
      fullShader,
      integrationShader,
      parityShader: parityShader(plugin.glsl, plugin.uniforms, profile.binding),
      uniforms: plugin.uniforms,
      traceExpected,
      imageExpectedA: runCpuImage(
        compiled.value.backend,
        profile,
        JULIA_RENDERER_CONSTANTS_V2[0],
      ),
      imageExpectedB: runCpuImage(
        compiled.value.backend,
        profile,
        JULIA_RENDERER_CONSTANTS_V2[1],
      ),
    });
  }
  return cases;
}

async function main(): Promise<void> {
  const payload = JSON.parse(
    readFileSync(payloadPath, "utf8"),
  ) as WorkerPayload;
  invariant(
    Array.isArray(payload.ids) &&
      payload.ids.length > 0 &&
      new Set(payload.ids).size === payload.ids.length,
    "julia-tier2-worker-payload-invalid",
  );
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
    await page.evaluate(
      "globalThis.__name = globalThis.__name || ((value) => value);",
    );
    const results = await page.evaluate(async (browserCases) => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2", {
        antialias: false,
        preserveDrawingBuffer: true,
      });
      if (!gl) throw new Error("webgl2-unavailable");
      if (!gl.getExtension("EXT_color_buffer_float"))
        throw new Error("ext-color-buffer-float-unavailable");
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
          const message = String(
            gl.getShaderInfoLog(shader) ?? "shader-compile-failed",
          );
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
          const message = String(
            gl.getProgramInfoLog(program) ?? "program-link-failed",
          );
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
      if (!texture || !framebuffer)
        throw new Error("framebuffer-allocation-failed");
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      const allocate = (width: number, height: number) => {
        canvas.width = width;
        canvas.height = height;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA32F,
          width,
          height,
          0,
          gl.RGBA,
          gl.FLOAT,
          null,
        );
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          texture,
          0,
        );
        if (
          gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
        )
          throw new Error("framebuffer-incomplete");
        gl.viewport(0, 0, width, height);
      };
      const bytesEqual = (left: Float32Array, right: Float32Array): boolean => {
        if (left.length !== right.length) return false;
        const a = new Uint32Array(left.buffer, left.byteOffset, left.length);
        const b = new Uint32Array(right.buffer, right.byteOffset, right.length);
        return a.every((value, index) => value === b[index]);
      };
      const close = (actual: number, expected: number): boolean =>
        Number.isFinite(actual) &&
        Number.isFinite(expected) &&
        Math.abs(actual - expected) <=
          0.005 * Math.max(1, Math.abs(actual), Math.abs(expected));
      const relativeError = (actual: number, expected: number): number =>
        Math.abs(actual - expected) /
        Math.max(1, Math.abs(actual), Math.abs(expected));
      const output: JuliaRendererReportRowV2[] = [];
      for (const testCase of browserCases) {
        let fullProgram: WebGLProgram | undefined;
        let integrationProgram: WebGLProgram | undefined;
        let parityProgram: WebGLProgram | undefined;
        try {
          fullProgram = link(testCase.fullShader);
          if (testCase.integrationShader !== null)
            integrationProgram = link(testCase.integrationShader);
          parityProgram = link(testCase.parityShader);
          gl.useProgram(parityProgram);
          const position = gl.getAttribLocation(parityProgram, "a");
          if (position < 0) throw new Error("position-attribute-missing");
          gl.enableVertexAttribArray(position);
          gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
          for (const uniform of testCase.uniforms) {
            const location = gl.getUniformLocation(parityProgram, uniform.name);
            if (location === null) continue;
            if (uniform.type === "int" || uniform.type === "bool")
              gl.uniform1i(location, Number(uniform.default));
            else if (uniform.type === "float")
              gl.uniform1f(location, Number(uniform.default));
            else if (uniform.type === "vec2") {
              const value = Array.isArray(uniform.default)
                ? uniform.default
                : [uniform.default, uniform.default];
              gl.uniform2f(
                location,
                Number(value[0] ?? 0),
                Number(value[1] ?? 0),
              );
            }
          }
          const kind = gl.getUniformLocation(parityProgram, "u_probeKind");
          const imageC = gl.getUniformLocation(parityProgram, "u_imageJuliaC");
          const imageCenter = gl.getUniformLocation(
            parityProgram,
            "u_imageCenter",
          );
          const imageZoom = gl.getUniformLocation(parityProgram, "u_imageZoom");
          const imageRotation = gl.getUniformLocation(
            parityProgram,
            "u_imageRotation",
          );
          const bindingUniform =
            testCase.bindingUniformName === null
              ? null
              : gl.getUniformLocation(parityProgram, testCase.bindingUniformName);
          if (
            kind === null ||
            imageCenter === null ||
            imageZoom === null ||
            imageRotation === null ||
            (testCase.bindingUniformName === null
              ? imageC === null
              : bindingUniform === null)
          )
            throw new Error("renderer-uniform-missing");
          const draw = (width: number, height: number): Float32Array => {
            allocate(width, height);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.finish();
            const values = new Float32Array(width * height * 4);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, values);
            if (gl.getError() !== gl.NO_ERROR) throw new Error("draw-failed");
            return values;
          };
          const applyConstant = (constant: readonly [number, number]) => {
            if (imageC !== null)
              gl.uniform2f(imageC, constant[0], constant[1]);
            if (bindingUniform !== null)
              gl.uniform2f(bindingUniform, constant[0], constant[1]);
          };
          gl.uniform1i(kind, 0);
          const traceValues: number[] = [];
          for (const constant of [
            [-0.7, 0.27],
            [0.285, 0.01],
            [-0.1542022, 0.6137691],
          ] as const) {
            applyConstant(constant);
            const first = draw(128, 3);
            const second = draw(128, 3);
            if (!bytesEqual(first, second))
              throw new Error("trace-nondeterministic");
            traceValues.push(...first);
          }
          if (traceValues.length !== testCase.traceExpected.length)
            throw new Error("trace-cardinality-mismatch");
          let maximumRelativeError = 0;
          for (let index = 0; index < traceValues.length; index++) {
            const actual = traceValues[index] ?? Number.NaN;
            const expected = testCase.traceExpected[index] ?? Number.NaN;
            if (index % 4 >= 2) {
              if (actual >= 0.5 !== expected >= 0.5)
                throw new Error(`trace-flag-mismatch:${index}`);
            } else {
              maximumRelativeError = Math.max(
                maximumRelativeError,
                relativeError(actual, expected),
              );
              if (!close(actual, expected))
                throw new Error(`trace-state-mismatch:${index}`);
            }
          }
          gl.uniform1i(kind, 1);
          gl.uniform2f(
            imageCenter,
            testCase.profile.view.centerX,
            testCase.profile.view.centerY,
          );
          gl.uniform1f(imageZoom, testCase.profile.view.zoom);
          gl.uniform1f(imageRotation, testCase.profile.view.rotation);
          const runImage = (constant: readonly [number, number]) => {
            applyConstant(constant);
            const first = draw(8, 6);
            const second = draw(8, 6);
            if (!bytesEqual(first, second))
              throw new Error("image-nondeterministic");
            return first;
          };
          const imageA = runImage([-0.7, 0.27]);
          const imageB = runImage([0.285, 0.01]);
          const compareImage = (
            actual: Float32Array,
            expected: readonly number[],
          ) => {
            if (actual.length !== expected.length)
              throw new Error("image-cardinality-mismatch");
            for (let index = 0; index < actual.length; index++) {
              const actualValue = actual[index] ?? Number.NaN;
              const expectedValue = expected[index] ?? Number.NaN;
              if (index % 4 >= 2) {
                if (actualValue >= 0.5 !== expectedValue >= 0.5)
                  throw new Error(`image-flag-mismatch:${index}`);
              } else {
                maximumRelativeError = Math.max(
                  maximumRelativeError,
                  relativeError(actualValue, expectedValue),
                );
                if (!close(actualValue, expectedValue))
                  throw new Error(`image-state-mismatch:${index}`);
              }
            }
          };
          compareImage(imageA, testCase.imageExpectedA);
          compareImage(imageB, testCase.imageExpectedB);
          let imageDifferingPixels = 0;
          for (let pixel = 0; pixel < 48; pixel++) {
            const offset = pixel * 4;
            if (
              Math.abs((imageA[offset] ?? 0) - (imageB[offset] ?? 0)) > 1e-6 ||
              Math.abs((imageA[offset + 1] ?? 0) - (imageB[offset + 1] ?? 0)) >
                1e-6 ||
              (imageA[offset + 2] ?? 0) >= 0.5 !==
                (imageB[offset + 2] ?? 0) >= 0.5 ||
              (imageA[offset + 3] ?? 0) >= 0.5 !==
                (imageB[offset + 3] ?? 0) >= 0.5
            )
              imageDifferingPixels += 1;
          }
          if (imageDifferingPixels === 0)
            throw new Error("image-constant-insensitive");

          if (integrationProgram) {
            gl.useProgram(integrationProgram);
            const fullPosition = gl.getAttribLocation(integrationProgram, "a");
            if (fullPosition < 0)
              throw new Error("full-framework-position-attribute-missing");
            gl.enableVertexAttribArray(fullPosition);
            gl.vertexAttribPointer(fullPosition, 2, gl.FLOAT, false, 0, 0);
            for (const uniform of testCase.uniforms) {
              const location = gl.getUniformLocation(
                integrationProgram,
                uniform.name,
              );
              if (location === null) continue;
              if (uniform.type === "int" || uniform.type === "bool")
                gl.uniform1i(location, Number(uniform.default));
              else if (uniform.type === "float")
                gl.uniform1f(location, Number(uniform.default));
              else if (uniform.type === "vec2") {
                const value = Array.isArray(uniform.default)
                  ? uniform.default
                  : [uniform.default, uniform.default];
                gl.uniform2f(
                  location,
                  Number(value[0] ?? 0),
                  Number(value[1] ?? 0),
                );
              }
            }
            const fullUniform = (name: string): WebGLUniformLocation => {
              const location = gl.getUniformLocation(integrationProgram!, name);
              if (location === null)
                throw new Error(`full-framework-uniform-missing:${name}`);
              return location;
            };
            gl.uniform2f(fullUniform("u_resolution"), 1, 1);
            gl.uniform2f(
              fullUniform("u_center"),
              testCase.profile.view.centerX,
              testCase.profile.view.centerY,
            );
            gl.uniform1f(fullUniform("u_zoom"), testCase.profile.view.zoom);
            gl.uniform1f(
              fullUniform("u_rotation"),
              testCase.profile.view.rotation,
            );
            gl.uniform1i(fullUniform("u_maxIterations"), 1);
            gl.uniform1i(fullUniform("u_paletteIndex"), 0);
            gl.uniform1i(fullUniform("u_isJulia"), 1);
            gl.uniform2f(fullUniform("u_juliaC"), -0.7, 0.27);
            gl.uniform1i(fullUniform("u_ssaaLevel"), 0);
            gl.uniform2f(fullUniform("u_tileOffset"), 0, 0);
            const productionFirst = draw(1, 1);
            const productionSecond = draw(1, 1);
            if (!bytesEqual(productionFirst, productionSecond))
              throw new Error("full-framework-draw-nondeterministic");
            if (!productionFirst.every(Number.isFinite))
              throw new Error("full-framework-draw-non-finite");
          }
          output.push({
            formulaId: testCase.formulaId,
            candidateContentHash: testCase.candidateContentHash,
            evaluatedSourceRevision: testCase.sourceRevision,
            evaluatedSemanticHash: testCase.semanticHash,
            binding: testCase.binding,
            bindingRevision: testCase.bindingRevision,
            supportLane: testCase.supportLane,
            profileDigest: testCase.profileDigest,
            status: "passed",
            reasonCode: null,
            rendererClass: "SwiftShader-software",
            fullFrameworkCompileLink: true,
            fullFrameworkCappedDraw: Boolean(integrationProgram),
            deterministicDoubleDraw: true,
            traceOrbitSteps: 128,
            traceStateDimensions: 18,
            traceStateComparisons: 128 * 18,
            traceFlagComparisons: 128 * 18,
            imagePixelComparisons: 2 * 8 * 6,
            observedImageDifferingPixels: imageDifferingPixels,
            observedMaximumRelativeError: maximumRelativeError,
          });
        } catch (error) {
          output.push({
            formulaId: testCase.formulaId,
            candidateContentHash: testCase.candidateContentHash,
            evaluatedSourceRevision: testCase.sourceRevision,
            evaluatedSemanticHash: testCase.semanticHash,
            binding: testCase.binding,
            bindingRevision: testCase.bindingRevision,
            supportLane: testCase.supportLane,
            profileDigest: testCase.profileDigest,
            status: "blocked",
            reasonCode:
              error instanceof Error ? error.message : "renderer-row-failed",
            rendererClass: "SwiftShader-software",
            fullFrameworkCompileLink: Boolean(fullProgram),
            fullFrameworkCappedDraw: false,
            deterministicDoubleDraw: false,
            traceOrbitSteps: 0,
            traceStateDimensions: 0,
            traceStateComparisons: 0,
            traceFlagComparisons: 0,
            imagePixelComparisons: 0,
            observedImageDifferingPixels: 0,
            observedMaximumRelativeError: 0,
          });
        } finally {
          if (fullProgram) gl.deleteProgram(fullProgram);
          if (integrationProgram) gl.deleteProgram(integrationProgram);
          if (parityProgram) gl.deleteProgram(parityProgram);
        }
      }
      return { renderer, rows: output };
    }, cases);
    process.stdout.write(
      `${JSON.stringify({ ok: true, renderer: results.renderer, rows: results.rows })}\n`,
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
        error instanceof Error ? error.message : "julia-tier2-worker-failed",
    })}\n`,
  );
  process.exitCode = 1;
});
