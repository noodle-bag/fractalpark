import {
  clonePortableJsonV1,
  readFractalDocumentV3,
  type FractalDocumentV3,
  type FormulaSnapshotV1,
} from "@/engine/document-v3";
import {
  readPortableFractalDocumentEnvelope,
  type FractalDocumentEnvelopeV2,
} from "@/engine/document-envelope-v2";
import { parseFrmLikeV1, hashFrmLikeV1 } from "@/engine/frm/v1";
import { FRM_BLOCKING_DIAGNOSTICS, scanFrmEntries } from "@/engine/frm/scanner";
import {
  createMineFormulaIdV1,
  isFormulaIdForScopeV1,
  type RandomUuidV4,
} from "./identity";
import {
  canonicalJsonV1,
  hashProfileRevisionV1,
  isFormulaRevisionV1,
} from "./revisions";
import {
  projectExecutableFormulaDefinitionV1,
  validateFormulaSafetyEnvelopeV1,
} from "./safety-envelope";
import {
  validateFormulaDefinitionIdentityV1,
  validateFormulaProfileAssetV1,
} from "./assets";
import { STANDARD_MANIFEST_INDEX_V1 } from "./standard-manifest";
import { PUBLICATION_DECISION_LEDGER_V1 } from "./publication-decisions";
import type {
  FormulaDefinitionV1,
  FormulaIdV1,
  FormulaProfileV1,
  FormulaRevisionV1,
} from "./types";

/** Production activation remains separately gated; portable writers start off. */
export const PORTABLE_V1_WRITER_DEFAULT_ENABLED = false;
export const PORTABLE_FORMULA_FILE_MAX_BYTES = 524_288;
export const PORTABLE_FRM_CONTAINER_MAX_BYTES = 1_048_576;

export type PortableFormulaLineageV1 = Readonly<{
  kind: "import" | "remix";
  formulaId: FormulaIdV1;
  sourceRevision: FormulaRevisionV1;
  profileRevision?: FormulaRevisionV1;
}>;

export interface PortableFormulaFileV1 {
  readonly schemaVersion: 1;
  readonly format: "fractal-formula";
  readonly definition: FormulaDefinitionV1;
  readonly profile?: FormulaProfileV1;
  readonly lineage: readonly PortableFormulaLineageV1[];
}

export interface ImportedMineFormulaV1 {
  readonly definition: FormulaDefinitionV1;
  readonly profile?: FormulaProfileV1;
  readonly lineage: readonly PortableFormulaLineageV1[];
}

export interface FrmContainerImportEntryV1 {
  readonly entryKey: string;
  readonly result: PortableV1Result<ImportedMineFormulaV1>;
}

export interface FormulaDraftHeadsV1 {
  readonly formulaId: FormulaIdV1;
  readonly editableHead:
    | Readonly<{
        kind: "runnable";
        definition: FormulaDefinitionV1;
        profile: FormulaProfileV1;
      }>
    | Readonly<{
        kind: "invalid";
        source: string;
        diagnostics: readonly string[];
      }>;
  readonly activeRunnableRevision: FormulaRevisionV1;
  readonly activeRunnable: Readonly<{
    definition: FormulaDefinitionV1;
    profile: FormulaProfileV1;
  }>;
}

export type PortableV1Result<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      code:
        | "writer-disabled"
        | "formula-not-published"
        | "invalid-format"
        | "definition-invalid"
        | "profile-invalid"
        | "document-invalid";
    }>;

function freeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== "object" || seen.has(value as object))
    return value;
  seen.add(value as object);
  for (const key of Reflect.ownKeys(value as object)) {
    const descriptor = Object.getOwnPropertyDescriptor(value as object, key);
    if (descriptor && "value" in descriptor) freeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    keys.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}

function isFormulaDefinition(value: unknown): value is FormulaDefinitionV1 {
  return (
    record(value) &&
    (value.scope === "standard" ||
      value.scope === "mine" ||
      value.scope === "community") &&
    isFormulaIdForScopeV1(value.scope, value.formulaId)
  );
}

async function validatedDefinition(
  value: unknown,
): Promise<FormulaDefinitionV1 | undefined> {
  let cloned: unknown;
  try {
    cloned = clonePortableJsonV1(value);
  } catch {
    return undefined;
  }
  if (!isFormulaDefinition(cloned)) return undefined;
  const identity = validateFormulaDefinitionIdentityV1(
    cloned,
    cloned.formulaId,
    STANDARD_MANIFEST_INDEX_V1,
  );
  if (!identity.ok) return undefined;
  const safety = await validateFormulaSafetyEnvelopeV1(
    projectExecutableFormulaDefinitionV1(cloned),
  );
  if (!safety.ok) return undefined;
  return freeze({
    formulaId: cloned.formulaId,
    scope: cloned.scope,
    ...safety.executable,
  });
}

async function validatedProfile(
  value: unknown,
  definition: FormulaDefinitionV1,
): Promise<FormulaProfileV1 | undefined> {
  if (value === undefined) return undefined;
  let cloned: unknown;
  try {
    cloned = clonePortableJsonV1(value);
  } catch {
    return undefined;
  }
  if (!record(cloned) || typeof cloned.profileRevision !== "string")
    return undefined;
  const profile = await validateFormulaProfileAssetV1(
    cloned,
    definition,
    cloned.profileRevision as FormulaRevisionV1,
  );
  return profile.ok ? profile.value : undefined;
}

function safePortableLineage(
  value: unknown,
): readonly PortableFormulaLineageV1[] {
  let cloned: unknown;
  try {
    cloned = clonePortableJsonV1(value);
  } catch {
    return freeze([]);
  }
  if (!Array.isArray(cloned)) return freeze([]);
  const copied: PortableFormulaLineageV1[] = [];
  for (const entry of cloned) {
    if (
      !record(entry) ||
      (entry.kind !== "import" && entry.kind !== "remix") ||
      (!isFormulaIdForScopeV1("mine", entry.formulaId) &&
        !isFormulaIdForScopeV1("standard", entry.formulaId) &&
        !isFormulaIdForScopeV1("community", entry.formulaId)) ||
      !isFormulaRevisionV1(entry.sourceRevision)
    )
      continue;
    const hasProfile = Object.hasOwn(entry, "profileRevision");
    if (hasProfile && !isFormulaRevisionV1(entry.profileRevision)) continue;
    copied.push({
      kind: entry.kind,
      formulaId: entry.formulaId,
      sourceRevision: entry.sourceRevision,
      ...(hasProfile
        ? { profileRevision: entry.profileRevision as FormulaRevisionV1 }
        : {}),
    });
  }
  return freeze(copied);
}

function safeLineage(
  kind: "import" | "remix",
  definition: FormulaDefinitionV1,
  profile?: FormulaProfileV1,
): readonly PortableFormulaLineageV1[] {
  return freeze([
    {
      kind,
      formulaId: definition.formulaId,
      sourceRevision: definition.sourceRevision,
      ...(profile ? { profileRevision: profile.profileRevision } : {}),
    },
  ]);
}

async function remapMineFormula(
  definition: FormulaDefinitionV1,
  profile: FormulaProfileV1 | undefined,
  randomUuid: RandomUuidV4 | undefined,
  lineageKind: "import" | "remix",
): Promise<ImportedMineFormulaV1> {
  const formulaId = createMineFormulaIdV1(randomUuid);
  const copiedDefinition = freeze({
    ...definition,
    formulaId,
    scope: "mine" as const,
  });
  let copiedProfile: FormulaProfileV1 | undefined;
  if (profile) {
    const candidate = {
      ...profile,
      formulaId,
      sourceRevision: copiedDefinition.sourceRevision,
    };
    copiedProfile = freeze({
      ...candidate,
      profileRevision: await hashProfileRevisionV1(candidate),
    });
  }
  return freeze({
    definition: copiedDefinition,
    ...(copiedProfile ? { profile: copiedProfile } : {}),
    lineage: safeLineage(lineageKind, definition, profile),
  });
}

function writerEnabled(options?: Readonly<{ enabled?: boolean }>): boolean {
  return options?.enabled === true;
}

function formulaCanBePublishedPortableV1(
  value: Readonly<{ scope: unknown; formulaId: unknown }>,
): boolean {
  if (value.scope !== "standard") return true;
  return (
    PUBLICATION_DECISION_LEDGER_V1.decisionFor(value.formulaId)
      ?.publicationDecision === "publish"
  );
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export async function writeFrmFormulaV1(
  definition: FormulaDefinitionV1,
  options?: Readonly<{ enabled?: boolean }>,
): Promise<PortableV1Result<string>> {
  if (!writerEnabled(options)) return { ok: false, code: "writer-disabled" };
  const validated = await validatedDefinition(definition);
  if (validated && !formulaCanBePublishedPortableV1(validated)) {
    return { ok: false, code: "formula-not-published" };
  }
  return validated
    ? { ok: true, value: validated.source }
    : { ok: false, code: "definition-invalid" };
}

export async function writeFractalFormulaV1(
  input: Readonly<{
    definition: FormulaDefinitionV1;
    profile?: FormulaProfileV1;
    lineage?: readonly PortableFormulaLineageV1[];
  }>,
  options?: Readonly<{ enabled?: boolean }>,
): Promise<PortableV1Result<string>> {
  if (!writerEnabled(options)) return { ok: false, code: "writer-disabled" };
  const definition = await validatedDefinition(input.definition);
  if (!definition) return { ok: false, code: "definition-invalid" };
  if (!formulaCanBePublishedPortableV1(definition)) {
    return { ok: false, code: "formula-not-published" };
  }
  const profile = await validatedProfile(input.profile, definition);
  if (input.profile !== undefined && !profile)
    return { ok: false, code: "profile-invalid" };
  const portable: PortableFormulaFileV1 = freeze({
    schemaVersion: 1,
    format: "fractal-formula",
    definition,
    ...(profile ? { profile } : {}),
    lineage: safePortableLineage(input.lineage),
  });
  return { ok: true, value: canonicalJsonV1(portable) };
}

async function parsePortableFormulaFile(
  input: string | unknown,
): Promise<PortableFormulaFileV1 | undefined> {
  let raw: unknown = input;
  if (typeof input === "string") {
    if (utf8Bytes(input) > PORTABLE_FORMULA_FILE_MAX_BYTES) return undefined;
    try {
      raw = JSON.parse(input);
    } catch {
      return undefined;
    }
  }
  try {
    raw = clonePortableJsonV1(raw);
  } catch {
    return undefined;
  }
  if (
    !record(raw) ||
    !exactKeys(raw, ["schemaVersion", "format", "definition", "lineage"])
  ) {
    if (
      !record(raw) ||
      !exactKeys(raw, [
        "schemaVersion",
        "format",
        "definition",
        "profile",
        "lineage",
      ])
    )
      return undefined;
  }
  if (
    raw.schemaVersion !== 1 ||
    raw.format !== "fractal-formula" ||
    !Array.isArray(raw.lineage)
  )
    return undefined;
  const definition = await validatedDefinition(raw.definition);
  if (!definition) return undefined;
  const profile = await validatedProfile(raw.profile, definition);
  if (Object.hasOwn(raw, "profile") && !profile) return undefined;
  // Incoming lineage is untrusted: imports retain one minimal direct fact only.
  return freeze({
    schemaVersion: 1,
    format: "fractal-formula",
    definition,
    ...(profile ? { profile } : {}),
    lineage: freeze([]),
  });
}

export async function importFractalFormulaV1(
  input: string | unknown,
  options?: Readonly<{ randomUuid?: RandomUuidV4 }>,
): Promise<PortableV1Result<ImportedMineFormulaV1>> {
  const portable = await parsePortableFormulaFile(input);
  if (!portable) return { ok: false, code: "definition-invalid" };
  return {
    ok: true,
    value: await remapMineFormula(
      portable.definition,
      portable.profile,
      options?.randomUuid,
      "import",
    ),
  };
}

export async function importFrmFormulaV1(
  source: string,
  options?: Readonly<{ randomUuid?: RandomUuidV4 }>,
): Promise<PortableV1Result<ImportedMineFormulaV1>> {
  const parsed = parseFrmLikeV1(source);
  if (!parsed.ok) return { ok: false, code: "definition-invalid" };
  const hashes = await hashFrmLikeV1(source, parsed.ir);
  const provisional = {
    schemaVersion: 1,
    formulaId: createMineFormulaIdV1(options?.randomUuid),
    scope: "mine" as const,
    source,
    sourceRevision: hashes.sourceRevision,
    semanticHash: hashes.semanticHash,
    languageVersion: "frm-like/1" as const,
    stdlibVersion: 1 as const,
    supportedNumericProfiles: ["standard32"] as ["standard32"],
    parameters: parsed.ir.parameters,
    programModel: "orbit" as const,
    termination: {
      predicateMeaning: "continue-iteration" as const,
      nonFinite: "terminate-with-event" as const,
      maximumIterations: "profile-resolved" as const,
    },
    channels: [],
    capabilities: [],
  };
  const definition = await validatedDefinition(provisional);
  return definition
    ? { ok: true, value: freeze({ definition, lineage: freeze([]) }) }
    : { ok: false, code: "definition-invalid" };
}

export async function importFrmContainerV1(
  source: string,
  options?: Readonly<{
    selectedKeys?: readonly string[];
    randomUuid?: RandomUuidV4;
  }>,
): Promise<PortableV1Result<readonly FrmContainerImportEntryV1[]>> {
  if (utf8Bytes(source) > PORTABLE_FRM_CONTAINER_MAX_BYTES) {
    return { ok: false, code: "invalid-format" };
  }
  const scan = scanFrmEntries(source);
  if (
    scan.entries.length === 0 ||
    scan.diagnostics.some((diagnostic) =>
      FRM_BLOCKING_DIAGNOSTICS.has(diagnostic.code),
    )
  ) {
    return { ok: false, code: "invalid-format" };
  }
  const selectedKeys =
    options?.selectedKeys ??
    (scan.entries.length === 1 ? [scan.entries[0].key] : undefined);
  if (!selectedKeys || selectedKeys.length === 0) {
    return { ok: false, code: "invalid-format" };
  }
  const byKey = new Map(scan.entries.map((entry) => [entry.key, entry]));
  if (new Set(selectedKeys).size !== selectedKeys.length) {
    return { ok: false, code: "invalid-format" };
  }
  const directiveLines = source
    .split(/\r?\n/)
    .filter((line) => /^; @(language|stdlib|numeric-profile):/.test(line));
  if (directiveLines.length !== 3) {
    return { ok: false, code: "invalid-format" };
  }
  const directiveBlock = directiveLines.join("\n");
  const imported: FrmContainerImportEntryV1[] = [];
  for (const key of selectedKeys) {
    const entry = byKey.get(key);
    if (!entry) return { ok: false, code: "invalid-format" };
    const entrySource = `${directiveBlock}\n${source.slice(
      entry.range.startOffset,
      entry.range.endOffset,
    )}`;
    imported.push({
      entryKey: key,
      result: await importFrmFormulaV1(entrySource, {
        randomUuid: options?.randomUuid,
      }),
    });
  }
  return { ok: true, value: freeze(imported) };
}

export async function remixFormulaV1(
  input: Readonly<{
    definition: FormulaDefinitionV1;
    profile: FormulaProfileV1;
    randomUuid?: RandomUuidV4;
  }>,
): Promise<PortableV1Result<ImportedMineFormulaV1>> {
  const definition = await validatedDefinition(input.definition);
  if (!definition) return { ok: false, code: "definition-invalid" };
  const profile = await validatedProfile(input.profile, definition);
  if (!profile) return { ok: false, code: "profile-invalid" };
  return {
    ok: true,
    value: await remapMineFormula(
      definition,
      profile,
      input.randomUuid,
      "remix",
    ),
  };
}

export async function createFormulaDraftHeadsV1(
  definition: FormulaDefinitionV1,
  profile: FormulaProfileV1,
): Promise<PortableV1Result<FormulaDraftHeadsV1>> {
  const checkedDefinition = await validatedDefinition(definition);
  if (!checkedDefinition) return { ok: false, code: "definition-invalid" };
  const checkedProfile = await validatedProfile(profile, checkedDefinition);
  if (!checkedProfile) return { ok: false, code: "profile-invalid" };
  return {
    ok: true,
    value: freeze({
      formulaId: checkedDefinition.formulaId,
      editableHead: {
        kind: "runnable",
        definition: checkedDefinition,
        profile: checkedProfile,
      },
      activeRunnableRevision: checkedDefinition.sourceRevision,
      activeRunnable: {
        definition: checkedDefinition,
        profile: checkedProfile,
      },
    }),
  };
}

export async function saveFormulaDraftHeadV1(
  current: FormulaDraftHeadsV1,
  candidate: Readonly<{
    definition?: FormulaDefinitionV1;
    profile?: FormulaProfileV1;
    source?: string;
  }>,
): Promise<PortableV1Result<FormulaDraftHeadsV1>> {
  let currentClone: unknown;
  let candidateClone: unknown;
  try {
    currentClone = clonePortableJsonV1(current);
    candidateClone = clonePortableJsonV1(candidate);
  } catch {
    return { ok: false, code: "definition-invalid" };
  }
  if (!record(currentClone) || !record(candidateClone)) {
    return { ok: false, code: "definition-invalid" };
  }
  const safeCurrent = currentClone as unknown as FormulaDraftHeadsV1;
  const safeCandidate = candidateClone as Readonly<{
    definition?: FormulaDefinitionV1;
    profile?: FormulaProfileV1;
    source?: string;
  }>;
  const activeDefinition = await validatedDefinition(
    safeCurrent.activeRunnable?.definition,
  );
  if (
    !activeDefinition ||
    activeDefinition.formulaId !== safeCurrent.formulaId
  ) {
    return { ok: false, code: "definition-invalid" };
  }
  const activeProfile = await validatedProfile(
    safeCurrent.activeRunnable?.profile,
    activeDefinition,
  );
  if (
    !activeProfile ||
    safeCurrent.activeRunnableRevision !== activeDefinition.sourceRevision
  ) {
    return { ok: false, code: "profile-invalid" };
  }
  const definition =
    safeCandidate.definition &&
    (await validatedDefinition(safeCandidate.definition));
  const profile =
    definition &&
    safeCandidate.profile &&
    (await validatedProfile(safeCandidate.profile, definition));
  if (definition && profile && definition.formulaId === safeCurrent.formulaId) {
    return {
      ok: true,
      value: freeze({
        formulaId: safeCurrent.formulaId,
        editableHead: { kind: "runnable", definition, profile },
        activeRunnableRevision: definition.sourceRevision,
        activeRunnable: { definition, profile },
      }),
    };
  }
  const source =
    typeof safeCandidate.source === "string"
      ? safeCandidate.source
      : (safeCandidate.definition?.source ?? "");
  if (utf8Bytes(source) > 65_536) {
    return { ok: false, code: "definition-invalid" };
  }
  return {
    ok: true,
    value: freeze({
      formulaId: safeCurrent.formulaId,
      editableHead: {
        kind: "invalid",
        source,
        diagnostics: freeze(["definition-invalid"]),
      },
      activeRunnableRevision: activeDefinition.sourceRevision,
      activeRunnable: {
        definition: activeDefinition,
        profile: activeProfile,
      },
    }),
  };
}

export async function writeFractalWorkV3(
  document: FractalDocumentV3,
  options?: Readonly<{ enabled?: boolean }>,
): Promise<PortableV1Result<string>> {
  if (!writerEnabled(options)) return { ok: false, code: "writer-disabled" };
  const result = await readFractalDocumentV3(document);
  if (
    result.mode === "readable-v3" &&
    !formulaCanBePublishedPortableV1(result.snapshot)
  ) {
    return { ok: false, code: "formula-not-published" };
  }
  return result.mode === "readable-v3"
    ? { ok: true, value: canonicalJsonV1(result.document) }
    : { ok: false, code: "document-invalid" };
}

export async function writeFractalWorkEnvelopeV2(
  envelope: FractalDocumentEnvelopeV2,
  options?: Readonly<{ enabled?: boolean }>,
): Promise<PortableV1Result<string>> {
  if (!writerEnabled(options)) return { ok: false, code: "writer-disabled" };
  const result = await readPortableFractalDocumentEnvelope(envelope);
  if (
    result.mode === "readable-v2" &&
    !formulaCanBePublishedPortableV1(result.snapshot)
  ) {
    return { ok: false, code: "formula-not-published" };
  }
  return result.mode === "readable-v2"
    ? { ok: true, value: canonicalJsonV1(result.envelope) }
    : { ok: false, code: "document-invalid" };
}

export async function importFractalWorkV3(input: string | unknown): Promise<
  PortableV1Result<
    Readonly<{
      createdFormula: false;
      snapshot: FormulaSnapshotV1;
    }>
  >
> {
  let raw: unknown = input;
  if (typeof input === "string") {
    if (utf8Bytes(input) > 2_097_152)
      return { ok: false, code: "invalid-format" };
    try {
      raw = JSON.parse(input);
    } catch {
      return { ok: false, code: "invalid-format" };
    }
  }
  const envelope = await readPortableFractalDocumentEnvelope(raw);
  if (envelope.mode === "readable-v2")
    return {
      ok: true,
      value: freeze({ createdFormula: false, snapshot: envelope.snapshot }),
    };
  const document = await readFractalDocumentV3(raw);
  if (document.mode === "readable-v3")
    return {
      ok: true,
      value: freeze({ createdFormula: false, snapshot: document.snapshot }),
    };
  return { ok: false, code: "document-invalid" };
}
