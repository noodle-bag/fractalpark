/**
 * FRM WebGL smoke payload generator (v0.4.18 Slice 4).
 *
 * Produces the JSON payload consumed by tests/e2e/frm-webgl-smoke.spec.ts.
 * The spec itself is a dumb runner (no src imports — Playwright cannot
 * resolve .glsl); everything here goes through PRODUCTION APIs only:
 * compileClassicFrmEntry (strict v2), assembleShader (pipeline v2 combo),
 * evaluateOrbit + evalDescriptorThreshold (CPU oracle).
 *
 * Build & run (esbuild bundles the .glsl templates as text):
 *   npx esbuild scripts/frm-smoke-payload.ts --bundle --platform=node \
 *     --format=esm --loader:.glsl=text --outfile=node_modules/.cache/frm-smoke-payload.mjs
 *   node node_modules/.cache/frm-smoke-payload.mjs
 *
 * Optional corpus sampling (private, never committed):
 *   FRM_SMOKE_LEDGER=<ledger.md> FRM_SMOKE_CORPUS=<dir> node ...
 * writes rows for a deterministic stride sample + all E3/E10-flagged rows.
 *
 * Output: tests/e2e/.fixtures/frm-smoke-payload.json (gitignored).
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { compileClassicFrmEntry } from '../src/engine/frm/compile';
import { scanFrmEntries } from '../src/engine/frm/scanner';
import { evaluateOrbit, evalDescriptorThreshold } from '../src/engine/frm/orbit-eval';
import { assembleShader } from '../src/engine/shaders/assembler';
import { registerBuiltins } from '../src/engine/plugins/builtins';
// The plugin GLSL references the shared complex-math library (complexPow
// etc.) — the framework injects it at assembly time, the driver must
// prepend it explicitly.
import complexMathLib from '../src/engine/shaders/complex-math.glsl';

const OUT = join(
  process.cwd(),
  'tests',
  'e2e',
  '.fixtures',
  'frm-smoke-payload.json',
);
const PIXELS: Array<[number, number]> = [
  [0.25, 0.1],
  [-0.5, 0.3],
  [1.1, -0.4],
];
const MAX_ITER = 12;

registerBuiltins({ quiet: true });

interface SmokeCase {
  name: string;
  source: string; // entry source, or the FULL file text when key is set
  key?: string;   // scanner entry key (corpus rows: resolve within source)
}

const AUTHORED_CASES: SmokeCase[] = [
  { name: 'smoke-mandel', source: 'SmokeMandel {\n  z = 0:\n  z = z^2 + c,\n  |z| < 4\n}' },
  {
    name: 'smoke-c-rebind',
    source:
      'SmokeRebind {\n  z = 0, x = real(pixel), y = imag(pixel), c = x*(cos(y)+x*sin(y)):\n  z = sqr(z) + c,\n  |z| < 4\n}',
  },
  {
    name: 'smoke-fn-slot',
    source: 'SmokeFn[function=sqr] {\n  z = pixel:\n  z = fn1(z) + c,\n  |z| < 4\n}',
  },
  {
    name: 'smoke-c2-threshold',
    source: 'SmokeC2 {\n  t = p1 + 4, z = 0:\n  z = z^2 + c,\n  |z| <= t\n}',
  },
  {
    name: 'smoke-branches',
    source:
      'SmokeIf {\n  z = 0:\n  if real(z) > 1\n    z = 0\n  elseif real(z) < 0\n    z = 2\n  else\n    z = z + c\n  endif,\n  |z| < 4\n}',
  },
  {
    name: 'smoke-case-mix',
    source: 'SmokeCase {\n  Z = Pixel:\n  Z = Sqr(Z) + C,\n  |Z| < 4\n}',
  },
  {
    name: 'smoke-abs-ship',
    source: 'SmokeShip {\n  z = 0:\n  z = sqr(abs(z)) + c,\n  |z| < 4\n}',
  },
  {
    name: 'smoke-c4r-real',
    source: 'SmokeC4R {\n  z = 0:\n  z = z^2 + c,\n  real(z) <= 3\n}',
  },
  {
    name: 'smoke-c4r-abs-real',
    source: 'SmokeC4RAbs {\n  z = 0:\n  z = z^2 + c,\n  |real(z)| <= 3\n}',
  },
  {
    name: 'smoke-inverse-radial',
    source: 'SmokeInv {\n  z = 10:\n  z = z/4 + c,\n  |z| > 2\n}',
  },
];

function corpusCases(): SmokeCase[] {
  const ledger = process.env.FRM_SMOKE_LEDGER;
  const corpus = process.env.FRM_SMOKE_CORPUS;
  if (!ledger || !corpus || !existsSync(ledger)) return [];
  const byBase = new Map<string, string>();
  const bySuffix = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.toLowerCase().endsWith('.frm')) {
        byBase.set(name.toLowerCase(), p);
        bySuffix.set(p.slice(corpus.length + 1).replace(/\\/g, '/').toLowerCase(), p);
      }
    }
  };
  walk(corpus);
  interface Row {
    name: string;
    eflags: string;
    source: string;
  }
  const rows: Row[] = [];
  // Slice 5g: T0+T1 tiers; Slice 6a: T2 too (C5 GPU-vs-CPU evidence —
  // the exotic-magnitude rows moved to T2 by the second re-projection).
  // The seven Slice-5 waiver rows are excluded (compile-rejects by
  // design — evidence in the Slice 5 archive).
  const WAIVERS = new Set([
    'frm-d1',
    "f'functionike",
    'fly',
    'julia',
    'mand_1',
    'mandel',
    'g-3-03-m',
  ]);
  for (const line of readFileSync(ledger, 'utf-8').split('\n')) {
    if (!line.startsWith('| ') || line.startsWith('| ---')) continue;
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (cells.length < 14 || cells[0] === '名称') continue;
    if (cells[3] !== 'T0' && cells[3] !== 'T1' && cells[3] !== 'T2') continue;
    if (WAIVERS.has(cells[0])) continue;
    rows.push({ name: cells[0], eflags: cells[5], source: cells[6] });
  }
  // Deterministic sample: every 9th row, plus every E3/E10-flagged row.
  const picked = rows.filter(
    (r, i) => i % 9 === 0 || /E3|E10/.test(r.eflags),
  );
  const cases: SmokeCase[] = [];
  const scanCache = new Map<string, string>();
  for (const row of picked) {
    const rel = row.source.toLowerCase();
    const base = basename(rel);
    const path =
      bySuffix.get(rel) ?? bySuffix.get(`fractint/formulas/${base}`) ?? byBase.get(base);
    if (!path) continue;
    if (!scanCache.has(path)) scanCache.set(path, readFileSync(path, 'latin1'));
    // Carry the full file text + the scanner key; the production scanner
    // resolves the entry (handles symmetry parens, bracket options, prose).
    const bare = row.name.replace(/\[.*\]/, '');
    cases.push({ name: `corpus-${row.name}`, source: scanCache.get(path)!, key: bare });
  }
  return cases;
}

interface PayloadRow {
  name: string;
  assembled: string;
  driverFrag: string;
  fnDefaults: Record<string, number>;
  threshold: number;
  /** 0 radial |z| (squared compare), 1 real-projection z.x, 2 abs(z.x). */
  proj: number;
  /** descriptor predicate direction: 0 `<`, 1 `<=`, 2 `>`, 3 `>=`. */
  op: number;
  maxIter: number;
  cpu: number[];
}

function buildDriverFrag(formulaGlsl: string, hasInit: boolean): string {
  return `precision highp float;
uniform vec2 u_c0; uniform vec2 u_c1; uniform vec2 u_c2;
uniform float u_threshold;
uniform int u_proj;
uniform int u_op;
uniform int u_maxIterations;
uniform bool u_isJulia;
uniform vec2 u_juliaC;
uniform vec2 u_p1; uniform vec2 u_p2; uniform vec2 u_p3; uniform vec2 u_p4; uniform vec2 u_p5;
uniform int u_fn1; uniform int u_fn2; uniform int u_fn3; uniform int u_fn4;
${formulaGlsl}
void main() {
  int idx = int(gl_FragCoord.x);
  vec2 c = u_c0;
  if (idx == 1) c = u_c1;
  if (idx == 2) c = u_c2;
  vec2 point = c;
  vec2 z = vec2(0.0);
  ${hasInit ? 'z = initFormula(z, c, point);' : ''}
  vec2 zPrev = vec2(0.0);
  int escaped = 0;
  for (int i = 0; i < 10000; i++) {
    if (i >= u_maxIterations) break;
    vec2 steppedZ = iterateStep(z, c, zPrev, point);
    zPrev = z;
    z = steppedZ;
    // Predicate holds-then-negate, matching the assembler's inverted
    // escapeOp; C4-R projections compare z.x raw (never squared).
    float v = u_proj == 0 ? dot(z, z) : (u_proj == 1 ? z.x : abs(z.x));
    float t = u_proj == 0 ? u_threshold * u_threshold : u_threshold;
    bool holds = u_op == 0 ? v < t
      : u_op == 1 ? v <= t
      : u_op == 2 ? v > t
      : v >= t;
    if (!holds) { escaped = i + 1; break; }
  }
  int result = escaped == 0 ? u_maxIterations + 1 : escaped;
  gl_FragColor = vec4(float(result) / 64.0, 0.0, 0.0, 1.0);
}`;
}

function main() {
  const cases = [...AUTHORED_CASES, ...corpusCases()];
  const rows: PayloadRow[] = [];
  const skipped: string[] = [];
  for (const fixture of cases) {
    let entryName = fixture.key ?? fixture.source.split(/[\s[{]/, 1)[0];
    if (fixture.key) {
      // Case-insensitive key resolution via the production scanner (the
      // ledger lowercases; corpus headers may not).
      const scan = scanFrmEntries(fixture.source);
      const found = scan.entries.find(
        (e) => e.key.toLowerCase() === fixture.key!.toLowerCase(),
      );
      if (!found) {
        skipped.push(`${fixture.name}: key ${fixture.key} not found`);
        continue;
      }
      entryName = found.key;
    }
    const compiled = compileClassicFrmEntry(fixture.source, entryName, `smoke-${fixture.name}`, 2);
    if (!compiled.success || !compiled.plugin || !compiled.bailoutDescriptor || !compiled.ast) {
      skipped.push(`${fixture.name}: ${compiled.errors[0]?.slice(0, 80) ?? 'no descriptor'}`);
      continue;
    }
    const plugin = compiled.plugin;
    const descriptor = compiled.bailoutDescriptor;
    const assembled = assembleShader(
      {
        formulaId: plugin.id,
        outsideColoringId: 'binary',
        insideColoringId: 'black',
        transformId: 'none',
        pipelineVersion: 2,
      },
      plugin,
    );
    const cpu = PIXELS.map(([re, im]) => {
      const r = evaluateOrbit(compiled.ast!, {
        pixel: { re, im },
        maxIterations: MAX_ITER,
        descriptor,
        plugin,
      });
      return r.escapedAt ?? MAX_ITER + 1;
    });
    const threshold = evalDescriptorThreshold(descriptor);
    const fnDefaults = Object.fromEntries(
      plugin.uniforms
        .filter((u) => /^u_fn[1-4]$/.test(u.name))
        .map((u) => [u.name, u.default as number]),
    );
    rows.push({
      name: fixture.name,
      assembled,
      driverFrag: buildDriverFrag(
        `${complexMathLib}\n${plugin.initGlsl ?? ''}\n${plugin.glsl}`,
        Boolean(plugin.initGlsl),
      ),
      fnDefaults,
      threshold,
      proj:
        descriptor.kind === 'C4R'
          ? descriptor.form === 'abs-real'
            ? 2
            : 1
          : 0,
      op: { '<': 0, '<=': 1, '>': 2, '>=': 3 }[descriptor.op],
      maxIter: MAX_ITER,
      cpu,
    });
  }
  mkdirSync(join(OUT, '..'), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ pixels: PIXELS, maxIter: MAX_ITER, rows }, null, 1));
  console.log(`payload rows: ${rows.length} (authored ${AUTHORED_CASES.length}); skipped: ${skipped.length}`);
  for (const s of skipped.slice(0, 12)) console.log(`  skip ${s}`);
  console.log(`out: ${OUT}`);
  // Authored cases are the contract: any authored skip means the compiler
  // regressed — fail loudly instead of emitting a vacuous payload.
  const authoredNames = new Set(AUTHORED_CASES.map((c) => c.name));
  const authoredSkipped = skipped.filter((s) => authoredNames.has(s.split(':')[0]));
  if (authoredSkipped.length > 0 || rows.length < AUTHORED_CASES.length) {
    console.error(
      `FATAL: ${authoredSkipped.length} authored cases skipped — refusing to emit a vacuous payload`,
    );
    process.exit(1);
  }
}

main();
