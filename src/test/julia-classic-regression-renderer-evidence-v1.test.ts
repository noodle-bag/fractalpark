import { describe, expect, it } from "vitest";

import evidenceAsset from "../../resources/formula-library/v1/julia-classic-regression-renderer-evidence.v1.json";
import {
  JULIA_CLASSIC_REGRESSION_RENDERER_REPORT_SCHEMA_V1,
  juliaClassicRegressionRendererEvidenceContentHashV1,
  juliaClassicRegressionRendererEvidenceRowReceiptV1,
  parseJuliaClassicRegressionRendererEvidenceV1,
  parseJuliaClassicRegressionRendererReportV1,
  type JuliaClassicRegressionRendererEvidenceV1,
} from "../engine/formulas/v1/julia-classic-regression-renderer-closure-v1";

type MutableRecord = Record<string, unknown>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function evidence(): MutableRecord {
  return clone(evidenceAsset) as MutableRecord;
}

function reportFromEvidence(): MutableRecord {
  const source = evidence();
  const rows = (source.rows as MutableRecord[]).map((row) => {
    const reportRow = { ...row };
    delete reportRow.minimumImageDifferingPixels;
    delete reportRow.receipt;
    delete reportRow.relativeTolerance;
    return reportRow;
  });
  return {
    schema: JULIA_CLASSIC_REGRESSION_RENDERER_REPORT_SCHEMA_V1,
    ok: true,
    start: 0,
    rowCount: 7,
    fullAuthorityRowCount: 7,
    fullGate: true,
    chunkSize: 7,
    renderer: source.renderer,
    durationMs: source.durationMs,
    candidateManifestContentHash: source.correctiveContentHash,
    waveId: source.correctiveContentHash,
    preGpuContentHash: source.correctiveContentHash,
    executionSourceBindingsContentHash:
      source.executionSourceBindingsContentHash,
    workerBundleSha256: source.workerBundleSha256,
    runtimeDependencyBindings: source.runtimeDependencyBindings,
    idsSha256: source.idsSha256,
    statusCounts: source.statusCounts,
    rows,
  };
}

function rehashEvidence(value: MutableRecord): void {
  const body = { ...value };
  delete body.contentHash;
  value.contentHash = juliaClassicRegressionRendererEvidenceContentHashV1(
    body as unknown as Omit<
      JuliaClassicRegressionRendererEvidenceV1,
      "contentHash"
    >,
  );
}

function rehashEvidenceRow(value: MutableRecord, index = 0): void {
  const row = (value.rows as MutableRecord[])[index];
  if (!row) throw new Error("test-row-missing");
  const body = { ...row };
  delete body.receipt;
  row.receipt = juliaClassicRegressionRendererEvidenceRowReceiptV1(
    body as unknown as Parameters<
      typeof juliaClassicRegressionRendererEvidenceRowReceiptV1
    >[0],
  );
  rehashEvidence(value);
}

function expectReportRejected(edit: (value: MutableRecord) => void): void {
  const value = reportFromEvidence();
  edit(value);
  expect(parseJuliaClassicRegressionRendererReportV1(value).ok).toBe(false);
}

function expectEvidenceRejected(
  edit: (value: MutableRecord) => void,
  options: { readonly rehashRow?: boolean; readonly rehashAsset?: boolean } = {},
): void {
  const value = evidence();
  edit(value);
  if (options.rehashRow) rehashEvidenceRow(value);
  else if (options.rehashAsset) rehashEvidence(value);
  expect(parseJuliaClassicRegressionRendererEvidenceV1(value).ok).toBe(false);
}

describe("Julia classic regression renderer closure v1", () => {
  it("accepts and deeply freezes the exact-seven report and public evidence", () => {
    const report = parseJuliaClassicRegressionRendererReportV1(
      reportFromEvidence(),
    );
    const publicEvidence = parseJuliaClassicRegressionRendererEvidenceV1(
      evidence(),
    );
    expect(report.ok).toBe(true);
    expect(publicEvidence.ok).toBe(true);
    if (!report.ok || !publicEvidence.ok) return;
    expect(report.value.rows).toHaveLength(7);
    expect(Object.isFrozen(report.value)).toBe(true);
    expect(Object.isFrozen(report.value.rows)).toBe(true);
    expect(Object.isFrozen(report.value.rows[0]?.binding)).toBe(true);
    expect(Object.isFrozen(publicEvidence.value)).toBe(true);
    expect(Object.isFrozen(publicEvidence.value.sourceBindings)).toBe(true);
    expect(Object.isFrozen(publicEvidence.value.profileContract.points)).toBe(true);
  });

  it("rejects added, dropped, reordered, or duplicated authority rows", () => {
    expectReportRejected((value) => {
      (value.rows as unknown[]).pop();
    });
    expectReportRejected((value) => {
      (value.rows as unknown[]).push(clone((value.rows as unknown[])[0]));
    });
    expectReportRejected((value) => {
      const rows = value.rows as unknown[];
      [rows[0], rows[1]] = [rows[1], rows[0]];
    });
    expectReportRejected((value) => {
      const rows = value.rows as unknown[];
      rows[1] = clone(rows[0]);
    });
  });

  it("rejects candidate, semantic, binding, support-lane, and profile substitution", () => {
    for (const edit of [
      (row: MutableRecord) => {
        row.candidateContentHash = "invalid";
      },
      (row: MutableRecord) => {
        row.evaluatedSemanticHash = "invalid";
      },
      (row: MutableRecord) => {
        (row.binding as MutableRecord).sourceRevision = "0".repeat(64);
      },
      (row: MutableRecord) => {
        row.bindingRevision = "invalid";
      },
      (row: MutableRecord) => {
        row.supportLane = "legacy-source-split";
      },
      (row: MutableRecord) => {
        row.profileDigest = "invalid";
      },
    ])
      expectReportRejected((value) => edit((value.rows as MutableRecord[])[0]!));
  });

  it("rejects renderer, worker, runtime, ids, and corrective authority drift", () => {
    for (const edit of [
      (value: MutableRecord) => {
        value.renderer = "hardware";
      },
      (value: MutableRecord) => {
        value.workerBundleSha256 = "invalid";
      },
      (value: MutableRecord) => {
        value.idsSha256 = "0".repeat(64);
      },
      (value: MutableRecord) => {
        value.waveId = "0".repeat(64);
      },
      (value: MutableRecord) => {
        (value.runtimeDependencyBindings as MutableRecord).playwright =
          "invalid";
      },
      (value: MutableRecord) => {
        (value.runtimeDependencyBindings as MutableRecord).extra =
          "0".repeat(64);
      },
    ])
      expectReportRejected(edit);
  });

  it("rejects status, reason, gate, and count arithmetic drift", () => {
    for (const edit of [
      (value: MutableRecord) => {
        value.fullGate = false;
      },
      (value: MutableRecord) => {
        value.rowCount = 6;
      },
      (value: MutableRecord) => {
        (value.statusCounts as MutableRecord).passed = 6;
      },
      (value: MutableRecord) => {
        (value.rows as MutableRecord[])[0]!.status = "blocked";
      },
      (value: MutableRecord) => {
        (value.rows as MutableRecord[])[0]!.reasonCode = "forged";
      },
    ])
      expectReportRejected(edit);
  });

  it("rejects trace and image contract drift, zero signal, excess error, and non-finite values", () => {
    for (const edit of [
      (row: MutableRecord) => {
        row.traceOrbitSteps = 127;
      },
      (row: MutableRecord) => {
        row.traceStateDimensions = 17;
      },
      (row: MutableRecord) => {
        row.traceStateComparisons = 2299;
      },
      (row: MutableRecord) => {
        row.traceFlagComparisons = 2299;
      },
      (row: MutableRecord) => {
        row.imagePixelComparisons = 95;
      },
      (row: MutableRecord) => {
        row.observedImageDifferingPixels = 0;
      },
      (row: MutableRecord) => {
        row.observedImageDifferingPixels = 49;
      },
      (row: MutableRecord) => {
        row.observedMaximumRelativeError = 0.006;
      },
      (row: MutableRecord) => {
        row.observedMaximumRelativeError = Number.POSITIVE_INFINITY;
      },
    ])
      expectReportRejected((value) => edit((value.rows as MutableRecord[])[0]!));
  });

  it("rejects deterministic and full-framework witness substitution", () => {
    expectReportRejected((value) => {
      (value.rows as MutableRecord[])[0]!.deterministicDoubleDraw = false;
    });
    expectReportRejected((value) => {
      (value.rows as MutableRecord[])[0]!.fullFrameworkCompileLink = false;
    });
    expectReportRejected((value) => {
      (value.rows as MutableRecord[])[0]!.fullFrameworkCappedDraw = false;
    });
    expectReportRejected((value) => {
      (value.rows as MutableRecord[])[1]!.fullFrameworkCappedDraw = true;
    });
  });

  it("rejects stale public row receipts and public content hashes", () => {
    expectEvidenceRejected((value) => {
      (value.rows as MutableRecord[])[0]!.receipt = "0".repeat(64);
    }, { rehashAsset: true });
    expectEvidenceRejected((value) => {
      value.contentHash = "0".repeat(64);
    });
    expectEvidenceRejected((value) => {
      (value.rows as MutableRecord[])[0]!.profileDigest = "0".repeat(64);
    }, { rehashAsset: true });
  });

  it("rejects public authority, activation, report, worker, runtime, and source-binding drift", () => {
    for (const edit of [
      (value: MutableRecord) => {
        value.authority = "activation";
      },
      (value: MutableRecord) => {
        value.activationStatus = true;
      },
      (value: MutableRecord) => {
        value.privateReportWholeSha256 = "invalid";
      },
      (value: MutableRecord) => {
        value.workerBundleSha256 = "invalid";
      },
      (value: MutableRecord) => {
        (value.runtimeDependencyBindings as MutableRecord).playwright =
          "invalid";
      },
      (value: MutableRecord) => {
        const key = Object.keys(value.sourceBindings as MutableRecord)[0]!;
        (value.sourceBindings as MutableRecord)[key] = "invalid";
      },
    ])
      expectEvidenceRejected(edit, { rehashAsset: true });
  });

  it("rejects public profile, trace, image, status, and observation drift even after rehashing", () => {
    expectEvidenceRejected((value) => {
      (value.profileContract as MutableRecord).maximumDepth = 127;
    }, { rehashAsset: true });
    expectEvidenceRejected((value) => {
      (value.traceContract as MutableRecord).stateComparisons = 1;
    }, { rehashAsset: true });
    expectEvidenceRejected((value) => {
      (value.imageContract as MutableRecord).relativeTolerance = 0.006;
    }, { rehashAsset: true });
    expectEvidenceRejected((value) => {
      (value.statusCounts as MutableRecord).passed = 6;
    }, { rehashAsset: true });
    expectEvidenceRejected((value) => {
      (value.rows as MutableRecord[])[0]!.observedImageDifferingPixels = 0;
    }, { rehashRow: true });
    expectEvidenceRejected((value) => {
      (value.rows as MutableRecord[])[0]!.observedMaximumRelativeError = 0.006;
    }, { rehashRow: true });
  });
});
