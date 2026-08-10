/**
 * FRM compatibility harness (v0.4.18 Slice 0).
 *
 * Calls the production compiler API (`compileFrmDetailed`) only — a harness
 * that re-implements scanning, parsing, or numeric semantics would invalidate
 * its own evidence (docs/specs/frm-compatibility-v1.md §1).
 *
 * The private corpus is injected via the FRACTALPARK_FRM_CORPUS_DIR env var
 * (maintainer-local Level 2 path). Without it the harness still runs the
 * project-owned clean-room examples and the B94 native controls, which is
 * the Level 1 shape. Corpus text and local paths are never written into the
 * report: sources are identified by content hash only.
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

import { compileFrmDetailed } from '../src/engine/frm/compile';
import { CUSTOM_FORMULA_EXAMPLES } from '../src/engine/frm/example-library';
import { pluginRegistry } from '../src/engine/plugins/registry';
import { registerBuiltins } from '../src/engine/plugins/builtins';

const REPORT_VERSION = 'frm-compat-report/v1';
const SELECTOR_VERSION = 'sentinel-v1';
const COVERAGE_COUNT = 24;
const STRESS_COUNT = 6;
const B94_CONTROL_IDS = ['mandelbrot', 'quadJulia', 'burningShip', 'newton3'] as const;

interface SourceItem {
  sourceId: string; // sha256(source)[:16] — opaque, never a file name
  byteLength: number;
  source: string;
}

interface CompileEvidence {
  sourceId: string;
  byteLength: number;
  sentinel: 'coverage' | 'predicted-stress' | 'clean-room' | 'b94-control';
  success: boolean;
  errorCount: number;
  warningCount: number;
  durationMs: number;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function collectCorpus(dir: string): SourceItem[] {
  const items: SourceItem[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name.toLowerCase().endsWith('.frm')) {
        const source = readFileSync(full, 'utf8');
        items.push({ sourceId: sha256(source).slice(0, 16), byteLength: Buffer.byteLength(source), source });
      }
    }
  };
  walk(dir);
  return items;
}

function selectSentinels(items: SourceItem[]): { coverage: SourceItem[]; stress: SourceItem[] } {
  // Deterministic: coverage by content-hash order, predicted stress by byte
  // length. This is a prediction set, not a measured slowest set.
  const byHash = [...items].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  const coverage = byHash.slice(0, COVERAGE_COUNT);
  const coverageIds = new Set(coverage.map((item) => item.sourceId));
  const stress = [...items]
    .filter((item) => !coverageIds.has(item.sourceId))
    .sort((a, b) => b.byteLength - a.byteLength)
    .slice(0, STRESS_COUNT);
  return { coverage, stress };
}

function compileOne(item: SourceItem, sentinel: CompileEvidence['sentinel']): CompileEvidence {
  const started = performance.now();
  const result = compileFrmDetailed(item.source, `harness-${item.sourceId}`);
  return {
    sourceId: item.sourceId,
    byteLength: item.byteLength,
    sentinel,
    success: result.success,
    errorCount: result.errors.length + result.lexerErrors.length + result.parseErrors.length,
    warningCount: result.warnings.length,
    durationMs: Math.round(performance.now() - started),
  };
}

function runB94Controls(): CompileEvidence[] {
  return B94_CONTROL_IDS.map((id) => {
    const started = performance.now();
    const plugin = pluginRegistry.getFormula(id);
    const ok = Boolean(plugin && plugin.glsl && plugin.glsl.length > 0);
    return {
      sourceId: `b94-${id}`,
      byteLength: plugin?.glsl?.length ?? 0,
      sentinel: 'b94-control' as const,
      success: ok,
      errorCount: ok ? 0 : 1,
      warningCount: 0,
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

  // Clean-room examples (project-owned, always available — Level 1 shape).
  for (const example of CUSTOM_FORMULA_EXAMPLES) {
    const item: SourceItem = {
      sourceId: sha256(example.source).slice(0, 16),
      byteLength: Buffer.byteLength(example.source),
      source: example.source,
    };
    evidences.push(compileOne(item, 'clean-room'));
  }

  // B94 native controls.
  evidences.push(...runB94Controls());

  let corpusSnapshotHash: string | null = null;
  let corpusFileCount = 0;
  if (corpusDir) {
    const corpus = collectCorpus(corpusDir);
    corpusFileCount = corpus.length;
    corpusSnapshotHash = sha256(
      corpus.map((item) => item.sourceId).sort().join('\n'),
    );
    const { coverage, stress } = selectSentinels(corpus);
    for (const item of coverage) evidences.push(compileOne(item, 'coverage'));
    for (const item of stress) evidences.push(compileOne(item, 'predicted-stress'));
  }

  const failed = evidences.filter((e) => !e.success);
  const summary = {
    total: evidences.length,
    succeeded: evidences.length - failed.length,
    failed: failed.length,
    bySentinel: {
      cleanRoom: evidences.filter((e) => e.sentinel === 'clean-room').length,
      b94Control: evidences.filter((e) => e.sentinel === 'b94-control').length,
      coverage: evidences.filter((e) => e.sentinel === 'coverage').length,
      predictedStress: evidences.filter((e) => e.sentinel === 'predicted-stress').length,
    },
    maxDurationMs: Math.max(...evidences.map((e) => e.durationMs)),
    totalDurationMs: Math.round(performance.now() - startedAll),
  };

  const report = {
    reportVersion: REPORT_VERSION,
    selectorVersion: SELECTOR_VERSION,
    compilerCommit,
    generatedAt: new Date().toISOString(),
    environment: `${process.platform}/${process.arch} node-${process.version}`,
    corpus: corpusDir
      ? { injected: true, fileCount: corpusFileCount, snapshotHash: corpusSnapshotHash }
      : { injected: false },
    summary,
    failures: failed.map((e) => ({ sourceId: e.sourceId, sentinel: e.sentinel, errorCount: e.errorCount })),
    evidences,
  };

  const contentHash = sha256(JSON.stringify(report));
  process.stdout.write(JSON.stringify({ ...report, contentHash }, null, 2) + '\n');
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main();
