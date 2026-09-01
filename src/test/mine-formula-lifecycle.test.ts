import { describe, expect, it } from "vitest";

import { hashFrmLikeV1, parseFrmLikeV1 } from "@/engine/frm/v1";
import {
  hashProfileRevisionV1,
  sha256HexV1,
} from "@/engine/formulas/v1/revisions";
import type {
  FormulaDefinitionV1,
  FormulaIdV1,
  FormulaProfileV1,
  FormulaRevisionV1,
} from "@/engine/formulas/v1/types";
import { CustomFormulaServiceError } from "@/lib/cloud/custom-formulas";
import {
  assertMineFormulaLifecycleInput,
  type MineFormulaLifecycleRevisionInput,
} from "@/lib/cloud/mine-formula-lifecycle";

const FORMULA_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" as FormulaIdV1;
const STANDARD_PARENT = "4287abf5-af50-5f75-9d2a-f56bec9bdf2b";
const SOURCE = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Mine {
  parameters:
    power: real = 2 domain [1, 16] classic p1
  init:
    z = pixel
  loop:
    z = z ^ power + c
  bailout:
    |z| <= 4
}`;

function sourceAtUtf8Bytes(target: number): string {
  const current = new TextEncoder().encode(SOURCE).byteLength;
  return SOURCE.replace("Mine", "A".repeat("Mine".length + target - current));
}

async function runnableCandidate(
  source = SOURCE,
): Promise<MineFormulaLifecycleRevisionInput> {
  const parsed = parseFrmLikeV1(source);
  if (!parsed.ok) throw new Error(parsed.reason);
  const hashes = await hashFrmLikeV1(source, parsed.ir);
  const definition: FormulaDefinitionV1 = {
    schemaVersion: 1,
    formulaId: FORMULA_ID,
    scope: "mine",
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
  const profileBase = {
    schemaVersion: 1 as const,
    formulaId: FORMULA_ID,
    sourceRevision: definition.sourceRevision,
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
  const profile: FormulaProfileV1 = {
    ...profileBase,
    profileRevision: await hashProfileRevisionV1(profileBase),
  };
  return {
    definition: definition as unknown as Record<string, unknown>,
    profile: profile as unknown as Record<string, unknown>,
    sourceRevision: definition.sourceRevision,
    profileRevision: profile.profileRevision,
    runnable: true,
    diagnostics: [],
  };
}

async function invalidCandidate(): Promise<MineFormulaLifecycleRevisionInput> {
  const value = await runnableCandidate();
  const source = "not canonical";
  const sourceRevision = await sha256HexV1(source);
  const profileBase = Object.fromEntries(
    Object.entries({
      ...(value.profile as unknown as FormulaProfileV1),
      sourceRevision,
    }).filter(([key]) => key !== "profileRevision"),
  ) as Omit<FormulaProfileV1, "profileRevision">;
  const profileRevision = await hashProfileRevisionV1(profileBase);
  return {
    ...value,
    definition: {
      ...value.definition,
      source,
      sourceRevision,
    },
    profile: { ...profileBase, profileRevision },
    sourceRevision,
    profileRevision,
    runnable: false,
    diagnostics: [{ code: "parse" }],
  };
}

describe("Mine formula lifecycle service boundary", () => {
  it("recomputes exact source/profile revisions and validates a runnable head", async () => {
    await expect(
      assertMineFormulaLifecycleInput(await runnableCandidate()),
    ).resolves.toBeUndefined();
    const tampered = await runnableCandidate();
    tampered.sourceRevision = "b".repeat(64);
    await expect(
      assertMineFormulaLifecycleInput(tampered),
    ).rejects.toBeInstanceOf(CustomFormulaServiceError);
    const accepted = sourceAtUtf8Bytes(65_536);
    expect(new TextEncoder().encode(accepted)).toHaveLength(65_536);
    await expect(
      assertMineFormulaLifecycleInput(await runnableCandidate(accepted)),
    ).resolves.toBeUndefined();
    const rejected = await runnableCandidate();
    rejected.definition = {
      ...rejected.definition,
      source: "x".repeat(65_537),
    };
    await expect(
      assertMineFormulaLifecycleInput(rejected),
    ).rejects.toBeInstanceOf(CustomFormulaServiceError);
  });

  it("preserves a revision-pinned invalid draft only with diagnostics", async () => {
    const invalid = await invalidCandidate();
    await expect(
      assertMineFormulaLifecycleInput(invalid),
    ).resolves.toBeUndefined();
    await expect(
      assertMineFormulaLifecycleInput({ ...invalid, diagnostics: [] }),
    ).rejects.toBeInstanceOf(CustomFormulaServiceError);

    const profile = invalid.profile as unknown as FormulaProfileV1;
    const malformedProfileBase = Object.fromEntries(
      Object.entries({ ...profile, parameters: { power: 999 } }).filter(
        ([key]) => key !== "profileRevision",
      ),
    ) as unknown as Omit<FormulaProfileV1, "profileRevision">;
    const malformedProfileRevision = await hashProfileRevisionV1(
      malformedProfileBase,
    );
    await expect(
      assertMineFormulaLifecycleInput({
        ...invalid,
        profile: {
          ...malformedProfileBase,
          profileRevision: malformedProfileRevision,
        },
        profileRevision: malformedProfileRevision,
      }),
    ).rejects.toBeInstanceOf(CustomFormulaServiceError);
  });

  it("never trusts a client runnable flag for source that does not parse", async () => {
    const forged = await invalidCandidate();
    await expect(
      assertMineFormulaLifecycleInput({
        ...forged,
        runnable: true,
        diagnostics: [],
      }),
    ).rejects.toBeInstanceOf(CustomFormulaServiceError);
  });

  it("rejects originalSource and ambiguous lineage but accepts Standard parent identity with revisions", async () => {
    const valid = await runnableCandidate();
    await expect(
      assertMineFormulaLifecycleInput({
        ...valid,
        definition: { ...valid.definition, originalSource: "private" },
      }),
    ).rejects.toBeInstanceOf(CustomFormulaServiceError);
    await expect(
      assertMineFormulaLifecycleInput({
        ...valid,
        importedFromFormulaId: FORMULA_ID,
        remixedFromFormulaId: FORMULA_ID,
        lineageSourceRevision: valid.sourceRevision,
      }),
    ).rejects.toBeInstanceOf(CustomFormulaServiceError);
    await expect(
      assertMineFormulaLifecycleInput({
        ...valid,
        remixedFromFormulaId: STANDARD_PARENT,
        lineageSourceRevision: valid.sourceRevision,
        lineageProfileRevision: valid.profileRevision,
      }),
    ).resolves.toBeUndefined();
  });
});
