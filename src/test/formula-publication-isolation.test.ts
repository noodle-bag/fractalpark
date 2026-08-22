import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import contractAsset from "../../resources/formula-library/v1/publication-isolation.v1.json";
import decisionsAsset from "../../resources/formula-library/v1/publication-decisions.json";
import runtimeIndexAsset from "../../public/formula-library/v1/runtime/published/index.json";
import runtimeManifestAsset from "../../public/formula-library/v1/runtime/published/manifest.json";
import previewManifestAsset from "../../public/formula-library/v1/previews/manifest.json";
import {
  scanLeakageSurfacesV1,
  verifyPublicationIsolationDataV1,
  type IsolationContract,
  type PublicationIsolationDataV1,
} from "../../scripts/verify-formula-publication-isolation";
import { buildFormulaRecordV1 } from "@/lib/formula-records";
import type { FormulaIdV1 } from "@/engine/formulas/v1";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function data(): PublicationIsolationDataV1 {
  const decisions = structuredClone(decisionsAsset) as unknown as Record<
    string,
    unknown
  >;
  const rows = decisions.rows as readonly { formulaId: string }[];
  const records = rows.map((row) => {
    const record = buildFormulaRecordV1(row.formulaId as FormulaIdV1, "en");
    if (!record) throw new Error("missing-record-fixture");
    return structuredClone(record) as unknown as Record<string, unknown>;
  });
  return {
    decisions,
    runtimeIndex: structuredClone(runtimeIndexAsset) as unknown as Record<
      string,
      unknown
    >,
    runtimeManifest: structuredClone(runtimeManifestAsset) as unknown as Record<
      string,
      unknown
    >,
    previewManifest: structuredClone(
      previewManifestAsset,
    ) as unknown as Record<string, unknown>,
    records,
  };
}

const contract = contractAsset as unknown as IsolationContract;

describe("formula publication isolation v1", () => {
  it("recomputes the exact 677/513/164 projection and all public records", () => {
    expect(verifyPublicationIsolationDataV1(data(), contract)).toEqual({
      formulaIdentities: 677,
      published: 513,
      held: 164,
      excluded: 0,
      gplHeld: 73,
      cleanRoomPublished: 339,
      cleanRoomHeld: 39,
      runtimeRows: 513,
      previewRows: 513,
    });
  });

  it("rejects a B73 held identity substituted into the published runtime", () => {
    const mutated = data();
    const decisions = mutated.decisions.rows as readonly Record<string, unknown>[];
    const held = decisions.find((row) => row.rightsStatus === "gpl-3.0-only");
    const runtimeRows = mutated.runtimeIndex.rows as Record<string, unknown>[];
    if (!held || !runtimeRows[0]) throw new Error("missing-mutation-fixture");
    runtimeRows[0] = { ...runtimeRows[0], formulaId: held.formulaId };
    expect(() => verifyPublicationIsolationDataV1(mutated, contract)).toThrow(
      "publication-isolation-runtime-index-hash-invalid",
    );
  });

  it("rejects a repaired ledger self-hash when a C basis claim drifts", () => {
    const mutated = data();
    const decisions = mutated.decisions;
    const rows = decisions.rows as Record<string, unknown>[];
    const cleanRoom = rows.find(
      (row) =>
        row.rightsStatus === "no-explicit-permission" &&
        row.publicationDecision === "publish",
    );
    if (!cleanRoom) throw new Error("missing-mutation-fixture");
    cleanRoom.implementationBasis = "direct-adaptation";
    const unsigned = { ...decisions };
    delete unsigned.contentHash;
    decisions.contentHash = sha256(canonical(unsigned));
    expect(() => verifyPublicationIsolationDataV1(mutated, contract)).toThrow(
      "publication-isolation-decisions-invalid",
    );
  });

  it("rejects a jointly re-signed decision contract instead of trusting self-consistent counts", () => {
    const mutated = data();
    const mutatedContract = structuredClone(contract) as IsolationContract;
    const rows = mutated.decisions.rows as Record<string, unknown>[];
    const published = rows.find(
      (row) =>
        row.rightsStatus === "no-explicit-permission" &&
        row.publicationDecision === "publish",
    );
    if (!published) throw new Error("missing-mutation-fixture");
    published.reviewedAt = "2099-01-01T00:00:00.000Z";
    const unsigned = { ...mutated.decisions };
    delete unsigned.contentHash;
    const reboundHash = sha256(canonical(unsigned));
    mutated.decisions.contentHash = reboundHash;
    mutatedContract.publicBindings.publicationDecisionsContentHash = reboundHash;

    expect(() =>
      verifyPublicationIsolationDataV1(mutated, mutatedContract),
    ).toThrow("publication-isolation-frozen-authority-invalid");
  });

  it("rejects held Record actions and nested private provenance fields", () => {
    const withActions = data();
    const held = (withActions.records as Record<string, unknown>[]).find(
      (record) => record.publicationDecision === "hold",
    );
    if (!held) throw new Error("missing-mutation-fixture");
    held.actions = { run: "/forbidden" };
    expect(() => verifyPublicationIsolationDataV1(withActions, contract)).toThrow(
      "publication-isolation-held-record-exposed",
    );

    const withPrivateField = data();
    const published = (withPrivateField.records as Record<string, unknown>[]).find(
      (record) => record.publicationDecision === "publish",
    );
    if (!published) throw new Error("missing-mutation-fixture");
    published.metadata = { privateResolvedPath: "/protected/source" };
    expect(() =>
      verifyPublicationIsolationDataV1(withPrivateField, contract),
    ).toThrow("publication-isolation-record-private-field");
  });

  it("rejects a preview no longer bound to its runtime source", () => {
    const mutated = data();
    const previewRow = (mutated.previewManifest.rows as Record<string, unknown>[])[0];
    if (!previewRow) throw new Error("missing-mutation-fixture");
    previewRow.sourceRevision = "0".repeat(64);
    const unsigned = { ...mutated.previewManifest };
    delete unsigned.manifestContentHash;
    mutated.previewManifest.manifestContentHash = sha256(JSON.stringify(unsigned));

    expect(() => verifyPublicationIsolationDataV1(mutated, contract)).toThrow(
      "publication-isolation-preview-row-invalid",
    );
  });

  it("flags path, locator, raw-source, fixture, log, and sourcemap mutations without returning secrets", () => {
    const privateSource = `SensitiveEntry {
      init:
        hiddenState = pixel
      loop:
        hiddenState = hiddenState * hiddenState + pixel
        z = hiddenState
      bailout:
        |z| <= 4
    }`;
    const locator = "/protected/corpus/vendor/formulas.frm:SensitiveEntry";
    const matches = scanLeakageSurfacesV1(
      [
        { name: "client.js", text: privateSource },
        { name: "server.log", text: `input=${locator}` },
        {
          name: "server.js.map",
          text: "sourceRoot=/obsidian/private",
        },
        { name: "safe.json", text: '{"decision":"hold"}' },
      ],
      ["/obsidian/"],
      [locator],
      [privateSource],
    );
    expect(matches.map((match) => [match.surface, match.kind])).toEqual(
      expect.arrayContaining([
        ["client.js", "private-source-fragment"],
        ["server.log", "private-locator"],
        ["server.js.map", "path-marker"],
      ]),
    );
    expect(matches.some((match) => match.surface === "safe.json")).toBe(false);
    expect(JSON.stringify(matches)).not.toContain(locator);
    expect(JSON.stringify(matches)).not.toContain("hiddenState");
  });
});
