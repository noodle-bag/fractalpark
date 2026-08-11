/**
 * FRM WebGL smoke (v0.4.18 Slice 4) — dumb runner.
 *
 * Consumes tests/e2e/.fixtures/frm-smoke-payload.json produced by
 * scripts/frm-smoke-payload.ts (production compiler + assembler + CPU
 * oracle). Per row:
 *   A) the FULLY ASSEMBLED framework shader must compile in a real WebGL
 *      context (Chromium SwiftShader) — catches GLSL emission bugs the CPU
 *      path cannot see;
 *   B) a driver fragment shader embedding the plugin's own initGlsl +
 *      iterateStep runs three fixture pixels with the v2 after-step /
 *      descriptor escape rule; the GPU escape iteration must match the CPU
 *      evaluator (deltas > 1 fail; 0/1 are tallied and reported).
 *
 * App-free: page.setContent + inline canvas — run with SKIP_WEB_SERVER=1.
 * SwiftShader flags come from playwright.config.ts. Payload regeneration:
 *   npm run test:webgl-smoke   (builds the payload, then runs this spec)
 */

import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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
}

interface Payload {
  pixels: Array<[number, number]>;
  maxIter: number;
  rows: PayloadRow[];
}

test.setTimeout(300000);

test.describe('FRM WebGL smoke (SwiftShader)', () => {
  test('production GLSL compiles and GPU orbits match the CPU oracle', async ({
    page,
  }) => {
    test.skip(
      !existsSync(PAYLOAD_PATH),
      'payload missing — run scripts/frm-smoke-payload.ts first (npm run test:webgl-smoke)',
    );
    const payload = JSON.parse(readFileSync(PAYLOAD_PATH, 'utf-8')) as Payload;

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
        const w = window as unknown as { __smoke: any };
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
          const w = window as unknown as { __smoke: any };
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
      summary.push(
        `${row.name}: gpu=[${iters}] cpu=[${row.cpu}] ${bad ? 'MISMATCH' : 'ok'}`,
      );
      expect(
        bad,
        `${row.name}: gpu=${JSON.stringify(iters)} cpu=${JSON.stringify(row.cpu)}`,
      ).toBe(false);
    }

    console.log(
      `FRM WebGL smoke: ${payload.rows.length} formulas, ${exact} exact / ${offByOne} off-by-one of ${pixelsTotal} pixels\n` +
        summary.join('\n'),
    );
  });
});
