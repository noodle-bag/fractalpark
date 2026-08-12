/**
 * FRM Level-2 compatibility report (v0.4.18 Slice 7d).
 *
 * Schema + verifier for the frozen 588/117 evidence report. The report is
 * GENERATED maintainer-side (private corpus, private fixtures); this module
 * is the public contract: any consumer (CI, release audit, v0.4.19) can
 * verify a report's integrity without the corpus — schema shape, version
 * fields, aggregate consistency, and the content hash.
 *
 * The hash covers the canonical (sorted-key, code-unit order) JSON of
 * everything except the `contentHash` field itself. It is an INTEGRITY
 * check against accidental alteration, not authentication: consumers that
 * need tamper-evidence must pin the expected digest externally (the
 * execution ledger records it per release candidate). Corpus text and
 * local paths are never part of the report (opaque source ids only).
 */

import { createHash } from 'node:crypto';

export const FRM_COMPAT_REPORT_SCHEMA = 'frm-compat-report/v2' as const;

export interface CompatReportLayer {
  /** Entries evaluated in this layer. */
  evaluated: number;
  /** Entries that passed the layer's bar. */
  passed: number;
  /** Stable per-reason aggregates (e.g. reject reasons, off-by-one counts). */
  reasonBreakdown: Record<string, number>;
}

export interface CompatReport {
  schema: typeof FRM_COMPAT_REPORT_SCHEMA;
  reportVersion: string;
  /** Compiler commit the evidence was produced on (full sha). */
  compilerCommit: string;
  /** sha256 over the sorted per-file content hashes of the corpus snapshot. */
  corpusSnapshotHash: string;
  selectorVersion: string;
  environment: {
    node: string;
    platform: string;
    device: string;
  };
  generatedAt: string;
  durationMs: number;
  layers: {
    files: CompatReportLayer;
    syntax: CompatReportLayer;
    semantics: CompatReportLayer;
    orbits: CompatReportLayer;
    webgl: CompatReportLayer;
  };
  totals: {
    target: number;
    excluded: number;
    waivers: number;
  };
  /** sha256 of the canonical report payload (see computeContentHash). */
  contentHash: string;
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      // Code-unit order — locale-independent canonical form (NOT
      // localeCompare, which varies by runtime).
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/** sha256 over the canonical report minus its contentHash field. */
export function computeContentHash(report: Omit<CompatReport, 'contentHash'>): string {
  return createHash('sha256').update(canonicalize(report), 'utf-8').digest('hex');
}

export interface CompatReportVerification {
  ok: boolean;
  errors: string[];
}

/** Structural + integrity verification. Never throws on malformed input. */
export function verifyCompatReport(raw: unknown): CompatReportVerification {
  const errors: string[] = [];
  const r = raw as Partial<CompatReport> | null;
  if (!r || typeof r !== 'object') {
    return { ok: false, errors: ['report is not an object'] };
  }
  // Frozen schema: unexpected top-level fields are rejected (an extension
  // must bump the schema tag, not smuggle fields into v2).
  const ALLOWED_KEYS = new Set([
    'schema', 'reportVersion', 'compilerCommit', 'corpusSnapshotHash',
    'selectorVersion', 'environment', 'generatedAt', 'durationMs',
    'layers', 'totals', 'contentHash',
  ]);
  for (const key of Object.keys(r)) {
    if (!ALLOWED_KEYS.has(key)) errors.push(`unexpected top-level field: ${key}`);
  }
  if (r.schema !== FRM_COMPAT_REPORT_SCHEMA) {
    errors.push(`schema must be ${FRM_COMPAT_REPORT_SCHEMA}`);
  }
  if (typeof r.reportVersion !== 'string' || r.reportVersion.length === 0) {
    errors.push('reportVersion missing');
  }
  if (typeof r.compilerCommit !== 'string' || !/^[0-9a-f]{40}$/.test(r.compilerCommit)) {
    errors.push('compilerCommit must be a full sha');
  }
  if (typeof r.corpusSnapshotHash !== 'string' || !/^[0-9a-f]{64}$/.test(r.corpusSnapshotHash)) {
    errors.push('corpusSnapshotHash must be a sha256 hex');
  }
  if (typeof r.selectorVersion !== 'string' || r.selectorVersion.length === 0) {
    errors.push('selectorVersion missing');
  }
  const env = r.environment;
  if (
    !env ||
    typeof env !== 'object' ||
    typeof env.node !== 'string' || env.node.length === 0 ||
    typeof env.platform !== 'string' || env.platform.length === 0 ||
    typeof env.device !== 'string' || env.device.length === 0
  ) {
    errors.push('environment must carry non-empty node/platform/device');
  }
  if (typeof r.generatedAt !== 'string' || Number.isNaN(Date.parse(r.generatedAt))) {
    errors.push('generatedAt must be a parseable timestamp');
  }
  if (typeof r.durationMs !== 'number' || !Number.isFinite(r.durationMs) || r.durationMs < 0) {
    errors.push('durationMs must be a finite non-negative number');
  }
  const isCount = (n: unknown): n is number =>
    typeof n === 'number' && Number.isInteger(n) && n >= 0;
  const checkBreakdown = (b: unknown, label: string) => {
    if (!b || typeof b !== 'object' || Array.isArray(b)) {
      errors.push(`${label} reasonBreakdown must be an object`);
      return;
    }
    for (const [k, v] of Object.entries(b as Record<string, unknown>)) {
      if (!isCount(v)) errors.push(`${label} reasonBreakdown.${k} must be a non-negative integer`);
    }
  };
  const layers = r.layers;
  if (!layers || typeof layers !== 'object') {
    errors.push('layers missing');
  } else {
    for (const key of ['files', 'syntax', 'semantics', 'orbits', 'webgl'] as const) {
      const layer = layers[key];
      if (!layer || !isCount(layer.evaluated) || !isCount(layer.passed)) {
        errors.push(`layer ${key} missing non-negative-integer evaluated/passed`);
        continue;
      }
      if (layer.passed > layer.evaluated) {
        errors.push(`layer ${key} passed > evaluated`);
      }
      checkBreakdown(layer.reasonBreakdown, key);
    }
    if (
      isCount(layers.files?.evaluated) &&
      isCount(layers.syntax?.evaluated) &&
      r.totals &&
      isCount(r.totals.target) &&
      layers.files.evaluated !== r.totals.target
    ) {
      errors.push('files.evaluated must equal totals.target');
    }
  }
  const totals = r.totals;
  if (
    !totals ||
    !isCount(totals.target) ||
    !isCount(totals.excluded) ||
    !isCount(totals.waivers)
  ) {
    errors.push('totals must carry non-negative-integer target/excluded/waivers');
  } else if (
    layers?.syntax &&
    isCount(layers.syntax.evaluated) &&
    isCount(layers.syntax.passed)
  ) {
    if (layers.syntax.evaluated !== totals.target) {
      errors.push('syntax.evaluated must equal totals.target (the report covers the target set)');
    }
    if (layers.syntax.passed + totals.waivers !== totals.target) {
      errors.push('syntax.passed + totals.waivers must equal totals.target');
    }
  }
  if (typeof r.contentHash !== 'string' || !/^[0-9a-f]{64}$/.test(r.contentHash)) {
    errors.push('contentHash must be a sha256 hex');
  } else {
    const { contentHash: _omit, ...payload } = r as CompatReport;
    const expected = computeContentHash(payload as Omit<CompatReport, 'contentHash'>);
    if (expected !== r.contentHash) {
      errors.push('contentHash mismatch (payload tampered or schema drift)');
    }
  }
  return { ok: errors.length === 0, errors };
}
