/**
 * FRM WebGL smoke (v0.4.18 Slice 4) — self-sufficient runner.
 *
 * beforeAll regenerates the payload from CURRENT sources via
 * scripts/frm-smoke-payload.ts (esbuild bundles the .glsl templates;
 * production compiler + assembler + CPU oracle), so the spec always tests
 * the code as it stands — never a stale blob. The generated payload is
 * gitignored (corpus-derived when FRM_SMOKE_LEDGER/FRM_SMOKE_CORPUS are
 * set; self-authored otherwise).
 *
 * Per row:
 *   A) the FULLY ASSEMBLED framework shader must compile in a real WebGL
 *      context (Chromium SwiftShader) — catches GLSL emission bugs the CPU
 *      path cannot see;
 *   B) a driver fragment shader embedding the plugin's own initGlsl +
 *      iterateStep runs three fixture pixels with the v2 after-step /
 *      descriptor escape rule; the GPU escape iteration must match the CPU
 *      evaluator (deltas > 1 fail).
 *
 * App-free: page.setContent + inline canvas — run with SKIP_WEB_SERVER=1.
 * Plain `npx playwright test frm-webgl-smoke` works (payload auto-builds);
 * `npm run test:webgl-smoke` is a convenience alias.
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const PAYLOAD_PATH = join(__dirname, '.fixtures', 'frm-smoke-payload.json');

interface PayloadRow {
  name: string;
  assembled: string;
  driverFrag: string;
  fnDefaults: Record<string, number>;
  threshold: number;
  proj: number;
  op: number;
  maxIter: number;
  cpu: number[];
  descriptorKind: 'C1' | 'C2' | 'C4R' | 'C5';
  hasFrmLastSqr: boolean;
}

interface Payload {
  pixels: Array<[number, number]>;
  maxIter: number;
  /** Set when the payload was generated with FRM_SMOKE_FULL=1 (Level 2). */
  full?: boolean;
  rows: PayloadRow[];
  b94Controls: Array<{ name: string; assembled: string }>;
}

/**
 * Level-2 full-coverage mode (payload.full === true) tolerates a beyond-±1
 * GPU/CPU escape-round divergence ONLY when the row's CURRENT run matches
 * the documented fingerprint EXACTLY — both the GPU escape rounds and the
 * f64 CPU oracle rounds. Any change on either side (a semantic regression
 * or an improvement) fails the gate and requires re-evidencing:
 *
 * - corpus-fzppchsq (z=cosh(z)+sqr(pixel), pixel (1.1,-0.4)): GPU escapes
 *   at 8, f64 CPU oracle at 12. Per-round GPU readback shows a ~1e-3 seed
 *   deviation in the transcendental evaluation amplified round-over-round
 *   (0.01 → 0.05 → 0.25 → 2.2 → explosion) — Lyapunov growth, not a code
 *   path difference; a strict-f32 scalar simulation follows the CPU
 *   trajectory, confirming the formula semantics agree. Evidence:
 *   private f588_level2_report.md (Slice 7d).
 *
 * The sampled (CI) smoke never includes these rows in its stride — the
 * strict gate is untouched. Adding a row here requires the same
 * trajectory-level evidence and Codex review.
 */
const FRM_KNOWN_CHAOTIC_BOUNDARY: Readonly<Record<string, { gpu: number[]; cpu: number[] }>> = {
  'corpus-fzppchsq': { gpu: [5, 7, 8], cpu: [5, 7, 12] },
};

const matchesDocumented = (
  name: string,
  gpu: number[],
  cpu: number[],
): boolean => {
  const known = FRM_KNOWN_CHAOTIC_BOUNDARY[name];
  return (
    known !== undefined &&
    known.gpu.length === gpu.length &&
    known.gpu.every((v, i) => v === gpu[i]) &&
    known.cpu.length === cpu.length &&
    known.cpu.every((v, i) => v === cpu[i])
  );
};

/** Result of the in-page shader compile helper installed on `__smoke`. */
type SmokeShaderResult =
  | { error: string; shader?: undefined }
  | { shader: WebGLShader; error?: undefined };

/** In-page runtime installed by beforeAll (gl context + compile helper). */
interface SmokeRuntime {
  gl: WebGLRenderingContext;
  compile: (type: number, src: string) => SmokeShaderResult;
}

test.setTimeout(300000);

test.describe('FRM WebGL smoke (SwiftShader)', () => {
  test.beforeAll(() => {
    test.setTimeout(300000);
    const bundle = 'node_modules/.cache/frm-smoke-payload.mjs';
    // execSync blocks the event loop, so Playwright's own timeout cannot
    // interrupt a hung subprocess — cap each child explicitly instead.
    const CHILD_TIMEOUT = 240_000;
    execSync(
      `npx esbuild scripts/frm-smoke-payload.ts --bundle --platform=node --format=esm --loader:.glsl=text --outfile=${bundle} --log-level=warning`,
      { cwd: REPO_ROOT, stdio: 'inherit', timeout: CHILD_TIMEOUT },
    );
    execSync(`node ${bundle}`, {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: process.env,
      timeout: CHILD_TIMEOUT,
    });
  });

  test('production GLSL compiles and GPU orbits match the CPU oracle', async ({
    page,
  }) => {
    const payload = JSON.parse(readFileSync(PAYLOAD_PATH, 'utf-8')) as Payload;
    // Never let a degenerate payload pass vacuously: all authored cases
    // must be present (the generator also exits nonzero on authored skips).
    expect(payload.rows.length).toBeGreaterThanOrEqual(12);
    for (const name of [
      'smoke-mandel',
      'smoke-c-rebind',
      'smoke-fn-slot',
      'smoke-c2-threshold',
      'smoke-branches',
      'smoke-case-mix',
      'smoke-abs-ship',
      'smoke-c4r-real',
      'smoke-c4r-abs-real',
      'smoke-inverse-radial',
      'smoke-c5-lastsqr',
      'smoke-lastsqr-loop-c1',
    ]) {
      expect(
        payload.rows.some((r) => r.name === name),
        `payload missing authored case ${name}`,
      ).toBe(true);
    }
    expect(payload.b94Controls.map((row) => row.name).sort()).toEqual(
      ['burningShip', 'mandelbrot', 'newton3', 'quadJulia'],
    );
    const c5Control = payload.rows.find((row) => row.name === 'smoke-c5-lastsqr');
    expect(c5Control?.descriptorKind).toBe('C5');
    expect(c5Control?.proj).toBe(3);
    expect(c5Control?.cpu).toEqual([13, 13, 3]);
    expect(c5Control?.assembled).toMatch(/^#define ESCAPE_C5$/m);
    expect(c5Control?.assembled).toMatch(
      /^#define C5_ESCAPE_CHECK\(zz\) \(\(zz\) > 2\.0\)$/m,
    );
    expect(c5Control?.assembled.match(/\bfloat frmLastSqr\b/g)).toHaveLength(1);
    expect(c5Control?.assembled).toMatch(/^#define HAS_FRM_LAST_SQR$/m);
    expect(
      c5Control?.assembled.match(
        /#ifdef HAS_FRM_LAST_SQR\s+frmLastSqr = 0\.0;\s+#endif/g,
      ),
    ).toHaveLength(2);

    const loopLastSqrControl = payload.rows.find(
      (row) => row.name === 'smoke-lastsqr-loop-c1',
    );
    expect(loopLastSqrControl?.descriptorKind).toBe('C1');
    expect(loopLastSqrControl?.hasFrmLastSqr).toBe(true);
    expect(loopLastSqrControl?.cpu).toEqual([13, 13, 3]);
    expect(loopLastSqrControl?.assembled).toMatch(/^#define HAS_FRM_LAST_SQR$/m);
    expect(loopLastSqrControl?.assembled).not.toMatch(/^#define ESCAPE_C5$/m);
    expect(loopLastSqrControl?.assembled.match(/\bfloat frmLastSqr\b/g)).toHaveLength(1);
    expect(
      loopLastSqrControl?.assembled.match(
        /#ifdef HAS_FRM_LAST_SQR\s+frmLastSqr = 0\.0;\s+#endif/g,
      ),
    ).toHaveLength(2);
    expect(loopLastSqrControl?.driverFrag).toMatch(
      /frmLastSqr = 123\.0;\s+frmLastSqr = 0\.0;/,
    );

    await page.setContent('<canvas id="c" width="3" height="1"></canvas>');
    await page.evaluate(() => {
      const w = window as unknown as { __smoke: Record<string, unknown> };
      const canvas = document.getElementById('c') as HTMLCanvasElement;
      const gl = canvas.getContext('webgl', {
        antialias: false,
        preserveDrawingBuffer: true,
      })!;
      w.__smoke = {
        gl,
        compile: (type: number, src: string) => {
          const sh = gl.createShader(type)!;
          gl.shaderSource(sh, src);
          gl.compileShader(sh);
          if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(sh);
            gl.deleteShader(sh);
            return { error: log ?? 'unknown' };
          }
          return { shader: sh };
        },
      };
    });

    const summary: string[] = [];
    let exact = 0;
    let offByOne = 0;
    let pixelsTotal = 0;

    for (const row of payload.rows) {
      // Layer A: fully assembled framework shader compiles for real.
      const layerA = await page.evaluate((src) => {
        const w = window as unknown as { __smoke: SmokeRuntime };
        const { gl, compile } = w.__smoke;
        const r = compile(gl.FRAGMENT_SHADER, src);
        if (r.error) return { compileError: r.error };
        gl.deleteShader(r.shader);
        return {};
      }, row.assembled);
      expect(layerA.compileError, `${row.name} assembled shader`).toBeUndefined();

      // Layer B: driver shader executes the production iterateStep.
      const gpu = await page.evaluate(
        ({ row: r, pixels }) => {
          const w = window as unknown as { __smoke: SmokeRuntime };
          const { gl, compile } = w.__smoke;
          const vs = compile(
            gl.VERTEX_SHADER,
            'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }',
          );
          if (vs.error) return { compileError: `vs: ${vs.error}` };
          const fs = compile(gl.FRAGMENT_SHADER, r.driverFrag);
          if (fs.error) return { compileError: `fs: ${fs.error}` };
          const prog = gl.createProgram()!;
          gl.attachShader(prog, vs.shader);
          gl.attachShader(prog, fs.shader);
          gl.linkProgram(prog);
          if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            return { compileError: `link: ${gl.getProgramInfoLog(prog)}` };
          }
          gl.useProgram(prog);
          const buf = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 3, -1, -1, 3]),
            gl.STATIC_DRAW,
          );
          const loc = gl.getAttribLocation(prog, 'a');
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
          const set2f = (n: string, x: number, y: number) => {
            const l = gl.getUniformLocation(prog, n);
            if (l) gl.uniform2f(l, x, y);
          };
          const set1i = (n: string, x: number) => {
            const l = gl.getUniformLocation(prog, n);
            if (l) gl.uniform1i(l, x);
          };
          set2f('u_c0', pixels[0][0], pixels[0][1]);
          set2f('u_c1', pixels[1][0], pixels[1][1]);
          set2f('u_c2', pixels[2][0], pixels[2][1]);
          set2f('u_juliaC', 0, 0);
          for (const n of ['u_p1', 'u_p2', 'u_p3', 'u_p4', 'u_p5']) set2f(n, 0, 0);
          for (const [n, v] of Object.entries(r.fnDefaults)) set1i(n, v as number);
          set1i('u_op', r.op);
          set1i('u_proj', r.proj);
          set1i('u_maxIterations', r.maxIter);
          const lth = gl.getUniformLocation(prog, 'u_threshold');
          if (lth) gl.uniform1f(lth, r.threshold);
          set1i('u_isJulia', 0);
          gl.viewport(0, 0, 3, 1);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          const out = new Uint8Array(4 * 3);
          gl.readPixels(0, 0, 3, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
          gl.deleteProgram(prog);
          gl.deleteShader(vs.shader);
          gl.deleteShader(fs.shader);
          gl.deleteBuffer(buf);
          return { iters: [0, 1, 2].map((i) => Math.round((out[i * 4] * 64) / 255)) };
        },
        { row, pixels: payload.pixels },
      );

      expect(gpu.compileError, `${row.name} driver shader`).toBeUndefined();
      const iters = gpu.iters!;
      const deltas = iters.map((g, i) => Math.abs(g - row.cpu[i]));
      pixelsTotal += 3;
      for (const d of deltas) {
        if (d === 0) exact++;
        else if (d === 1) offByOne++;
      }
      const bad = deltas.some((d) => d > 1);
      const documentedChaotic =
        bad &&
        payload.full === true &&
        matchesDocumented(row.name, iters, row.cpu);
      summary.push(
        `${row.name}: gpu=[${iters}] cpu=[${row.cpu}] ${
          bad ? (documentedChaotic ? 'documented-chaotic-boundary' : 'MISMATCH') : 'ok'
        }`,
      );
      expect(
        bad && !documentedChaotic,
        `${row.name}: gpu=${JSON.stringify(iters)} cpu=${JSON.stringify(row.cpu)}`,
      ).toBe(false);
    }

    // B94 controls use the frozen renderer pipeline-v1 path and bypass the
    // FRM compiler. Registry presence alone cannot catch framework/assembler
    // regressions, so compile, link, draw, and read back each control shader.
    for (const control of payload.b94Controls) {
      const result = await page.evaluate(({ name, assembled }) => {
        const w = window as unknown as { __smoke: SmokeRuntime };
        const { gl, compile } = w.__smoke;
        const vertex = compile(
          gl.VERTEX_SHADER,
          'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }',
        );
        if (vertex.error) return { error: `vertex: ${vertex.error}` };
        const fragment = compile(gl.FRAGMENT_SHADER, assembled);
        if (fragment.error) {
          gl.deleteShader(vertex.shader);
          return { error: `fragment: ${fragment.error}` };
        }
        const program = gl.createProgram()!;
        gl.attachShader(program, vertex.shader);
        gl.attachShader(program, fragment.shader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          const error = `link: ${gl.getProgramInfoLog(program) ?? 'unknown'}`;
          gl.deleteProgram(program);
          gl.deleteShader(vertex.shader);
          gl.deleteShader(fragment.shader);
          return { error };
        }
        gl.useProgram(program);
        const buffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 3, -1, -1, 3]),
          gl.STATIC_DRAW,
        );
        const attribute = gl.getAttribLocation(program, 'a');
        gl.enableVertexAttribArray(attribute);
        gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
        const set1f = (uniform: string, value: number) => {
          const location = gl.getUniformLocation(program, uniform);
          if (location !== null) gl.uniform1f(location, value);
        };
        const set1i = (uniform: string, value: number) => {
          const location = gl.getUniformLocation(program, uniform);
          if (location !== null) gl.uniform1i(location, value);
        };
        const set2f = (uniform: string, x: number, y: number) => {
          const location = gl.getUniformLocation(program, uniform);
          if (location !== null) gl.uniform2f(location, x, y);
        };
        set2f('u_resolution', 3, 1);
        set2f('u_center', 0, 0);
        set1f('u_zoom', 1);
        set1f('u_rotation', 0);
        set1i('u_maxIterations', 32);
        set1i('u_paletteIndex', 0);
        set1i('u_isJulia', name === 'quadJulia' ? 1 : 0);
        set2f('u_juliaC', -0.7, 0.27);
        set1f('u_power', 2);
        set1i('u_ssaaLevel', 0);
        set2f('u_tileOffset', 0, 0);
        set1i('u_lightingEnabled', 0);
        set1i('u_lightingMode', 0);
        set1f('u_lightAzimuth', 0);
        set1f('u_lightElevation', 0);
        set1f('u_lightIntensity', 1);
        set1i('u_useCustomGradient', 0);
        set1i('u_gradientCount', 0);
        while (gl.getError() !== gl.NO_ERROR) {
          // Clear errors from optional/optimized-away uniforms before draw.
        }
        gl.viewport(0, 0, 3, 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.finish();
        const drawError = gl.getError();
        const pixels = new Uint8Array(12);
        gl.readPixels(0, 0, 3, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const readError = gl.getError();
        const contextLost = gl.isContextLost();
        const alpha = [pixels[3], pixels[7], pixels[11]];
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vertex.shader);
        gl.deleteShader(fragment.shader);
        return { drawError, readError, contextLost, alpha };
      }, control);
      expect(result.error, `${control.name} pipeline-v1 shader`).toBeUndefined();
      expect(result.drawError, `${control.name} draw`).toBe(0);
      expect(result.readError, `${control.name} readPixels`).toBe(0);
      expect(result.contextLost, `${control.name} context`).toBe(false);
      expect(result.alpha, `${control.name} readback`).toEqual([255, 255, 255]);
    }

    console.log(
      `FRM WebGL smoke: ${payload.rows.length} formulas, ${exact} exact / ${offByOne} off-by-one of ${pixelsTotal} pixels; ` +
        `${payload.b94Controls.length} B94 pipeline-v1 controls compile/link/draw passed\n` +
        summary.join('\n'),
    );
  });
});
