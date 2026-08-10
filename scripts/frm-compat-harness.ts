/**
 * FRM compatibility harness (v0.4.18 Slice 0).
 *
 * Calls the production compiler API (`compileFrmDetailed`) only — a harness
 * that re-implements scanning, parsing, or numeric semantics would invalidate
 * its own evidence (docs/specs/frm-compatibility-v1.md §1).
 *
 * The private corpus is injected via the FRACTALPARK_FRM_CORPUS_DIR env var
 * (maintainer-local Level 2 path). Without it the harness still runs the
 * project-owned clean-room examples and the B94 native registry controls,
 * which is the Level 1 shape. Corpus text and local paths are never written
 * into the report: sources are identified by content hash only.
 *
 * Report fields follow the Level 2 evidence rule: schema/report versions,
 * compiler commit, corpus snapshot hash, selector version, environment,
 * aggregate results, and durations — plus a content hash. Per-entry detail
 * is limited to an opaque id, its sentinel class, and compile duration;
 * pass/fail counts exist only as aggregates. B94 controls are reported as
 * registry-integrity evidence in their own section and never as compile
 * evidence (native builtins do not flow through the FRM compiler).
 *
 * Slice 0 scope: file-level compile evidence for the deterministic sentinel
 * v1 set (24 coverage + 6 predicted stress) plus project-owned controls.
 * Entry-level scanning lands with the authoritative scanner slice; actual
 * stress v2 freezes only after the first full-corpus measured run.
 *
 * Usage:
 *   node --import tsx scripts/frm-compat-harness.ts
 *   FRACTALPARK_FRM_CORPUS_DIR=/path/to/corpus node --import tsx scripts/frm-compat-harness.ts
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

import { compileFrmDetailed, compileClassicFrmEntry } from '../src/engine/frm/compile';
import { scanFrmEntries } from '../src/engine/frm/scanner';
import { CUSTOM_FORMULA_EXAMPLES } from '../src/engine/frm/example-library';
import { pluginRegistry } from '../src/engine/plugins/registry';
import { registerBuiltins } from '../src/engine/plugins/builtins';

const REPORT_VERSION = 'frm-compat-report/v1';
const SELECTOR_VERSION = 'sentinel-v1';
const COVERAGE_COUNT = 24;
const STRESS_COUNT = 6;
const B94_CONTROL_IDS = ['mandelbrot', 'quadJulia', 'burningShip', 'newton3'] as const;

interface SourceItem {
  contentHash: string; // full sha256 — used for selection/membership
  byteLength: number;  // internal only, never serialized
  source: string;
}

interface CompileEvidence {
  sourceId: string; // contentHash.slice(0, 16) — opaque report identifier
  sentinel: 'coverage' | 'predicted-stress' | 'clean-room';
  durationMs: number;
}

interface RegistryControlEvidence {
  controlId: string; // builtin formula id, project-owned
  registered: boolean;
  glslPresent: boolean;
  durationMs: number;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function collectCorpus(dir: string): SourceItem[] {
  const items: SourceItem[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name.toLowerCase().endsWith('.frm')) {
        const source = readFileSync(full, 'utf8');
        items.push({
          contentHash: sha256(source),
          byteLength: Buffer.byteLength(source),
          source,
        });
      }
    }
  };
  walk(dir);
  return items;
}

function selectSentinels(items: SourceItem[]): { coverage: SourceItem[]; stress: SourceItem[] } {
  // Deterministic: coverage by content-hash order; predicted stress by byte
  // length with a content-hash tie-breaker. This is a prediction set, not a
  // measured slowest set.
  const byHash = [...items].sort((a, b) => a.contentHash.localeCompare(b.contentHash));
  const coverage = byHash.slice(0, COVERAGE_COUNT);
  const coverageHashes = new Set(coverage.map((item) => item.contentHash));
  const stress = [...items]
    .filter((item) => !coverageHashes.has(item.contentHash))
    .sort((a, b) => b.byteLength - a.byteLength || a.contentHash.localeCompare(b.contentHash))
    .slice(0, STRESS_COUNT);
  return { coverage, stress };
}

function compileOne(item: SourceItem, sentinel: CompileEvidence['sentinel']): {
  evidence: CompileEvidence;
  success: boolean;
} {
  const started = performance.now();
  // Classic mode (FRACTALPARK_FRM_CLASSIC=1): scan and compile the FIRST
  // entry through the classic frontend — the production selected-entry path.
  // Multi-entry sources are never silently first-entry compiled here; the
  // first entry's stable key is selected explicitly.
  const result = process.env.FRACTALPARK_FRM_CLASSIC === '1'
    ? (() => {
        const scan = scanFrmEntries(item.source);
        const firstKey = scan.entries[0]?.key;
        return compileClassicFrmEntry(item.source, firstKey, `harness-${item.contentHash.slice(0, 16)}`);
      })()
    : compileFrmDetailed(item.source, `harness-${item.contentHash.slice(0, 16)}`);
  return {
    evidence: {
      sourceId: item.contentHash.slice(0, 16),
      sentinel,
      durationMs: Math.round(performance.now() - started),
    },
    success: result.success,
  };
}

function runB94RegistryControls(): RegistryControlEvidence[] {
  return B94_CONTROL_IDS.map((id) => {
    const started = performance.now();
    const plugin = pluginRegistry.getFormula(id);
    return {
      controlId: id,
      registered: Boolean(plugin),
      glslPresent: Boolean(plugin && plugin.glsl && plugin.glsl.length > 0),
      durationMs: Math.round(performance.now() - started),
    };
  });
}

function main() {
  const startedAll = performance.now();
  const compilerCommit = execSync('git rev-parse HEAD').toString().trim();
  const corpusDir = process.env.FRACTALPARK_FRM_CORPUS_DIR;
  registerBuiltins({ quiet: true });

  const evidences: CompileEvidence[] = [];
  const aggregate = {
    cleanRoom: { total: 0, failed: 0 },
    coverage: { total: 0, failed: 0 },
    predictedStress: { total: 0, failed: 0 },
  };

  const record = (item: SourceItem, sentinel: CompileEvidence['sentinel'], bucket: { total: number; failed: number }) => {
    const { evidence, success } = compileOne(item, sentinel);
    evidences.push(evidence);
    bucket.total += 1;
    if (!success) bucket.failed += 1;
  };

  // Clean-room examples (project-owned, always available — Level 1 shape).
  for (const example of CUSTOM_FORMULA_EXAMPLES) {
    record(
      {
        contentHash: sha256(example.source),
        byteLength: Buffer.byteLength(example.source),
        source: example.source,
      },
      'clean-room',
      aggregate.cleanRoom,
    );
  }

  // Private corpus sentinels (Level 2 shape).
  let corpusSnapshotHash: string | null = null;
  let corpusFileCount = 0;
  if (corpusDir) {
    const corpus = collectCorpus(corpusDir);
    corpusFileCount = corpus.length;
    corpusSnapshotHash = sha256(corpus.map((item) => item.contentHash).sort().join('\n'));
    const { coverage, stress } = selectSentinels(corpus);
    for (const item of coverage) record(item, 'coverage', aggregate.coverage);
    for (const item of stress) record(item, 'predicted-stress', aggregate.predictedStress);
  }

  // B94 native registry controls — registry-integrity evidence, NOT compile
  // evidence: native builtins do not flow through the FRM compiler.
  const b94RegistryControls = runB94RegistryControls();
  const b94Failed = b94RegistryControls.filter((c) => !c.registered || !c.glslPresent);

  const compileFailedTotal = aggregate.cleanRoom.failed + aggregate.coverage.failed + aggregate.predictedStress.failed;

  const report = {
    reportVersion: REPORT_VERSION,
    selectorVersion: SELECTOR_VERSION,
    compilerCommit,
    generatedAt: new Date().toISOString(),
    environment: `${process.platform}/${process.arch} node-${process.version}`,
    corpus: corpusDir
      ? { injected: true, fileCount: corpusFileCount, snapshotHash: corpusSnapshotHash }
      : { injected: false },
    summary: {
      compileEvidence: {
        total: evidences.length,
        failed: compileFailedTotal,
        bySentinel: aggregate,
      },
      b94RegistryControls: { total: b94RegistryControls.length, failed: b94Failed.length },
      maxDurationMs: evidences.length > 0 ? Math.max(...evidences.map((e) => e.durationMs)) : 0,
      totalDurationMs: Math.round(performance.now() - startedAll),
    },
    evidences,
    b94RegistryControls,
  };

  const contentHash = sha256(JSON.stringify(report));
  process.stdout.write(JSON.stringify({ ...report, contentHash }, null, 2) + '\n');
  if (compileFailedTotal > 0 || b94Failed.length > 0) {
    process.exitCode = 1;
  }
}

main();
