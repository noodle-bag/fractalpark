import { describe, expect, it } from "vitest";

import documentV2Fixture from "./fixtures/documents/document-v2.json";
import type { FractalDocumentV3 } from "@/engine/document-v3";
import {
  createFormulaDraftHeadsV1,
  importFractalFormulaV1,
  importFractalWorkV3,
  importFrmContainerV1,
  importFrmFormulaV1,
  remixFormulaV1,
  saveFormulaDraftHeadV1,
  writeFractalFormulaV1,
  writeFractalWorkEnvelopeV2,
  writeFrmFormulaV1,
  writeFractalWorkV3,
  type PortableFormulaLineageV1,
} from "@/engine/formulas/v1/portable";
import { hashFrmLikeV1, parseFrmLikeV1 } from "@/engine/frm/v1";
import {
  hashProfileRevisionV1,
  PUBLICATION_DECISION_LEDGER_V1,
  type FormulaDefinitionV1,
  type FormulaIdV1,
  type FormulaProfileV1,
  type FormulaRevisionV1,
} from "@/engine/formulas/v1";

const SOURCE = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Portable {
  parameters:
    power: real = 2 domain [1, 16] classic p1
  init:
    z = pixel
  loop:
    z = z ^ power + c
  bailout:
    |z| <= 4
}`;
const SOURCE_ID = "11111111-1111-4111-8111-111111111111" as FormulaIdV1;
const IMPORT_ID = "22222222-2222-4222-8222-222222222222" as FormulaIdV1;
const REMIX_ID = "33333333-3333-4333-8333-333333333333" as FormulaIdV1;

async function definition(): Promise<FormulaDefinitionV1> {
  const parsed = parseFrmLikeV1(SOURCE);
  if (!parsed.ok) throw new Error(parsed.reason);
  const hashes = await hashFrmLikeV1(SOURCE, parsed.ir);
  return {
    schemaVersion: 1,
    formulaId: SOURCE_ID,
    scope: "mine",
    source: SOURCE,
    sourceRevision: hashes.sourceRevision as FormulaRevisionV1,
    semanticHash: hashes.semanticHash as FormulaRevisionV1,
    languageVersion: "frm-like/1",
    stdlibVersion: 1,
    supportedNumericProfiles: ["standard32"],
    parameters: parsed.ir.parameters,
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

async function heldStandardDefinition(): Promise<FormulaDefinitionV1> {
  const held = PUBLICATION_DECISION_LEDGER_V1.rows.find(
    (row) => row.rightsStatus === "gpl-3.0-only",
  );
  if (!held) throw new Error("missing-gpl-held-fixture");
  const source = SOURCE.replace(
    "Portable",
    `Formula_${held.formulaId.replaceAll("-", "_")}`,
  );
  const parsed = parseFrmLikeV1(source);
  if (!parsed.ok) throw new Error(parsed.reason);
  const hashes = await hashFrmLikeV1(source, parsed.ir);
  return {
    schemaVersion: 1,
    formulaId: held.formulaId,
    scope: "standard",
    source,
    sourceRevision: hashes.sourceRevision as FormulaRevisionV1,
    semanticHash: hashes.semanticHash as FormulaRevisionV1,
    languageVersion: "frm-like/1",
    stdlibVersion: 1,
    supportedNumericProfiles: ["standard32"],
    parameters: parsed.ir.parameters,
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

async function profile(
  current: FormulaDefinitionV1,
): Promise<FormulaProfileV1> {
  const candidate = {
    schemaVersion: 1 as const,
    formulaId: current.formulaId,
    sourceRevision: current.sourceRevision,
    parameters: { power: 2 },
    mode: "parameter-plane" as const,
    view: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 },
    iterations: 100,
    coloring: {
      pipelineVersion: 2 as const,
      outsideColoringId: "smooth",
      insideColoringId: "solid",
      smooth: true,
    },
    palette: { paletteId: "classic" },
    transform: {
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      skewX: 0,
      skewY: 0,
      offsetX: 0,
      offsetY: 0,
    },
  };
  return {
    ...candidate,
    profileRevision: await hashProfileRevisionV1(candidate),
  };
}

function sourceAtUtf8Bytes(target: number): string {
  const baseBytes = new TextEncoder().encode(SOURCE).byteLength;
  return SOURCE.replace(
    "Portable",
    "A".repeat("Portable".length + target - baseBytes),
  );
}

describe("formula portable writer, Import, Remix, and draft lifecycle v1", () => {
  it("keeps all portable writers disabled by default", async () => {
    const current = await definition();
    const currentProfile = await profile(current);
    expect(await writeFrmFormulaV1(current)).toEqual({
      ok: false,
      code: "writer-disabled",
    });
    expect(
      await writeFractalFormulaV1({
        definition: current,
        profile: currentProfile,
      }),
    ).toEqual({ ok: false, code: "writer-disabled" });
    const incompleteV3 = {
      ...documentV2Fixture,
      schemaVersion: 3,
    } as unknown as FractalDocumentV3;
    expect(await writeFractalWorkV3(incompleteV3)).toEqual({
      ok: false,
      code: "writer-disabled",
    });
    expect(
      await writeFractalWorkEnvelopeV2({
        envelopeVersion: 2,
        document: incompleteV3,
        assets: [],
      }),
    ).toEqual({ ok: false, code: "writer-disabled" });
  });

  it("rejects every enabled portable writer for a held Standard formula", async () => {
    const held = await heldStandardDefinition();
    const heldProfile = await profile(held);
    const work = {
      ...documentV2Fixture,
      schemaVersion: 3,
      formula: {
        ...documentV2Fixture.formula,
        formulaId: held.formulaId,
        juliaC: documentV2Fixture.formula.juliaC as [number, number],
      },
      formulaSnapshot: {
        schemaVersion: 1,
        formulaId: held.formulaId,
        scope: "standard",
        source: held.source,
        sourceRevision: held.sourceRevision,
        semanticHash: held.semanticHash,
        languageVersion: "frm-like/1",
        stdlibVersion: 1,
        numericProfile: "standard32",
        parameterSchema: held.parameters,
        resolvedParameters: heldProfile.parameters,
        mode: "parameter-plane",
        iterations: documentV2Fixture.render.maxIterations,
        termination: held.termination,
        channels: [],
        profileRevision: heldProfile.profileRevision,
      },
    } as unknown as FractalDocumentV3;

    await expect(writeFrmFormulaV1(held, { enabled: true })).resolves.toEqual({
      ok: false,
      code: "formula-not-published",
    });
    await expect(
      writeFractalFormulaV1(
        { definition: held, profile: heldProfile },
        { enabled: true },
      ),
    ).resolves.toEqual({ ok: false, code: "formula-not-published" });
    await expect(writeFractalWorkV3(work, { enabled: true })).resolves.toEqual({
      ok: false,
      code: "formula-not-published",
    });
    await expect(
      writeFractalWorkEnvelopeV2(
        { envelopeVersion: 2, document: work, assets: [] },
        { enabled: true },
      ),
    ).resolves.toEqual({ ok: false, code: "formula-not-published" });
  });

  it("writes deterministic canonical .frm and .fractal-formula.json only behind an explicit gate", async () => {
    const current = await definition();
    const currentProfile = await profile(current);
    const frm = await writeFrmFormulaV1(current, { enabled: true });
    expect(frm).toEqual({ ok: true, value: SOURCE });
    const first = await writeFractalFormulaV1(
      { definition: current, profile: currentProfile },
      { enabled: true },
    );
    const second = await writeFractalFormulaV1(
      { profile: currentProfile, definition: current },
      { enabled: true },
    );
    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: true });
  });

  it("allocates a distinct Mine UUIDv4 for every formula import, strips untrusted identity state, and freezes only safe lineage", async () => {
    const current = await definition();
    const currentProfile = await profile(current);
    const portable = await writeFractalFormulaV1(
      {
        definition: current,
        profile: currentProfile,
        lineage: [
          {
            kind: "remix",
            formulaId: SOURCE_ID,
            sourceRevision: current.sourceRevision,
            profileRevision: currentProfile.profileRevision,
            originalSource: "forbidden",
            scope: "standard",
            alias: "f588:x",
          } as unknown as PortableFormulaLineageV1,
        ],
      },
      { enabled: true },
    );
    if (!portable.ok) throw new Error(portable.code);
    const first = await importFractalFormulaV1(portable.value, {
      randomUuid: () => IMPORT_ID,
    });
    const second = await importFractalFormulaV1(portable.value, {
      randomUuid: () => REMIX_ID,
    });
    expect(first).toMatchObject({
      ok: true,
      value: { definition: { formulaId: IMPORT_ID, scope: "mine" } },
    });
    expect(second).toMatchObject({
      ok: true,
      value: { definition: { formulaId: REMIX_ID, scope: "mine" } },
    });
    if (!first.ok) throw new Error(first.code);
    expect(first.value.definition.formulaId).not.toBe(current.formulaId);
    expect(first.value.profile?.formulaId).toBe(IMPORT_ID);
    expect(first.value.lineage).toEqual([
      {
        kind: "import",
        formulaId: SOURCE_ID,
        sourceRevision: current.sourceRevision,
        profileRevision: currentProfile.profileRevision,
      },
    ]);
    expect(Object.isFrozen(first.value)).toBe(true);
    expect(JSON.stringify(first.value.lineage)).not.toContain("originalSource");
    expect(JSON.stringify(first.value.lineage)).not.toContain("alias");
  });

  it("rejects formula tampering, but .frm import creates a Mine identity with the same 65,536-byte envelope", async () => {
    const current = await definition();
    const currentProfile = await profile(current);
    const portable = await writeFractalFormulaV1(
      { definition: current, profile: currentProfile },
      { enabled: true },
    );
    if (!portable.ok) throw new Error(portable.code);
    const tampered = JSON.parse(portable.value) as {
      definition: { sourceRevision: string };
      profile: { profileRevision: string };
    };
    tampered.definition.sourceRevision = "0".repeat(64);
    await expect(
      importFractalFormulaV1(JSON.stringify(tampered), {
        randomUuid: () => IMPORT_ID,
      }),
    ).resolves.toEqual({ ok: false, code: "definition-invalid" });
    const profileTampered = JSON.parse(portable.value) as {
      profile: { profileRevision: string };
    };
    profileTampered.profile.profileRevision = "0".repeat(64);
    await expect(
      importFractalFormulaV1(JSON.stringify(profileTampered), {
        randomUuid: () => IMPORT_ID,
      }),
    ).resolves.toEqual({ ok: false, code: "definition-invalid" });
    const acceptedSource = sourceAtUtf8Bytes(65_536);
    const rejectedSource = sourceAtUtf8Bytes(65_537);
    expect(new TextEncoder().encode(acceptedSource)).toHaveLength(65_536);
    expect(new TextEncoder().encode(rejectedSource)).toHaveLength(65_537);
    await expect(
      importFrmFormulaV1(acceptedSource, { randomUuid: () => IMPORT_ID }),
    ).resolves.toMatchObject({
      ok: true,
      value: { definition: { formulaId: IMPORT_ID, scope: "mine" } },
    });
    await expect(
      importFrmFormulaV1(rejectedSource, { randomUuid: () => IMPORT_ID }),
    ).resolves.toEqual({ ok: false, code: "definition-invalid" });
  });

  it("treats multi-entry .frm as an explicit selection container with isolated results", async () => {
    const body = SOURCE.slice(SOURCE.indexOf("Portable"));
    const container = `${SOURCE.slice(0, SOURCE.indexOf("Portable"))}${body}\n${body.replace("Portable", "PortableTwo")}`;
    await expect(importFrmContainerV1(container)).resolves.toEqual({
      ok: false,
      code: "invalid-format",
    });
    const ids = [IMPORT_ID, REMIX_ID];
    const selected = await importFrmContainerV1(container, {
      selectedKeys: ["Portable", "PortableTwo"],
      randomUuid: () => ids.shift() ?? REMIX_ID,
    });
    expect(selected).toMatchObject({
      ok: true,
      value: [
        { entryKey: "Portable", result: { ok: true } },
        { entryKey: "PortableTwo", result: { ok: true } },
      ],
    });
    if (!selected.ok) throw new Error(selected.code);
    expect(
      selected.value.map((entry) =>
        entry.result.ok ? entry.result.value.definition.formulaId : null,
      ),
    ).toEqual([IMPORT_ID, REMIX_ID]);
  });

  it("remixes as a frozen Mine fork without scope, alias, or original-source leakage", async () => {
    const current = await definition();
    const currentProfile = await profile(current);
    const result = await remixFormulaV1({
      definition: current,
      profile: currentProfile,
      randomUuid: () => REMIX_ID,
    });
    expect(result).toMatchObject({
      ok: true,
      value: { definition: { formulaId: REMIX_ID, scope: "mine" } },
    });
    if (!result.ok) throw new Error(result.code);
    expect(result.value.lineage).toEqual([
      {
        kind: "remix",
        formulaId: SOURCE_ID,
        sourceRevision: current.sourceRevision,
        profileRevision: currentProfile.profileRevision,
      },
    ]);
    expect(result.value.definition.source).toBe(SOURCE);
    expect(Object.isFrozen(result.value.definition)).toBe(true);
  });

  it("preserves invalid editable source while retaining the runnable head, then explicitly rehabilitates both heads", async () => {
    const current = await definition();
    const currentProfile = await profile(current);
    const initial = await createFormulaDraftHeadsV1(current, currentProfile);
    if (!initial.ok) throw new Error(initial.code);
    const invalid = await saveFormulaDraftHeadV1(initial.value, {
      source: "not canonical",
    });
    expect(invalid).toMatchObject({
      ok: true,
      value: {
        editableHead: { kind: "invalid", source: "not canonical" },
        activeRunnableRevision: current.sourceRevision,
      },
    });
    if (!invalid.ok) throw new Error(invalid.code);
    expect(invalid.value.activeRunnable.definition.source).toBe(SOURCE);
    const restored = await saveFormulaDraftHeadV1(invalid.value, {
      definition: current,
      profile: currentProfile,
    });
    expect(restored).toMatchObject({
      ok: true,
      value: {
        editableHead: { kind: "runnable" },
        activeRunnableRevision: current.sourceRevision,
      },
    });
    await expect(
      createFormulaDraftHeadsV1(
        {
          formulaId: "not-an-id",
          source: "evil",
        } as unknown as FormulaDefinitionV1,
        { formulaId: "not-an-id" } as unknown as FormulaProfileV1,
      ),
    ).resolves.toEqual({ ok: false, code: "definition-invalid" });
    const throwing = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("attacker");
        },
      },
    );
    await expect(
      saveFormulaDraftHeadV1(throwing as unknown as never, {}),
    ).resolves.toEqual({ ok: false, code: "definition-invalid" });
    await expect(
      saveFormulaDraftHeadV1(initial.value, throwing as unknown as never),
    ).resolves.toEqual({ ok: false, code: "definition-invalid" });
  });

  it("imports artwork snapshots without creating or rewriting a My Formula identity", async () => {
    const current = await definition();
    const currentProfile = await profile(current);
    const work = await writeFractalWorkV3(
      {
        ...documentV2Fixture,
        schemaVersion: 3,
        formula: {
          ...documentV2Fixture.formula,
          formulaId: current.formulaId,
          juliaC: documentV2Fixture.formula.juliaC as [number, number],
        },
        formulaSnapshot: {
          schemaVersion: 1,
          formulaId: current.formulaId,
          scope: "mine",
          source: current.source,
          sourceRevision: current.sourceRevision,
          semanticHash: current.semanticHash,
          languageVersion: "frm-like/1",
          stdlibVersion: 1,
          numericProfile: "standard32",
          parameterSchema: current.parameters,
          resolvedParameters: currentProfile.parameters,
          mode: "parameter-plane",
          iterations: documentV2Fixture.render.maxIterations,
          termination: current.termination,
          channels: [],
          profileRevision: currentProfile.profileRevision,
        },
      } as unknown as FractalDocumentV3,
      { enabled: true },
    );
    if (!work.ok) throw new Error(work.code);
    const imported = await importFractalWorkV3(work.value);
    expect(imported).toMatchObject({
      ok: true,
      value: {
        createdFormula: false,
        snapshot: {
          formulaId: SOURCE_ID,
          sourceRevision: current.sourceRevision,
        },
      },
    });
  });
});
