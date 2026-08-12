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
import { createHash } from 'node:crypto';
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

function corpusCases(): { cases: SmokeCase[]; dropped: string[] } {
  const ledger = process.env.FRM_SMOKE_LEDGER;
  const corpus = process.env.FRM_SMOKE_CORPUS;
  const full = process.env.FRM_SMOKE_FULL === '1';
  if (!ledger || !corpus || !existsSync(ledger) || !existsSync(corpus)) {
    // Full mode is meaningless without the private inputs — fail loudly
    // instead of emitting an authored-only payload marked full:true.
    if (full) {
      console.error('FRM_SMOKE_FULL requires FRM_SMOKE_LEDGER and FRM_SMOKE_CORPUS');
      process.exit(1);
    }
    return { cases: [], dropped: [] };
  }
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
    /** Raw ledger cells (HTML-escaped) for anchor reconstruction. */
    header: string;
    init: string;
    loop: string;
    bailout: string;
    sha: string;
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
    // Split on unescaped pipes only — bailout/init cells carry `\|`.
    const cells = line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());
    if (cells.length < 14 || cells[0] === '名称') continue;
    if (cells[3] !== 'T0' && cells[3] !== 'T1' && cells[3] !== 'T2') continue;
    if (WAIVERS.has(cells[0])) continue;
    rows.push({
      name: cells[0], eflags: cells[5], source: cells[6],
      header: cells[9], init: cells[10], loop: cells[11],
      bailout: cells[12], sha: cells[13],
    });
  }
  // Deterministic sample: every 9th row, plus every E3/E10-flagged row.
  // FRM_SMOKE_FULL=1 (Level 2, maintainer-local): every ledger row, with
  // name-not-found/missing-source rows reconstructed from the ledger's
  // sha256-anchored normalized cells (verified, never guessed).
  const picked = full
    ? rows
    : rows.filter((r, i) => i % 9 === 0 || /E3|E10/.test(r.eflags));
  const cases: SmokeCase[] = [];
  const dropped: string[] = [];
  const scanCache = new Map<string, string>();
  const unescapeHtml = (s: string) =>
    s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const unescCell = (s: string) => unescapeHtml(s.replace(/\\\|/g, '|'));
  /** sha256-verified reconstruction of an anchor-only entry (full mode). */
  const anchorText = (row: Row): string | null => {
    const s = [row.header, row.init, row.loop, row.bailout].map(unescCell).join('\n');
    if (createHash('sha256').update(s, 'utf-8').digest('hex') !== row.sha) return null;
    const loop = unescCell(row.loop)
      .split(';')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => `  ${x}`)
      .join('\n');
    const header = unescCell(row.header);
    return `${row.name}${header ? ` ${header}` : ''} {\n  ${unescCell(row.init)}:\n${loop}\n  ${unescCell(row.bailout)}\n}`;
  };
  for (const row of picked) {
    const rel = row.source.toLowerCase();
    const base = basename(rel);
    const path =
      bySuffix.get(rel) ?? bySuffix.get(`fractint/formulas/${base}`) ?? byBase.get(base);
    if (!path) {
      // No corpus file — full mode falls back to the verified anchor.
      if (full) {
        const text = anchorText(row);
        if (text) cases.push({ name: `corpus-${row.name}`, source: text, key: row.name });
        else dropped.push(`${row.name}: source missing AND anchor sha mismatch`);
      }
      continue;
    }
    if (!scanCache.has(path)) scanCache.set(path, readFileSync(path, 'latin1'));
    const fileText = scanCache.get(path)!;
    const bare = row.name.replace(/\[.*\]/, '');
    if (full && !scanFrmEntries(fileText).entries.some(
      (e) => e.key.toLowerCase() === bare.toLowerCase() ||
        e.key.toLowerCase().startsWith(`${bare.toLowerCase()}#`),
    )) {
      // File exists but the entry does not (float-variant rewrites) —
      // fall back to the verified anchor reconstruction.
      const text = anchorText(row);
      if (text) cases.push({ name: `corpus-${row.name}`, source: text, key: row.name });
      else dropped.push(`${row.name}: entry not in ${base} AND anchor sha mismatch`);
      continue;
    }
    // Carry the full file text + the scanner key; the production scanner
    // resolves the entry (handles symmetry parens, bracket options, prose).
    cases.push({ name: `corpus-${row.name}`, source: fileText, key: bare });
  }
  return { cases, dropped };
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
  const corpus = corpusCases();
  const cases = [...AUTHORED_CASES, ...corpus.cases];
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
  const full = process.env.FRM_SMOKE_FULL === '1';
  // All coverage gates run BEFORE the payload is written — a failing full
  // run must never leave a partial full:true payload on disk (Codex 7d r3).
  console.log(`payload rows: ${rows.length} (authored ${AUTHORED_CASES.length}); skipped: ${skipped.length}; dropped-ledger-rows: ${corpus.dropped.length}`);
  for (const s of skipped.slice(0, 12)) console.log(`  skip ${s}`);
  for (const d of corpus.dropped) console.log(`  DROP ${d}`);
  // Full mode must account for every ledger row: a dropped row is a hard
  // failure, not a silent gap in coverage.
  if (corpus.dropped.length > 0) {
    console.error(`FRM_SMOKE_FULL: ${corpus.dropped.length} ledger row(s) unaccounted for`);
    process.exit(1);
  }
  // Corpus-row skips in full mode are fatal too — except the two documented
  // T2 compile waivers (carr2289: system-var write + asin; mandelbrotbc3:
  // read-only e — both also fail v1; evidence in the Slice-6 archive).
  if (full) {
    const T2_COMPILE_WAIVERS = new Set(['corpus-carr2289', 'corpus-mandelbrotbc3']);
    const unexpected = skipped.filter(
      (s) => s.startsWith('corpus-') && !T2_COMPILE_WAIVERS.has(s.split(':')[0]),
    );
    if (unexpected.length > 0) {
      console.error(`FRM_SMOKE_FULL: ${unexpected.length} corpus row(s) skipped without a documented waiver:`);
      for (const u of unexpected) console.error(`  ${u}`);
      process.exit(1);
    }
  }
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
  mkdirSync(join(OUT, '..'), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    pixels: PIXELS,
    maxIter: MAX_ITER,
    full: full || undefined,
    rows,
  }, null, 1));
  console.log(`out: ${OUT}`);
}

main();
