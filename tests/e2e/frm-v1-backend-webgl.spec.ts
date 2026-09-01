import { expect, test, chromium, type Page } from "@playwright/test";

import {
  compileFrmLikeV1Backend,
  type FrmLikeV1Backend,
} from "../../src/engine/frm/v1-backend";
import { parseFrmLikeV1 } from "../../src/engine/frm/v1";
import type {
  FrmV1Complex,
  FrmV1UnaryFunctionName,
} from "../../src/engine/frm/frm-v1-stdlib";

const UNARY_SOURCE = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
GpuUnary {
  parameters:
    transform: function = abs
  init:
    z = pixel
  loop:
    z = transform(z)
  bailout:
    1 == 1
}`;

function backend(source: string): FrmLikeV1Backend {
  const parsed = parseFrmLikeV1(source);
  if (parsed.ok === false) throw new Error(parsed.reason);
  const compiled = compileFrmLikeV1Backend(parsed.ir);
  if (compiled.ok === false) throw new Error(compiled.reason);
  return compiled.backend;
}

interface GpuRun {
  pixel: readonly [number, number];
  c?: readonly [number, number];
  selector?: number;
  uniforms?: Readonly<Record<string, readonly [number, number]>>;
}

interface GpuResult {
  value: [number, number];
  continueValue: number;
  event: number;
  error: number;
}

async function runGpu(
  page: Page,
  compiled: FrmLikeV1Backend,
  runs: readonly GpuRun[],
): Promise<{ renderer: string; results: GpuResult[] }> {
  return page.evaluate(
    ({ glsl, runs }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const gl = canvas.getContext("webgl", {
        antialias: false,
        preserveDrawingBuffer: true,
      });
      if (!gl) throw new Error("webgl-context-unavailable");
      if (!gl.getExtension("OES_texture_float"))
        throw new Error("oes-texture-float-unavailable");
      if (!gl.getExtension("WEBGL_color_buffer_float"))
        throw new Error("webgl-color-buffer-float-unavailable");

      const compileShader = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) throw new Error("shader-allocation-failed");
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(
            `shader-compile:${gl.getShaderInfoLog(shader)}\n${source}`,
          );
        return shader;
      };
      const vertex = compileShader(
        gl.VERTEX_SHADER,
        "attribute vec2 a_position; void main(){ gl_Position=vec4(a_position,0.0,1.0); }",
      );
      const fragment = compileShader(
        gl.FRAGMENT_SHADER,
        `precision highp float;
${glsl.declarations}
void main() {
  frmV1NonFiniteEvent = false;
  ${glsl.init}
  ${glsl.loop}
  bool continueValue = ${glsl.continuePredicate};
  gl_FragColor = vec4(z, continueValue ? 1.0 : 0.0, ${glsl.eventFlag} ? 1.0 : 0.0);
}`,
      );
      const program = gl.createProgram();
      if (!program) throw new Error("program-allocation-failed");
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(`program-link:${gl.getProgramInfoLog(program)}`);
      gl.useProgram(program);

      const position = gl.getAttribLocation(program, "a_position");
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
      );
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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
        throw new Error("float-framebuffer-incomplete");

      const setVec2 = (name: string, value: readonly [number, number]) => {
        const location = gl.getUniformLocation(program, name);
        if (location) gl.uniform2f(location, value[0], value[1]);
      };
      const selectorLocation = gl.getUniformLocation(
        program,
        "u_frm_transform",
      );
      const results = runs.map((run) => {
        setVec2("pixel", run.pixel);
        setVec2("c", run.c ?? [0, 0]);
        for (const [name, value] of Object.entries(run.uniforms ?? {}))
          setVec2(name, value);
        if (selectorLocation && run.selector !== undefined)
          gl.uniform1i(selectorLocation, run.selector);
        gl.viewport(0, 0, 1, 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const output = new Float32Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, output);
        return {
          value: [output[0], output[1]] as [number, number],
          continueValue: output[2],
          event: output[3],
          error: gl.getError(),
        };
      });
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = String(
        debug
          ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
      );
      return { renderer, results };
    },
    { glsl: compiled.glsl, runs },
  );
}

function cpuUnary(
  compiled: FrmLikeV1Backend,
  name: FrmV1UnaryFunctionName,
  input: FrmV1Complex,
): { value: FrmV1Complex; event: boolean; continueValue: boolean } {
  const state = compiled.cpu.createState({
    pixel: input,
    parameters: { transform: name },
  });
  compiled.cpu.init(state);
  const result = compiled.cpu.step(state);
  const continuation = compiled.cpu.shouldContinue(state);
  return {
    value: state.values.z,
    event: result.event === "nonFinite" || continuation.event === "nonFinite",
    continueValue: continuation.continue ?? false,
  };
}

function expectClose(actual: number, expected: number, tolerance = 3e-4) {
  const bound = tolerance * Math.max(1, Math.abs(actual), Math.abs(expected));
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(bound);
}

test("FRM-like v1 CPU and WebGL stdlib/backend agree within standard32 tolerances", async () => {
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
    const page = await browser.newPage({ viewport: { width: 32, height: 32 } });
    const unary = backend(UNARY_SOURCE);
    const options = unary.glsl.functionOptions;
    const ordinaryInput: FrmV1Complex = { re: 0.4, im: 0.2 };
    const ordinaryRuns = options.map((_, selector) => ({
      pixel: [ordinaryInput.re, ordinaryInput.im] as const,
      selector,
    }));
    const ordinaryGpu = await runGpu(page, unary, ordinaryRuns);
    expect(ordinaryGpu.renderer).toContain("SwiftShader");
    for (const [index, name] of options.entries()) {
      const cpu = cpuUnary(unary, name, ordinaryInput);
      const gpu = ordinaryGpu.results[index];
      expect(gpu.error, name).toBe(0);
      expect(Boolean(gpu.event), name).toBe(cpu.event);
      expect(Boolean(gpu.continueValue), name).toBe(cpu.continueValue);
      if (!cpu.event) {
        expectClose(gpu.value[0], cpu.value.re);
        expectClose(gpu.value[1], cpu.value.im);
      }
    }

    const cutFixtures: Array<{
      name: FrmV1UnaryFunctionName;
      input: FrmV1Complex;
      tolerance?: number;
    }> = [
      { name: "sqrt", input: { re: -4, im: -0 } },
      { name: "log", input: { re: -2, im: -0 } },
      { name: "asin", input: { re: 2, im: -0 }, tolerance: 8e-4 },
      { name: "acos", input: { re: 2, im: -0 }, tolerance: 8e-4 },
      { name: "acosh", input: { re: -2, im: -0 }, tolerance: 8e-4 },
      { name: "atanh", input: { re: 2, im: -0 }, tolerance: 8e-4 },
      { name: "acosh", input: { re: -2, im: 1e-4 }, tolerance: 8e-4 },
      { name: "acosh", input: { re: -2, im: -1e-4 }, tolerance: 8e-4 },
      { name: "atanh", input: { re: 2, im: 1e-4 }, tolerance: 8e-4 },
      { name: "atanh", input: { re: 2, im: -1e-4 }, tolerance: 8e-4 },
      {
        name: "tan",
        input: { re: Math.PI / 2 - 1e-4, im: 0 },
        tolerance: 2e-3,
      },
      { name: "exp", input: { re: 88, im: 0 }, tolerance: 2e-3 },
      { name: "recip", input: { re: 0, im: 0 } },
      { name: "log", input: { re: 0, im: 0 } },
      { name: "exp", input: { re: 100, im: 0 } },
      { name: "log", input: { re: 1e-30, im: 0 } },
      { name: "sqrt", input: { re: 1e-30, im: 0 } },
      { name: "cabs", input: { re: 1e-30, im: 0 } },
    ];
    const cutGpu = await runGpu(
      page,
      unary,
      cutFixtures.map((fixture) => ({
        pixel: [fixture.input.re, fixture.input.im] as const,
        selector: options.indexOf(fixture.name),
      })),
    );
    for (const [index, fixture] of cutFixtures.entries()) {
      const cpu = cpuUnary(unary, fixture.name, fixture.input);
      const gpu = cutGpu.results[index];
      expect(gpu.error, `${fixture.name}:${index}`).toBe(0);
      expect(Boolean(gpu.event), `${fixture.name}:${index}`).toBe(cpu.event);
      expect(Boolean(gpu.continueValue), `${fixture.name}:${index}`).toBe(
        cpu.continueValue,
      );
      if (!cpu.event) {
        expectClose(gpu.value[0], cpu.value.re, fixture.tolerance);
        expectClose(gpu.value[1], cpu.value.im, fixture.tolerance);
      }
    }

    const atan2Backend = backend(
      UNARY_SOURCE.replace("z = transform(z)", "z = atan2(z, c)"),
    );
    const atan2Fixtures = [
      { pixel: [1, 0] as const, c: [-1, 0] as const },
      { pixel: [-0, 0] as const, c: [-1, 0] as const },
      { pixel: [0, 0] as const, c: [-1, 0] as const },
      { pixel: [0, 0] as const, c: [0, 0] as const },
    ];
    const atan2Gpu = await runGpu(page, atan2Backend, atan2Fixtures);
    for (const [index, fixture] of atan2Fixtures.entries()) {
      const state = atan2Backend.cpu.createState({
        pixel: { re: fixture.pixel[0], im: fixture.pixel[1] },
        c: { re: fixture.c[0], im: fixture.c[1] },
      });
      atan2Backend.cpu.init(state);
      atan2Backend.cpu.step(state);
      const continuation = atan2Backend.cpu.shouldContinue(state);
      expectClose(atan2Gpu.results[index].value[0], state.values.z.re);
      expectClose(atan2Gpu.results[index].value[1], state.values.z.im);
      expect(Boolean(atan2Gpu.results[index].event)).toBe(
        continuation.event === "nonFinite",
      );
      expect(Boolean(atan2Gpu.results[index].continueValue)).toBe(
        continuation.continue ?? false,
      );
    }

    const powerBackend = backend(
      UNARY_SOURCE.replace("z = transform(z)", "z = z ^ (2, 9)"),
    );
    const powerState = powerBackend.cpu.createState({
      pixel: { re: 2, im: 0 },
    });
    powerBackend.cpu.init(powerState);
    powerBackend.cpu.step(powerState);
    const powerGpu = await runGpu(page, powerBackend, [{ pixel: [2, 0] }]);
    expectClose(powerGpu.results[0].value[0], powerState.values.z.re);
    expectClose(powerGpu.results[0].value[1], powerState.values.z.im);

    const singularBackend = backend(
      UNARY_SOURCE.replace("z = transform(z)", "z = recip((0, 0))"),
    );
    const singularState = singularBackend.cpu.createState({
      pixel: { re: 1, im: 2 },
    });
    singularBackend.cpu.init(singularState);
    const singularCpu = singularBackend.cpu.step(singularState);
    const singularGpu = await runGpu(page, singularBackend, [
      { pixel: [1, 2] },
    ]);
    expect(singularCpu.event).toBe("nonFinite");
    expect(Boolean(singularGpu.results[0].event)).toBe(true);
    expectClose(singularGpu.results[0].value[0], singularState.values.z.re);
    expectClose(singularGpu.results[0].value[1], singularState.values.z.im);

    const controlSource = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
GpuControl {
  parameters:
    gain: real = 2
    offset: complex = (1, -1)
    transform: function = sqr
  init:
    z = pixel
  loop:
    previous = z
    z = transform(z) + offset
    real(z) = real(z) + gain
    if real(z) > 1
      imag(z) = imag(z) + 3
    else
      imag(z) = imag(z) - 3
    endif
  bailout:
    |z| < 5
}`;
    for (const [limit, expectedContinue] of [
      [5, true],
      [4, false],
    ] as const) {
      const control = backend(
        controlSource.replace("|z| < 5", `|z| < ${limit}`),
      );
      const state = control.cpu.createState({
        pixel: { re: 1, im: 0 },
        parameters: { gain: 2, offset: [1, -1], transform: "sqr" },
      });
      control.cpu.init(state);
      control.cpu.step(state);
      const continuation = control.cpu.shouldContinue(state);
      const selector = control.glsl.functionOptions.indexOf("sqr");
      const gpu = await runGpu(page, control, [
        {
          pixel: [1, 0],
          selector,
          uniforms: { gain: [2, 0], offset: [1, -1] },
        },
      ]);
      expect(state.values.z).toEqual({ re: 4, im: 2 });
      expect(state.values.previous).toEqual({ re: 1, im: 0 });
      expect(continuation.continue).toBe(expectedContinue);
      expectClose(gpu.results[0].value[0], state.values.z.re);
      expectClose(gpu.results[0].value[1], state.values.z.im);
      expect(Boolean(gpu.results[0].continueValue)).toBe(expectedContinue);
      expect(Boolean(gpu.results[0].event)).toBe(false);
    }

    for (const [predicate, expectedEvent] of [
      ["0 && recip((0, 0))", false],
      ["recip((0, 0)) == 0", true],
    ] as const) {
      const predicateBackend = backend(
        UNARY_SOURCE.replace("z = transform(z)", "z = z").replace(
          "1 == 1",
          predicate,
        ),
      );
      const state = predicateBackend.cpu.createState({
        pixel: { re: 1, im: 0 },
      });
      predicateBackend.cpu.init(state);
      predicateBackend.cpu.step(state);
      const continuation = predicateBackend.cpu.shouldContinue(state);
      const gpu = await runGpu(page, predicateBackend, [{ pixel: [1, 0] }]);
      expect(continuation.event === "nonFinite").toBe(expectedEvent);
      expect(Boolean(gpu.results[0].event)).toBe(expectedEvent);
      expect(Boolean(gpu.results[0].continueValue)).toBe(false);
    }

    const classicSource = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
GpuClassicBindings {
  parameters:
    gain: real = 2 classic p1
    transform: function = sin classic fn1
  init:
    z = pixel
  loop:
    z = fn1(z) + p1
  bailout:
    |z| < 100
}`;
    const classic = backend(classicSource);
    expect(classic.glsl.classicBindings).toEqual({
      p1: "gain",
      fn1: "transform",
    });
    expect(classic.glsl.declarations).not.toContain("uniform vec2 p1;");
    expect(classic.glsl.declarations).not.toContain("u_frm_fn1");
    const classicState = classic.cpu.createState({
      pixel: { re: 2, im: 0 },
      parameters: { gain: 3, transform: "sqr" },
    });
    classic.cpu.init(classicState);
    classic.cpu.step(classicState);
    const classicGpu = await runGpu(page, classic, [
      {
        pixel: [2, 0],
        selector: classic.glsl.functionOptions.indexOf("sqr"),
        uniforms: { gain: [3, 0] },
      },
    ]);
    expect(classicState.values.z).toEqual({ re: 7, im: 0 });
    expectClose(classicGpu.results[0].value[0], 7);
    expectClose(classicGpu.results[0].value[1], 0);
  } finally {
    await browser.close();
  }
});
