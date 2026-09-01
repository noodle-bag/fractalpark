import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import identitiesManifest from "../../resources/formula-library/v1/standard-formula-ids.json";
import {
  computeProvisionalManifestContentHash,
  computeRunnableLedgerContentHash,
  encodeDeterministicPng,
  provisionalBoundsCandidatesForRow,
  validateRunnableLedgerSelection,
  writePrivatePresentableFile,
} from "../../scripts/formula-library-bulk-migration";
import { compileFrmLikeV1Backend } from "@/engine/frm/v1-backend";
import { PALETTES } from "@/engine/palettes";
import {
  validateFormulaProfileAssetV1,
  verifyProfileRevisionV1,
  type FormulaDefinitionV1,
  type FormulaIdV1,
  type FormulaRevisionV1,
} from "@/engine/formulas/v1";
import {
  composeProvisionalContactSheetV1,
  provisionalLegacyInfernoColorV1,
  provisionalLegacySmoothIterationV1,
  renderProvisionalPreviewV1,
} from "@/engine/formulas/v1/provisional-preview";
import { renderRecordPreviewV1 } from "@/engine/formulas/v1/record-preview-renderer";
import {
  PROVISIONAL_PROFILE_POLICY_V1,
  projectProvisionalProfileV1,
  resolveProvisionalBoundsV1,
} from "@/engine/formulas/v1/provisional-profile";

const FORMULA_ID = identitiesManifest.formulas[0].formulaId as FormulaIdV1;
const SOURCE_REVISION = "a".repeat(64) as FormulaRevisionV1;
const SEMANTIC_HASH = "b".repeat(64) as FormulaRevisionV1;

function definition(): FormulaDefinitionV1 {
  return {
    schemaVersion: 1,
    formulaId: FORMULA_ID,
    scope: "standard",
    source: "private-test-placeholder",
    sourceRevision: SOURCE_REVISION,
    semanticHash: SEMANTIC_HASH,
    languageVersion: "frm-like/1",
    stdlibVersion: 1,
    supportedNumericProfiles: ["standard32"],
    parameters: [
      { name: "gain", type: "real", default: 0.75, hardDomain: [0, 1] },
      { name: "offset", type: "complex", default: [0.1, -0.2] },
      { name: "function1", type: "function", default: "sin" },
    ],
    programModel: "orbit",
    termination: {
      predicateMeaning: "continue-iteration",
      nonFinite: "terminate-with-event",
      maximumIterations: "profile-resolved",
    },
    channels: [],
    capabilities: [],
  };
}

const UPSTREAM = { centerX: 1, centerY: 2, zoom: 3, rotation: 4 };
const B94 = { centerX: 5, centerY: 6, zoom: 7, rotation: 8 };
const FAMILY = { centerX: 9, centerY: 10, zoom: 11, rotation: 12 };

function runnableLedgerFixture() {
  const expectedRows = [
    { formulaId: "row-one", sourceSet: "F588" as const },
    { formulaId: "row-two", sourceSet: "B94" as const },
  ];
  const inputHashes = { corpusSnapshot: "bound" };
  const ledger = {
    schema: "fractalpark-formula-library-bulk-migration-ledger/v2",
    controllerVersion: "formula-library-bulk-migration/2",
    ledgerHashAlgorithm: "sha256-ecmascript-sorted-json/1",
    deterministic: true,
    inputHashes,
    summary: { total: 2, passed: 1, failed: 1 },
    rows: [
      {
        formulaId: "row-one",
        sourceSet: "F588",
        status: "passed",
        publicationEligible: false,
        sourceRevision: "1".repeat(64),
        semanticHash: "2".repeat(64),
        backendArtifactSha256: "3".repeat(64),
        releaseOracle: { status: "passed" },
        webgl: {
          compileLinkDraw: "passed",
          deterministicDraw: "passed",
          cpuParity: "passed",
        },
      },
      {
        formulaId: "row-two",
        sourceSet: "B94",
        status: "failed",
        publicationEligible: false,
      },
    ],
    ledgerContentHash: "",
  };
  ledger.ledgerContentHash = computeRunnableLedgerContentHash(ledger);
  return { ledger, expectedRows, inputHashes };
}

describe("formula-library provisional Profile projection", () => {
  it("samples the production legacy Inferno iqPalette at the five UI stops", () => {
    const production = PALETTES.find((palette) => palette.name === "Inferno");
    expect(production).toBeDefined();
    const displayStops =
      production?.colors.map((color) => [
        Number.parseInt(color.slice(1, 3), 16),
        Number.parseInt(color.slice(3, 5), 16),
        Number.parseInt(color.slice(5, 7), 16),
      ]) ?? [];
    const renderedStops = [0, 0.25, 0.5, 0.75, 1].map(
      provisionalLegacyInfernoColorV1,
    );
    expect(renderedStops).toHaveLength(displayStops.length);
    for (const [index, rendered] of renderedStops.entries())
      for (let channel = 0; channel < 3; channel++)
        expect(Math.abs(rendered[channel] - displayStops[index][channel])).toBeLessThanOrEqual(1);
    expect(provisionalLegacySmoothIterationV1(10, 16, 2)).toBe(12);
    expect(provisionalLegacySmoothIterationV1(10, 16, 4)).toBe(13);
  });

  it("selects only the exact content-bound v2 runnable set and rejects tampering", () => {
    const fixture = runnableLedgerFixture();
    expect(
      validateRunnableLedgerSelection(
        fixture.ledger,
        fixture.expectedRows,
        fixture.inputHashes,
        { total: 2, passed: 1, contentHash: fixture.ledger.ledgerContentHash },
      ).map((row) => row.formulaId),
    ).toEqual(["row-one"]);
    const tampered = structuredClone(fixture.ledger);
    tampered.rows[0].semanticHash = "4".repeat(64);
    expect(() =>
      validateRunnableLedgerSelection(
        tampered,
        fixture.expectedRows,
        fixture.inputHashes,
        { total: 2, passed: 1, contentHash: fixture.ledger.ledgerContentHash },
      ),
    ).toThrow("provisional-assets-ledger-mismatch");
    const extraPass = structuredClone(fixture.ledger);
    extraPass.rows[1] = {
      ...extraPass.rows[0],
      formulaId: "row-two",
      sourceSet: "B94",
    };
    extraPass.ledgerContentHash = computeRunnableLedgerContentHash(extraPass);
    expect(() =>
      validateRunnableLedgerSelection(
        extraPass,
        fixture.expectedRows,
        fixture.inputHashes,
        { total: 2, passed: 1, contentHash: extraPass.ledgerContentHash },
      ),
    ).toThrow("provisional-assets-ledger-mismatch");
  });

  it("encodes byte-stable PNGs and protects every private Presentable output component", () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 0, 0, 255]);
    const firstPng = encodeDeterministicPng(2, 1, rgba);
    expect(encodeDeterministicPng(2, 1, rgba)).toEqual(firstPng);
    expect(Array.from(firstPng.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const manifest = { schema: "private-test", rows: [1, 2], manifestContentHash: "" };
    manifest.manifestContentHash = computeProvisionalManifestContentHash(manifest);
    expect(computeProvisionalManifestContentHash(manifest)).toBe(
      manifest.manifestContentHash,
    );
    expect(
      computeProvisionalManifestContentHash({ ...manifest, rows: [2, 1] }),
    ).not.toBe(manifest.manifestContentHash);

    const root = mkdtempSync(join(tmpdir(), "formula-presentables-"));
    try {
      chmodSync(root, 0o700);
      const repository = join(root, "repo");
      mkdirSync(repository, { mode: 0o700 });
      const written = writePrivatePresentableFile(
        repository,
        "preview-001.png",
        firstPng,
      );
      const privateRoot = join(repository, ".formula-library-private");
      const privateLeaf = join(privateRoot, "formula-library-v1");
      const presentables = join(privateLeaf, "provisional-assets-v1");
      expect(lstatSync(privateRoot).mode & 0o777).toBe(0o700);
      expect(lstatSync(privateLeaf).mode & 0o777).toBe(0o700);
      expect(lstatSync(presentables).mode & 0o777).toBe(0o700);
      expect(lstatSync(written).mode & 0o777).toBe(0o600);

      const external = join(root, "external.png");
      writeFileSync(external, "safe", { mode: 0o600 });
      symlinkSync(external, join(presentables, "preview-002.png"));
      expect(() =>
        writePrivatePresentableFile(repository, "preview-002.png", firstPng),
      ).toThrow("private-output-symlink-rejected");
      expect(readFileSync(external, "utf8")).toBe("safe");

      const hardlinkExternal = join(root, "hardlink-external.png");
      writeFileSync(hardlinkExternal, "safe-hardlink", { mode: 0o600 });
      linkSync(hardlinkExternal, join(presentables, "preview-003.png"));
      expect(() =>
        writePrivatePresentableFile(repository, "preview-003.png", firstPng),
      ).toThrow("private-output-containment-failed");
      expect(readFileSync(hardlinkExternal, "utf8")).toBe("safe-hardlink");
      expect(() =>
        writePrivatePresentableFile(repository, "../escape.png", firstPng),
      ).toThrow("private-output-containment-failed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolves bounds by the frozen candidate precedence and ignores invalid candidates", () => {
    expect(
      resolveProvisionalBoundsV1({
        upstreamCandidate: UPSTREAM,
        b94CatalogCandidate: B94,
        familyFallback: FAMILY,
      }),
    ).toEqual({ source: "upstream-candidate", view: UPSTREAM });
    expect(
      resolveProvisionalBoundsV1({
        upstreamCandidate: { ...UPSTREAM, zoom: 0 },
        b94CatalogCandidate: B94,
        familyFallback: FAMILY,
      }),
    ).toEqual({ source: "b94-catalog", view: B94 });
    expect(
      resolveProvisionalBoundsV1({ familyFallback: FAMILY }),
    ).toEqual({ source: "family-fallback", view: FAMILY });
    expect(resolveProvisionalBoundsV1()).toEqual({
      source: "project-fallback",
      view: PROVISIONAL_PROFILE_POLICY_V1.projectFallbackView,
    });
  });

  it("binds controller rows to explicit B94, catalog, family, then project bounds lanes", () => {
    const explicit = { centerX: 1, centerY: 2, zoom: 3, rotation: 4 };
    const catalog = { centerX: 5, centerY: 6, zoom: 7, rotation: 8 };
    const baseB94 = {
      sourceSet: "B94" as const,
      primaryFamily: "root-finding",
      defaultProfileCandidate: {
        candidate: { scene: { bounds: explicit } },
      },
      previewInput: {
        candidate: { scene: { bounds: explicit }, view: catalog },
      },
    };
    expect(
      resolveProvisionalBoundsV1(
        provisionalBoundsCandidatesForRow({
          ...baseB94,
          defaultProfileCandidate: {
            ...baseB94.defaultProfileCandidate,
            explicitLegacyDefaultProfile: true,
          },
        }),
      ),
    ).toEqual({ source: "upstream-candidate", view: explicit });
    expect(
      resolveProvisionalBoundsV1(
        provisionalBoundsCandidatesForRow({
          ...baseB94,
          defaultProfileCandidate: {
            ...baseB94.defaultProfileCandidate,
            explicitLegacyDefaultProfile: false,
          },
        }),
      ),
    ).toEqual({ source: "b94-catalog", view: catalog });
    expect(
      resolveProvisionalBoundsV1(
        provisionalBoundsCandidatesForRow({
          sourceSet: "F588",
          primaryFamily: "algebraic-power",
          defaultProfileCandidate: { candidate: null },
          previewInput: { candidate: null },
        }),
      ),
    ).toEqual({
      source: "family-fallback",
      view: PROVISIONAL_PROFILE_POLICY_V1.projectFallbackView,
    });
    expect(
      resolveProvisionalBoundsV1(
        provisionalBoundsCandidatesForRow({
          sourceSet: "F588",
          primaryFamily: "unknown-family",
        }),
      ),
    ).toEqual({
      source: "project-fallback",
      view: PROVISIONAL_PROFILE_POLICY_V1.projectFallbackView,
    });
  });

  it("copies exact Definition defaults into a schema-valid deterministic provisional Profile", async () => {
    const projected = await projectProvisionalProfileV1(definition());
    expect(projected).toMatchObject({
      schema: "fractalpark-provisional-profile/v1",
      policyVersion: "formula-library-provisional-profile/1",
      provisionalDefaultProfile: true,
      verifiedDefaultProfile: false,
      publicationEligible: false,
      boundsSource: "project-fallback",
    });
    expect(projected.profile.parameters).toEqual({
      gain: 0.75,
      offset: [0.1, -0.2],
      function1: "sin",
    });
    expect(projected.profile).toMatchObject({
      mode: "parameter-plane",
      iterations: 200,
      coloring: {
        pipelineVersion: 1,
        outsideColoringId: "smooth",
        insideColoringId: "black",
        smooth: true,
      },
      palette: { paletteId: "inferno" },
      transform: {
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        offsetX: 0,
        offsetY: 0,
      },
    });
    expect(Object.keys(projected.profile)).not.toContain("provisionalDefaultProfile");
    await expect(verifyProfileRevisionV1(projected.profile)).resolves.toBe(true);
    await expect(
      validateFormulaProfileAssetV1(
        projected.profile,
        definition(),
        projected.profile.profileRevision,
      ),
    ).resolves.toMatchObject({ ok: true });
    await expect(projectProvisionalProfileV1(definition())).resolves.toEqual(projected);
  });

  it("renders deterministic raw previews and preserves ledger order in the contact sheet", async () => {
    const backendResult = compileFrmLikeV1Backend({
      languageVersion: "frm-like/1",
      stdlibVersion: 1,
      numericProfile: "standard32",
      formulaName: "PreviewSynthetic",
      parameters: [],
      locals: [],
      evaluationOrder: "source-order-left-to-right",
      init: [
        {
          kind: "assignment",
          target: "z",
          value: { kind: "identifier", name: "pixel" },
        },
      ],
      loop: [
        {
          kind: "assignment",
          target: "z",
          value: {
            kind: "binary",
            operator: "+",
            left: {
              kind: "binary",
              operator: "*",
              left: { kind: "identifier", name: "z" },
              right: { kind: "identifier", name: "z" },
            },
            right: { kind: "identifier", name: "c" },
          },
        },
      ],
      bailout: {
        kind: "binary",
        operator: "<=",
        left: { kind: "magnitude", operand: { kind: "identifier", name: "z" } },
        right: { kind: "number", value: 4 },
      },
    });
    expect(backendResult.ok).toBe(true);
    if (!backendResult.ok) throw new Error(backendResult.reason);
    const noParameters = { ...definition(), parameters: [] };
    const projected = await projectProvisionalProfileV1(noParameters);
    const first = renderProvisionalPreviewV1(
      backendResult.backend,
      projected.profile,
      16,
      10,
    );
    const second = renderProvisionalPreviewV1(
      backendResult.backend,
      projected.profile,
      16,
      10,
    );
    expect(second).toEqual(first);
    expect(first.rgba).toHaveLength(16 * 10 * 4);
    expect(first.escapedPixels + first.interiorPixels + first.nonFinitePixels).toBe(160);
    expect(first.uniqueColors).toBeGreaterThan(1);
    const boundedBlackProfile = {
      ...projected.profile,
      view: {
        ...projected.profile.view,
        centerX: 0,
        centerY: 0,
        zoom: 100,
      },
      iterations: 8,
    };
    const boundedBlack = renderProvisionalPreviewV1(
      backendResult.backend,
      boundedBlackProfile,
      16,
      10,
    );
    expect(boundedBlack.escapedPixels).toBe(0);
    expect(boundedBlack.nonFinitePixels).toBe(0);
    expect(boundedBlack.uniqueColors).toBe(1);
    const boundedOrbitProfile = {
      ...boundedBlackProfile,
      coloring: {
        ...boundedBlackProfile.coloring,
        insideColoringId: "record-preview-orbit-average-v1",
      },
    };
    const boundedOrbit = renderRecordPreviewV1(
      backendResult.backend,
      boundedOrbitProfile,
      16,
      10,
    );
    expect(
      renderRecordPreviewV1(
        backendResult.backend,
        boundedOrbitProfile,
        16,
        10,
      ),
    ).toEqual(boundedOrbit);
    expect(boundedOrbit.escapedPixels).toBe(0);
    expect(boundedOrbit.interiorPixels).toBe(160);
    expect(boundedOrbit.nonFinitePixels).toBe(0);
    expect(boundedOrbit.uniqueColors).toBeGreaterThan(4);
    expect(boundedOrbit.rgba).not.toEqual(boundedBlack.rgba);
    const sheet = composeProvisionalContactSheetV1([first, second], 2);
    expect(sheet).toEqual(composeProvisionalContactSheetV1([first, second], 2));
    expect(sheet.width).toBe(32);
    expect(sheet.height).toBe(10);
    expect(Array.from(sheet.rgba.subarray(0, first.rgba.length))).not.toEqual(
      Array.from(first.rgba),
    );
    const juliaProfile = {
      ...projected.profile,
      mode: "julia" as const,
      juliaC: [-0.8, 0.156] as const,
    };
    const juliaFirst = renderProvisionalPreviewV1(
      backendResult.backend,
      juliaProfile,
      16,
      10,
    );
    const juliaSecond = renderProvisionalPreviewV1(
      backendResult.backend,
      juliaProfile,
      16,
      10,
    );
    expect(juliaSecond).toEqual(juliaFirst);
    expect(juliaFirst.uniqueColors).toBeGreaterThan(1);
    const juliaWithoutC = {
      ...projected.profile,
      mode: "julia" as const,
    };
    expect(() =>
      renderProvisionalPreviewV1(
        backendResult.backend,
        juliaWithoutC,
        16,
        10,
      ),
    ).toThrow("provisional-preview-policy-unsupported");
    expect(() =>
      renderProvisionalPreviewV1(
        backendResult.backend,
        {
          ...projected.profile,
          coloring: { ...projected.profile.coloring, smooth: false },
        },
        16,
        10,
      ),
    ).toThrow("provisional-preview-policy-unsupported");
  });

  it("fails closed on duplicate Definition parameter names", async () => {
    const base = definition();
    await expect(
      projectProvisionalProfileV1({
        ...base,
        parameters: [...base.parameters, base.parameters[0]],
      }),
    ).rejects.toThrow("provisional-parameter-duplicate");
  });
});
