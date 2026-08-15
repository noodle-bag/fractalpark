import { describe, expect, it } from "vitest";
import aliasesManifest from "../../resources/formula-library/v1/legacy-formula-aliases.json";
import identitiesManifest from "../../resources/formula-library/v1/standard-formula-ids.json";
import { hashFrmLikeV1, parseFrmLikeV1 } from "@/engine/frm/v1";
import {
  STANDARD_MANIFEST_INDEX_V1,
  auditStandardAliasesV1,
  canonicalJsonV1,
  createCommunityFormulaIdV1,
  createMineFormulaIdV1,
  createStandardManifestIndexV1,
  executableFormulaSourceFitsV1,
  hashProfileRevisionV1,
  isFormulaBackendRevisionV1,
  isFormulaIdV1,
  isFormulaRevisionSetV1,
  parseFormulaIdV1,
  profileRevisionProjectionV1,
  projectExecutableFormulaDefinitionV1,
  resolveFormulaV1,
  validateFormulaDefinitionIdentityV1,
  validateFormulaProfileAssetV1,
  validateFormulaRecordOwnershipV1,
  validateFormulaSafetyEnvelopeV1,
  type FormulaAssetRevisionRequestV1,
  type FormulaBackendRevisionV1,
  type FormulaCompilerInputV1,
  type FormulaDefinitionV1,
  type FormulaIdV1,
  type FormulaProfileV1,
  type FormulaRecordV1,
  type FormulaRevisionV1,
} from "@/engine/formulas/v1";

const SOURCE = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
CleanRoom {
  parameters:
    power: real = 2 domain [1, 16] classic p1
    transform: function = sin classic fn1
  init:
    z = pixel
  loop:
    z = transform(z ^ power) + c
  bailout:
    |z| <= 4
}`;

const STANDARD_ID = identitiesManifest.formulas[0].formulaId as FormulaIdV1;
const MINE_ID = "11111111-1111-4111-8111-111111111111" as FormulaIdV1;
const COMMUNITY_ID = "22222222-2222-4222-8222-222222222222" as FormulaIdV1;
const UNKNOWN_V5 = "33333333-3333-5333-8333-333333333333" as FormulaIdV1;
const ARTIFACT_HASH = "a".repeat(64) as FormulaRevisionV1;
const BACKEND_REVISION: FormulaBackendRevisionV1 = {
  schemaVersion: 1,
  buildId: "frm-like-v1.test",
  artifactSha256: ARTIFACT_HASH,
};

function parsed(source = SOURCE) {
  const result = parseFrmLikeV1(source);
  if (result.ok === false) throw new Error(`fixture-invalid:${result.reason}`);
  return result;
}

async function definition(
  options: Readonly<{
    source?: string;
    formulaId?: FormulaIdV1;
    scope?: "standard" | "mine" | "community";
  }> = {},
): Promise<FormulaDefinitionV1> {
  const source = options.source ?? SOURCE;
  const result = parsed(source);
  const hashes = await hashFrmLikeV1(source, result.ir);
  return {
    schemaVersion: 1,
    formulaId: options.formulaId ?? STANDARD_ID,
    scope: options.scope ?? "standard",
    source,
    sourceRevision: hashes.sourceRevision as FormulaRevisionV1,
    semanticHash: hashes.semanticHash as FormulaRevisionV1,
    languageVersion: "frm-like/1",
    stdlibVersion: 1,
    supportedNumericProfiles: ["standard32"],
    parameters: result.ir.parameters,
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
  currentDefinition: FormulaDefinitionV1,
  overrides: Partial<Omit<FormulaProfileV1, "profileRevision">> = {},
): Promise<FormulaProfileV1> {
  const candidate = {
    schemaVersion: 1 as const,
    formulaId: currentDefinition.formulaId,
    sourceRevision: currentDefinition.sourceRevision,
    parameters: { power: 2, transform: "sin" },
    mode: "parameter-plane" as const,
    view: { centerX: 0, centerY: 0, zoom: 1, rotation: 0 },
    iterations: 100,
    coloring: {
      pipelineVersion: 2 as const,
      outsideColoringId: "smooth",
      insideColoringId: "solid",
      smooth: true,
      post: { gamma: 1 },
    },
    palette: {
      paletteId: "classic",
      gradient: [
        { position: 0, color: "#000000" },
        { position: 1, color: "#ffffff" },
      ],
    },
    transform: {
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      skewX: 0,
      skewY: 0,
      offsetX: 0,
      offsetY: 0,
    },
    ...overrides,
  } satisfies Omit<FormulaProfileV1, "profileRevision">;
  return {
    ...candidate,
    profileRevision: await hashProfileRevisionV1(candidate),
  };
}

function request(
  currentDefinition: FormulaDefinitionV1,
  currentProfile: FormulaProfileV1,
  reference: FormulaAssetRevisionRequestV1["reference"] = {
    kind: "canonical",
    formulaId: currentDefinition.formulaId,
  },
): FormulaAssetRevisionRequestV1 {
  return {
    reference,
    sourceRevision: currentDefinition.sourceRevision,
    profileRevision: currentProfile.profileRevision,
  };
}

function sourceAtUtf8Bytes(target: number): string {
  const baseBytes = new TextEncoder().encode(SOURCE).byteLength;
  const replacementLength = "CleanRoom".length + target - baseBytes;
  if (replacementLength < 1) throw new Error("target-too-small");
  return SOURCE.replace("CleanRoom", "A".repeat(replacementLength));
}

function validRecord(): FormulaRecordV1 {
  return {
    schemaVersion: 1,
    formulaId: STANDARD_ID,
    scope: "standard",
    names: { en: "Clean Room" },
    facets: ["algebraic"],
    relations: [
      {
        kind: "related",
        targetFormulaId: identitiesManifest.formulas[1]
          .formulaId as FormulaIdV1,
        evidence: "shared public mathematical family",
      },
    ],
    provenance: { implementation: "project-authored" },
    rights: { canonicalSource: "MIT" },
  };
}

describe("formula-library-v1 neutral identity and frozen aliases", () => {
  it("accepts only lowercase v4/v5 Formula IDs and generates opaque v4 IDs", () => {
    expect(isFormulaIdV1(STANDARD_ID)).toBe(true);
    expect(isFormulaIdV1(MINE_ID)).toBe(true);
    expect(
      parseFormulaIdV1("11111111-1111-1111-8111-111111111111"),
    ).toBeUndefined();
    expect(parseFormulaIdV1(STANDARD_ID.toUpperCase())).toBeUndefined();
    expect(createMineFormulaIdV1(() => MINE_ID)).toBe(MINE_ID);
    expect(createCommunityFormulaIdV1(() => COMMUNITY_ID)).toBe(COMMUNITY_ID);
    expect(() => createMineFormulaIdV1(() => STANDARD_ID)).toThrow(
      "invalid-uuid-v4-generator",
    );
  });

  it("loads exactly 677 immutable Standard IDs and 797 typed aliases", () => {
    expect(STANDARD_MANIFEST_INDEX_V1.formulaIds).toHaveLength(677);
    expect(Object.isFrozen(STANDARD_MANIFEST_INDEX_V1.formulaIds)).toBe(true);
    expect(STANDARD_MANIFEST_INDEX_V1.aliasCount).toBe(797);
    expect(STANDARD_MANIFEST_INDEX_V1.counts).toEqual({
      f588: 588,
      "b94-canonical": 89,
      "b94-runtime-alias": 5,
      "runtime-id": 94,
      "guide-slug": 21,
    });
    const audit = auditStandardAliasesV1();
    expect(audit).toHaveLength(677);
    expect(audit.flatMap((entry) => entry.aliases)).toHaveLength(797);
    expect(
      audit.every(
        (entry) =>
          entry.aliases.filter(
            (alias) => alias.kind === "f588" || alias.kind === "b94-canonical",
          ).length === 1,
      ),
    ).toBe(true);
  });

  it("resolves all five namespaces without exposing mutable index maps", () => {
    for (const kind of [
      "f588",
      "b94-canonical",
      "b94-runtime-alias",
      "runtime-id",
      "guide-slug",
    ] as const) {
      const alias = aliasesManifest.aliases.find(
        (entry) => entry.kind === kind,
      );
      if (!alias) throw new Error(`missing-kind:${kind}`);
      expect(STANDARD_MANIFEST_INDEX_V1.resolveAlias(kind, alias.value)).toBe(
        alias.formulaId,
      );
    }
    expect(Object.keys(STANDARD_MANIFEST_INDEX_V1).sort()).toEqual([
      "aliasCount",
      "aliasesFor",
      "audit",
      "counts",
      "formulaIds",
      "hasFormulaId",
      "resolveAlias",
    ]);
  });

  it("fails closed on extra fields, duplicate aliases, and canonical ambiguity", () => {
    const privateField = structuredClone(identitiesManifest) as unknown as {
      formulas: Array<Record<string, unknown>>;
    };
    privateField.formulas[0].sourcePath = "forbidden";
    expect(
      createStandardManifestIndexV1(privateField, aliasesManifest),
    ).toEqual({
      ok: false,
      code: "invalid-standard-manifest",
    });

    const duplicate = structuredClone(aliasesManifest);
    duplicate.aliases[1] = { ...duplicate.aliases[0] };
    expect(
      createStandardManifestIndexV1(identitiesManifest, duplicate),
    ).toEqual({
      ok: false,
      code: "invalid-standard-manifest",
    });

    const ambiguous = structuredClone(aliasesManifest);
    const firstCanonical = ambiguous.aliases.findIndex(
      (entry) => entry.kind === "f588" || entry.kind === "b94-canonical",
    );
    const secondCanonical = ambiguous.aliases.findIndex(
      (entry, index) =>
        index > firstCanonical &&
        (entry.kind === "f588" || entry.kind === "b94-canonical"),
    );
    ambiguous.aliases[firstCanonical].formulaId =
      ambiguous.aliases[secondCanonical].formulaId;
    expect(
      createStandardManifestIndexV1(identitiesManifest, ambiguous),
    ).toEqual({
      ok: false,
      code: "invalid-standard-manifest",
    });
  });
});

describe("formula-library-v1 revision domains", () => {
  it("uses locale-independent canonical JSON and canonicalizes negative zero", () => {
    expect(canonicalJsonV1({ z: -0, a: [2, { y: true, x: "v" }] })).toBe(
      '{"a":[2,{"x":"v","y":true}],"z":0}',
    );
    expect(() => canonicalJsonV1({ value: Number.NaN })).toThrow(
      "invalid-canonical-json-number",
    );
    expect(() => canonicalJsonV1({ value: undefined })).toThrow(
      "invalid-canonical-json-value",
    );
    expect(() =>
      canonicalJsonV1({ value: String.fromCharCode(0xd800) }),
    ).toThrow("invalid-canonical-json-string");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalJsonV1(cyclic)).toThrow("cyclic-canonical-json");
    const accessor = Object.defineProperty({}, "value", {
      enumerable: true,
      get() {
        throw new Error("must-not-run");
      },
    });
    expect(() => canonicalJsonV1(accessor)).toThrow(
      "invalid-canonical-json-object-property",
    );
  });

  it("binds profileRevision to Formula ID, source revision, and visual state", async () => {
    const firstDefinition = await definition();
    const first = await profile(firstDefinition);
    const same = await profile(firstDefinition);
    const otherIdentity = await profile({
      ...firstDefinition,
      formulaId: UNKNOWN_V5,
    });
    const moved = await profile(firstDefinition, {
      view: { centerX: 1, centerY: 0, zoom: 1, rotation: 0 },
    });
    expect(first.profileRevision).toBe(same.profileRevision);
    expect(first.profileRevision).not.toBe(otherIdentity.profileRevision);
    expect(first.profileRevision).not.toBe(moved.profileRevision);
  });

  it("validates backend and combined revision shapes without loose strings", async () => {
    const currentDefinition = await definition();
    const currentProfile = await profile(currentDefinition);
    expect(isFormulaBackendRevisionV1(BACKEND_REVISION)).toBe(true);
    expect(
      isFormulaBackendRevisionV1({
        ...BACKEND_REVISION,
        buildId: "spaces are invalid",
      }),
    ).toBe(false);
    expect(
      isFormulaBackendRevisionV1({ ...BACKEND_REVISION, extra: true }),
    ).toBe(false);
    expect(
      isFormulaRevisionSetV1({
        sourceRevision: currentDefinition.sourceRevision,
        semanticHash: currentDefinition.semanticHash,
        profileRevision: currentProfile.profileRevision,
        backendRevision: BACKEND_REVISION,
      }),
    ).toBe(true);
  });
});

describe("formula-library-v1 Universal Safety Envelope", () => {
  it("accepts one canonical Definition and excludes identity/scope from safety input", async () => {
    const standard = await definition();
    const mine = await definition({ formulaId: MINE_ID, scope: "mine" });
    const community = await definition({
      formulaId: COMMUNITY_ID,
      scope: "community",
    });
    const projections = [standard, mine, community].map(
      projectExecutableFormulaDefinitionV1,
    );
    expect(projections[0]).toEqual(projections[1]);
    expect(projections[1]).toEqual(projections[2]);
    expect(Object.keys(projections[0])).not.toContain("formulaId");
    expect(Object.keys(projections[0])).not.toContain("scope");
    await expect(
      validateFormulaSafetyEnvelopeV1(projections[0]),
    ).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      validateFormulaSafetyEnvelopeV1(projections[1]),
    ).resolves.toMatchObject({
      ok: true,
    });
  });

  it("enforces the 65,536/65,537 UTF-8 boundary on valid canonical sources", async () => {
    const acceptedSource = sourceAtUtf8Bytes(65_536);
    expect(new TextEncoder().encode(acceptedSource)).toHaveLength(65_536);
    const accepted = await definition({ source: acceptedSource });
    await expect(
      validateFormulaSafetyEnvelopeV1(
        projectExecutableFormulaDefinitionV1(accepted),
      ),
    ).resolves.toMatchObject({ ok: true });
    expect(executableFormulaSourceFitsV1("é".repeat(32_768))).toBe(true);
    expect(executableFormulaSourceFitsV1(`${"é".repeat(32_768)}a`)).toBe(false);
    const tooLarge = {
      ...projectExecutableFormulaDefinitionV1(accepted),
      source: `${accepted.source}A`,
    };
    expect(new TextEncoder().encode(tooLarge.source)).toHaveLength(65_537);
    await expect(validateFormulaSafetyEnvelopeV1(tooLarge)).resolves.toEqual({
      ok: false,
      code: "source-too-large",
    });
  });

  it("rejects non-canonical source, schema drift, and independent hash tampering", async () => {
    const current = await definition();
    const commentedSource = `${SOURCE}\n; ordinary comment`;
    const commented = await definition({ source: commentedSource });
    await expect(
      validateFormulaSafetyEnvelopeV1(
        projectExecutableFormulaDefinitionV1(commented),
      ),
    ).resolves.toEqual({ ok: false, code: "source-not-canonical" });
    await expect(
      validateFormulaSafetyEnvelopeV1({
        ...projectExecutableFormulaDefinitionV1(current),
        parameters: [],
      }),
    ).resolves.toEqual({ ok: false, code: "parameter-schema-mismatch" });
    await expect(
      validateFormulaSafetyEnvelopeV1({
        ...projectExecutableFormulaDefinitionV1(current),
        sourceRevision: "0".repeat(64),
      }),
    ).resolves.toEqual({ ok: false, code: "source-revision-mismatch" });
    await expect(
      validateFormulaSafetyEnvelopeV1({
        ...projectExecutableFormulaDefinitionV1(current),
        semanticHash: "0".repeat(64),
      }),
    ).resolves.toEqual({ ok: false, code: "semantic-hash-mismatch" });
    await expect(
      validateFormulaSafetyEnvelopeV1({
        ...projectExecutableFormulaDefinitionV1(current),
        rights: "must not enter compiler safety input",
      }),
    ).resolves.toEqual({ ok: false, code: "invalid-definition" });
    const sparseCapabilities: string[] = [];
    sparseCapabilities.length = 1;
    await expect(
      validateFormulaSafetyEnvelopeV1({
        ...projectExecutableFormulaDefinitionV1(current),
        capabilities: sparseCapabilities,
      }),
    ).resolves.toEqual({ ok: false, code: "invalid-definition" });
    const accessor = Object.defineProperty(
      projectExecutableFormulaDefinitionV1(current),
      "source",
      {
        enumerable: true,
        get() {
          throw new Error("must-not-run");
        },
      },
    );
    await expect(validateFormulaSafetyEnvelopeV1(accessor)).resolves.toEqual({
      ok: false,
      code: "invalid-definition",
    });
  });
});

describe("formula-library-v1 asset ownership and Profile validation", () => {
  it("binds Definition identity to the requested ID and frozen Standard manifest", async () => {
    const current = await definition();
    expect(
      validateFormulaDefinitionIdentityV1(
        current,
        current.formulaId,
        STANDARD_MANIFEST_INDEX_V1,
      ),
    ).toMatchObject({ ok: true });
    expect(
      validateFormulaDefinitionIdentityV1(
        { ...current, formulaId: UNKNOWN_V5 },
        UNKNOWN_V5,
        STANDARD_MANIFEST_INDEX_V1,
      ),
    ).toEqual({ ok: false, code: "identity-mismatch" });
    expect(
      validateFormulaDefinitionIdentityV1(
        { ...current, sourcePath: "forbidden" },
        current.formulaId,
        STANDARD_MANIFEST_INDEX_V1,
      ),
    ).toEqual({ ok: false, code: "definition-invalid" });
  });

  it("validates exact Profile parameters, domains, visuals, and revision", async () => {
    const currentDefinition = await definition();
    const currentProfile = await profile(currentDefinition);
    await expect(
      validateFormulaProfileAssetV1(
        currentProfile,
        currentDefinition,
        currentProfile.profileRevision,
      ),
    ).resolves.toMatchObject({ ok: true });
    for (const invalid of [
      { ...currentProfile, parameters: { power: 20, transform: "sin" } },
      { ...currentProfile, parameters: { power: 2, transform: "atan2" } },
      {
        ...currentProfile,
        view: { ...currentProfile.view, centerX: Number.NaN },
      },
      { ...currentProfile, juliaC: [0, 0] },
      { ...currentProfile, source: SOURCE },
    ]) {
      await expect(
        validateFormulaProfileAssetV1(
          invalid,
          currentDefinition,
          currentProfile.profileRevision,
        ),
      ).resolves.toEqual({ ok: false, code: "profile-invalid" });
    }
    await expect(
      validateFormulaProfileAssetV1(
        currentProfile,
        currentDefinition,
        "0".repeat(64) as FormulaRevisionV1,
      ),
    ).resolves.toEqual({ ok: false, code: "profile-revision-mismatch" });
    await expect(
      validateFormulaProfileAssetV1(
        { ...currentProfile, sourceRevision: "0".repeat(64) },
        currentDefinition,
        currentProfile.profileRevision,
      ),
    ).resolves.toEqual({ ok: false, code: "source-revision-mismatch" });
    await expect(
      validateFormulaProfileAssetV1(
        { ...currentProfile, profileRevision: "0".repeat(64) },
        currentDefinition,
        "0".repeat(64) as FormulaRevisionV1,
      ),
    ).resolves.toEqual({ ok: false, code: "profile-revision-mismatch" });
  });

  it("ignores inherited optional Profile state under prototype pollution", async () => {
    const currentDefinition = await definition();
    Object.defineProperty(Object.prototype, "juliaC", {
      configurable: true,
      value: [7, 9],
    });
    try {
      const currentProfile = await profile(currentDefinition);
      expect(Object.hasOwn(currentProfile, "juliaC")).toBe(false);
      expect(profileRevisionProjectionV1(currentProfile)).not.toContain(
        "juliaC",
      );
      const validated = await validateFormulaProfileAssetV1(
        currentProfile,
        currentDefinition,
        currentProfile.profileRevision,
      );
      expect(validated).toMatchObject({ ok: true });
      if (validated.ok)
        expect(Object.hasOwn(validated.value, "juliaC")).toBe(false);
    } finally {
      delete (Object.prototype as Record<string, unknown>).juliaC;
    }
  });

  it("accepts editorial Records but rejects executable ownership drift", () => {
    const record = validRecord();
    expect(validateFormulaRecordOwnershipV1(record)).toBe(true);
    expect(
      validateFormulaRecordOwnershipV1({ ...record, source: SOURCE }),
    ).toBe(false);
    expect(
      validateFormulaRecordOwnershipV1({
        ...record,
        resolvedParameters: { power: 2 },
      }),
    ).toBe(false);
    const sparseRelations: FormulaRecordV1["relations"] = Array(1);
    expect(
      validateFormulaRecordOwnershipV1({
        ...record,
        relations: sparseRelations,
      }),
    ).toBe(false);
  });
});

describe("formula-library-v1 revision-pinned resolver seam", () => {
  it("uses the same resolver/compiler contract for Standard, Mine, and Community", async () => {
    for (const [scope, formulaId] of [
      ["standard", STANDARD_ID],
      ["mine", MINE_ID],
      ["community", COMMUNITY_ID],
    ] as const) {
      const currentDefinition = await definition({ scope, formulaId });
      const currentProfile = await profile(currentDefinition);
      const compilerInputs: FormulaCompilerInputV1[] = [];
      const resolved = await resolveFormulaV1(
        request(currentDefinition, currentProfile),
        {
          assets: {
            async getDefinition() {
              return currentDefinition;
            },
            async getProfile() {
              return currentProfile;
            },
          },
          compiler: {
            async compile(input) {
              compilerInputs.push(input);
              return {
                artifact: `compiled:${scope}`,
                backendRevision: BACKEND_REVISION,
              };
            },
          },
        },
      );
      expect(resolved).toMatchObject({
        ok: true,
        value: { formulaId, artifact: `compiled:${scope}` },
      });
      expect(Object.keys(compilerInputs[0]).sort()).toEqual([
        "definition",
        "ir",
        "profile",
      ]);
    }
  });

  it("snapshots validated assets before async store and compiler boundaries", async () => {
    const rawDefinition = await definition();
    const rawProfile = await profile(rawDefinition);
    const resolved = await resolveFormulaV1(
      request(rawDefinition, rawProfile),
      {
        assets: {
          async getDefinition() {
            return rawDefinition;
          },
          async getProfile() {
            (rawDefinition as { source: string }).source =
              "mutated-after-validation";
            return rawProfile;
          },
        },
        compiler: {
          async compile(input) {
            (rawProfile.view as { centerX: number }).centerX = 99;
            expect(input.definition.source).toBe(SOURCE);
            expect(input.profile.view.centerX).toBe(0);
            expect(Object.isFrozen(input.definition.parameters[0])).toBe(true);
            expect(Object.isFrozen(input.profile.view)).toBe(true);
            expect(Object.isFrozen(input.ir)).toBe(true);
            return { artifact: "compiled", backendRevision: BACKEND_REVISION };
          },
        },
      },
    );
    expect(resolved).toMatchObject({ ok: true });
  });

  it("resolves canonical and typed-alias references to one compiler input", async () => {
    const currentDefinition = await definition();
    const currentProfile = await profile(currentDefinition);
    const storeCalls: unknown[] = [];
    const compilerInputs: FormulaCompilerInputV1[] = [];
    const dependencies = {
      assets: {
        async getDefinition(formulaId: FormulaIdV1, sourceRevision: string) {
          storeCalls.push(["definition", formulaId, sourceRevision]);
          return currentDefinition;
        },
        async getProfile(
          formulaId: FormulaIdV1,
          sourceRevision: string,
          profileRevision: string,
        ) {
          storeCalls.push([
            "profile",
            formulaId,
            sourceRevision,
            profileRevision,
          ]);
          return currentProfile;
        },
      },
      compiler: {
        async compile(input: FormulaCompilerInputV1) {
          compilerInputs.push(input);
          return { artifact: "compiled", backendRevision: BACKEND_REVISION };
        },
      },
    };
    const canonical = await resolveFormulaV1(
      request(currentDefinition, currentProfile),
      dependencies,
    );
    expect(canonical).toMatchObject({
      ok: true,
      value: {
        formulaId: currentDefinition.formulaId,
        artifact: "compiled",
        runtimeArtifact: {
          backendRevision: BACKEND_REVISION,
          sourceRevision: currentDefinition.sourceRevision,
        },
      },
    });
    const alias = await resolveFormulaV1(
      request(currentDefinition, currentProfile, {
        kind: "legacy-alias",
        alias: { kind: "f588", value: "f588:3damand01" },
      }),
      dependencies,
    );
    expect(alias).toMatchObject({ ok: true });
    expect(storeCalls).toEqual([
      ["definition", STANDARD_ID, currentDefinition.sourceRevision],
      [
        "profile",
        STANDARD_ID,
        currentDefinition.sourceRevision,
        currentProfile.profileRevision,
      ],
      ["definition", STANDARD_ID, currentDefinition.sourceRevision],
      [
        "profile",
        STANDARD_ID,
        currentDefinition.sourceRevision,
        currentProfile.profileRevision,
      ],
    ]);
    expect(compilerInputs).toHaveLength(2);
    expect(Object.keys(compilerInputs[0]).sort()).toEqual([
      "definition",
      "ir",
      "profile",
    ]);
    expect(JSON.stringify(compilerInputs[0])).not.toContain("legacy-alias");
    expect(JSON.stringify(compilerInputs[0])).not.toContain("f588");
  });

  it("fail-closes reference, store, identity, profile, compiler, and backend errors", async () => {
    const currentDefinition = await definition();
    const currentProfile = await profile(currentDefinition);
    const baseDependencies = {
      assets: {
        async getDefinition() {
          return currentDefinition;
        },
        async getProfile() {
          return currentProfile;
        },
      },
      compiler: {
        async compile() {
          return { artifact: "compiled", backendRevision: BACKEND_REVISION };
        },
      },
    };
    const throwingRequest = new Proxy(
      request(currentDefinition, currentProfile),
      {
        getPrototypeOf() {
          throw new Error("trap");
        },
      },
    );
    await expect(
      resolveFormulaV1(throwingRequest, baseDependencies),
    ).resolves.toEqual({ ok: false, code: "invalid-reference" });
    await expect(
      resolveFormulaV1(request(currentDefinition, currentProfile), {
        ...baseDependencies,
        assets: {
          ...baseDependencies.assets,
          async getDefinition() {
            return new Proxy(currentDefinition, {
              getPrototypeOf() {
                throw new Error("trap");
              },
            });
          },
        },
      }),
    ).resolves.toEqual({ ok: false, code: "definition-invalid" });
    await expect(
      resolveFormulaV1(request(currentDefinition, currentProfile), {
        ...baseDependencies,
        assets: {
          ...baseDependencies.assets,
          async getProfile() {
            return new Proxy(currentProfile, {
              getPrototypeOf() {
                throw new Error("trap");
              },
            });
          },
        },
      }),
    ).resolves.toEqual({ ok: false, code: "profile-invalid" });
    await expect(
      resolveFormulaV1(
        request(currentDefinition, currentProfile, {
          kind: "legacy-alias",
          alias: { kind: "f588", value: "missing" },
        }),
        baseDependencies,
      ),
    ).resolves.toEqual({ ok: false, code: "unknown-alias" });
    await expect(
      resolveFormulaV1(
        request(currentDefinition, currentProfile, {
          kind: "canonical",
          formulaId: UNKNOWN_V5,
        }),
        baseDependencies,
      ),
    ).resolves.toEqual({ ok: false, code: "invalid-reference" });
    await expect(
      resolveFormulaV1(request(currentDefinition, currentProfile), {
        ...baseDependencies,
        assets: {
          ...baseDependencies.assets,
          async getDefinition() {
            throw new Error("offline");
          },
        },
      }),
    ).resolves.toEqual({ ok: false, code: "asset-store-failed" });
    await expect(
      resolveFormulaV1(request(currentDefinition, currentProfile), {
        ...baseDependencies,
        assets: {
          ...baseDependencies.assets,
          async getDefinition() {
            return undefined;
          },
        },
      }),
    ).resolves.toEqual({ ok: false, code: "definition-not-found" });
    await expect(
      resolveFormulaV1(request(currentDefinition, currentProfile), {
        ...baseDependencies,
        assets: {
          ...baseDependencies.assets,
          async getProfile() {
            return undefined;
          },
        },
      }),
    ).resolves.toEqual({ ok: false, code: "profile-not-found" });
    await expect(
      resolveFormulaV1(request(currentDefinition, currentProfile), {
        ...baseDependencies,
        compiler: {
          async compile() {
            throw new Error("compile failed");
          },
        },
      }),
    ).resolves.toEqual({ ok: false, code: "compiler-failed" });
    await expect(
      resolveFormulaV1(request(currentDefinition, currentProfile), {
        ...baseDependencies,
        compiler: {
          async compile() {
            return {
              artifact: "compiled",
              backendRevision: {
                ...BACKEND_REVISION,
                artifactSha256: "bad",
              } as FormulaBackendRevisionV1,
            };
          },
        },
      }),
    ).resolves.toEqual({ ok: false, code: "backend-revision-invalid" });
  });
});
