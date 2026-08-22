import {
  TEACHING_ANCHORS_RAW_V1,
  TEACHING_APPROVAL_PACKET_RAW_V1,
  TEACHING_APPROVAL_RAW_V1,
  TEACHING_AUTHORITY_REBIND_RAW_V1,
  TEACHING_CONTENT_LOCALES_V1,
  TEACHING_CONTENT_REGISTRY_V1,
  TEACHING_LEDGER_RAW_V1,
  TEACHING_RUNTIME_INDEX_RAW_V1,
  TEACHING_SELECTION_BINDINGS_V1,
  TEACHING_SELECTION_RAW_V1,
  type TeachingContentRegistryV1,
} from '@/content/teaching/generated-content-registry';
import {
  contentHashV1,
  resolveTeachingDeliveryPolicyV1,
  validateEnglishTeachingUnitV1,
  validateLocaleTeachingUnitV1,
  validateReviewContentLinkV1,
  validateReviewEventsV1,
  type ReviewEventV1,
  type TeachingBindingV1,
  type TeachingDeliveryPolicyV1,
} from '@/content/teaching/contracts';
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from '@/engine/formulas/v1/revisions';

type JsonRecord = Record<string, unknown>;

const APPROVED_TEACHING_SELECTION_ROWS_SHA256 =
  '36b4e813c39362651f21794273ef40c2c85dd5c697f05f594690859ebcb1fca9';
const APPROVED_TEACHING_SEMANTIC_ANCHOR_ROWS_SHA256 =
  '67d9b351024c2e70adca7293348315fc0b1514a3e3dfde36ac904fd4d3da32d2';

export interface EnglishTeachingContentV1 extends JsonRecord {
  readonly schema: 'fractalpark-teaching-en-fact/v1';
  readonly formulaId: string;
  readonly sourceRevision: string;
  readonly semanticHash: string;
  readonly overview: string;
  readonly mathDisclosure: string;
  readonly mathSummary?: string;
  readonly sourceWalkthrough: ReadonlyArray<
    Readonly<{ annotationId: string; nodeId: string; explanation: string }>
  >;
  readonly syntaxFeatures: ReadonlyArray<
    Readonly<{ featureId: string; annotationIds: readonly string[]; explanation: string }>
  >;
  readonly parameterExperiment: Readonly<{
    parameterSymbols: readonly string[];
    steps: readonly string[];
    expectedObservation: string;
    safetyNote?: string;
  }>;
  readonly exercise: Readonly<{
    prompt: string;
    completionCheck: string;
    answerDisclosure: string;
  }>;
  readonly facts: Readonly<{
    provenanceStatement: string;
    rightsStatement: string;
    sourceIds: readonly string[];
    licenseIds: readonly string[];
    claims: ReadonlyArray<Readonly<{ text: string; sourceIds: readonly string[] }>>;
  }>;
}

export interface LocalizedTeachingContentV1 extends JsonRecord {
  readonly schema: 'fractalpark-teaching-locale/v1';
  readonly formulaId: string;
  readonly locale: string;
  readonly sourceRevision: string;
  readonly semanticHash: string;
  readonly englishContentHash: string;
  readonly localizedName?: string;
  readonly overview: string;
  readonly sourceWalkthrough: Readonly<Record<string, string>>;
  readonly syntaxFeatures: Readonly<Record<string, string>>;
  readonly parameterExperiment: Readonly<{
    steps: readonly string[];
    expectedObservation: string;
    safetyNote?: string;
  }>;
  readonly exercise: Readonly<{
    prompt: string;
    completionCheck: string;
    hint?: string;
  }>;
  readonly factsPresentation: Readonly<{
    provenanceLead: string;
    rightsLead: string;
  }>;
  readonly contentHash: string;
}

export interface TeachingContentAssetsV1 {
  readonly selection: unknown;
  readonly selectionRaw: string;
  readonly anchors: unknown;
  readonly anchorsRaw: string;
  readonly runtimeIndex: unknown;
  readonly runtimeIndexRaw: string;
  readonly ledger: unknown;
  readonly ledgerRaw: string;
  readonly approval: unknown;
  readonly approvalRaw: string;
  readonly approvalPacket: unknown;
  readonly approvalPacketRaw: string;
  readonly authorityRebind: unknown;
  readonly authorityRebindRaw: string;
  readonly registry: TeachingContentRegistryV1;
}

type DeliveredTeachingContentV1 = TeachingDeliveryPolicyV1 &
  Readonly<{
    delivery: 'delivered';
    requestedLocale: string;
    contentLocale: string;
    english: EnglishTeachingContentV1;
    localized: LocalizedTeachingContentV1 | null;
    fallbackReason: null;
  }>;

type FallbackTeachingContentV1 = TeachingDeliveryPolicyV1 &
  Readonly<{
    delivery: 'fallback-browse-only';
    requestedLocale: string;
    contentLocale: 'en';
    english: EnglishTeachingContentV1;
    fallbackReason: 'localized-content-unavailable';
  }>;

type MissingTeachingContentV1 = TeachingDeliveryPolicyV1 &
  Readonly<{
    delivery: 'not-delivered';
    requestedLocale: string;
    contentLocale: null;
    failureCode:
      | 'unsupported-locale'
      | 'formula-not-selected'
      | 'binding-invalid'
      | 'english-content-unavailable';
  }>;

export type TeachingContentResolutionV1 =
  | DeliveredTeachingContentV1
  | FallbackTeachingContentV1
  | MissingTeachingContentV1;

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rows(value: unknown): readonly unknown[] | undefined {
  return record(value) && Array.isArray(value.rows) ? value.rows : undefined;
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function uniqueFormulaRecord(
  candidates: readonly unknown[],
  formulaId: string,
): JsonRecord | undefined {
  const matches = candidates.filter(
    (candidate): candidate is JsonRecord =>
      record(candidate) && candidate.formulaId === formulaId,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach((child) => deepFreeze(child));
    return Object.freeze(value);
  }
  if (record(value)) {
    Object.values(value).forEach((child) => deepFreeze(child));
    return Object.freeze(value);
  }
  return value;
}

function rawAuthorityMatches(raw: string, parsed: unknown): boolean {
  try {
    return JSON.stringify(JSON.parse(raw)) === JSON.stringify(parsed);
  } catch {
    return false;
  }
}

interface ApprovalAuthorityV1 {
  readonly evidenceRef: string;
  readonly actorId: string;
  readonly actorKind: 'human-maintainer';
  readonly actorRole: 'maintainer';
  readonly approvedAt: string;
}

function validateAuthorityRebind(
  rebindValue: unknown,
  selectionValue: unknown,
  anchorsValue: unknown,
  selectionSha256: string,
  anchorsSha256: string,
  approvalSha256: string,
  packetSha256: string,
): Readonly<{
  priorSelectionSha256: string;
  priorAnchorsSha256: string;
}> | undefined {
  if (!record(rebindValue) || !record(selectionValue) || !record(anchorsValue)) {
    return undefined;
  }
  const pins = record(selectionValue.pins) ? selectionValue.pins : undefined;
  const changedPins = record(rebindValue.changedPins)
    ? rebindValue.changedPins
    : undefined;
  const bytePin = changedPins && record(changedPins.runtimeIndexSha256)
    ? changedPins.runtimeIndexSha256
    : undefined;
  const canonicalPin =
    changedPins && record(changedPins.runtimeIndexCanonicalSha256)
      ? changedPins.runtimeIndexCanonicalSha256
      : undefined;
  const invariants = record(rebindValue.invariants)
    ? rebindValue.invariants
    : undefined;
  const scope = record(rebindValue.scope) ? rebindValue.scope : undefined;
  const selectionRows = Array.isArray(selectionValue.rows)
    ? selectionValue.rows
    : undefined;
  const anchorRows = Array.isArray(anchorsValue.rows)
    ? anchorsValue.rows
    : undefined;
  const selectionRowsSha256 = selectionRows
    ? sha256HexSyncV1(canonicalJsonV1(selectionRows, 131_072))
    : undefined;
  const anchorRowsSha256 = anchorRows
    ? sha256HexSyncV1(canonicalJsonV1(anchorRows, 2_000_000))
    : undefined;
  if (
    !exactKeys(rebindValue, [
      'schema',
      'status',
      'approvedAt',
      'actorId',
      'actorKind',
      'actorRole',
      'maintainerResponse',
      'approvalStatement',
      'priorApprovalSha256',
      'priorApprovalPacketSha256',
      'priorSelectionSha256',
      'reboundSelectionSha256',
      'selectionRowsCanonicalSha256',
      'priorSemanticAnchorsSha256',
      'reboundSemanticAnchorsSha256',
      'semanticAnchorRowsCanonicalSha256',
      'changedPins',
      'invariants',
      'scope',
    ]) ||
    rebindValue.schema !==
      'fractalpark-teaching-maintainer-authority-rebind/v1' ||
    rebindValue.status !== 'maintainer-approved' ||
    typeof rebindValue.approvedAt !== 'string' ||
    !Number.isFinite(Date.parse(rebindValue.approvedAt)) ||
    rebindValue.actorId !== 'fractalpark-maintainer' ||
    rebindValue.actorKind !== 'human-maintainer' ||
    rebindValue.actorRole !== 'maintainer' ||
    rebindValue.maintainerResponse !==
      '批准这次仅限派生哈希的 authority rebind（建议）' ||
    rebindValue.priorApprovalSha256 !== approvalSha256 ||
    rebindValue.priorApprovalPacketSha256 !== packetSha256 ||
    rebindValue.reboundSelectionSha256 !== selectionSha256 ||
    typeof rebindValue.priorSelectionSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(rebindValue.priorSelectionSha256) ||
    !selectionRows ||
    rebindValue.selectionRowsCanonicalSha256 !==
      APPROVED_TEACHING_SELECTION_ROWS_SHA256 ||
    selectionRowsSha256 !== APPROVED_TEACHING_SELECTION_ROWS_SHA256 ||
    typeof rebindValue.priorSemanticAnchorsSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(rebindValue.priorSemanticAnchorsSha256) ||
    rebindValue.reboundSemanticAnchorsSha256 !== anchorsSha256 ||
    !anchorRows ||
    rebindValue.semanticAnchorRowsCanonicalSha256 !==
      APPROVED_TEACHING_SEMANTIC_ANCHOR_ROWS_SHA256 ||
    anchorRowsSha256 !== APPROVED_TEACHING_SEMANTIC_ANCHOR_ROWS_SHA256 ||
    !pins ||
    !bytePin ||
    !canonicalPin ||
    !exactKeys(bytePin, ['before', 'after']) ||
    !exactKeys(canonicalPin, ['before', 'after']) ||
    bytePin.before !==
      '1b27e129a102c0d64774bce7112be41de102028743cbcf440ba12bb45d906ff8' ||
    bytePin.after !== pins.runtimeIndexSha256 ||
    canonicalPin.before !==
      '1c543581ce6569d9c43e1e9505020dc51088f51e54cb3f2fa9e814b020bb710f' ||
    canonicalPin.after !== pins.runtimeIndexCanonicalSha256 ||
    !invariants ||
    !exactKeys(invariants, [
      'formulaCount',
      'contentUnitCount',
      'localeCount',
      'selectionRowsChanged',
      'semanticAnchorRowsChanged',
      'teachingContentChanged',
      'publicationCountsChanged',
      'publishedCount',
      'heldCount',
    ]) ||
    invariants.formulaCount !== 50 ||
    invariants.contentUnitCount !== 350 ||
    invariants.localeCount !== 7 ||
    invariants.selectionRowsChanged !== false ||
    invariants.semanticAnchorRowsChanged !== false ||
    invariants.teachingContentChanged !== false ||
    invariants.publicationCountsChanged !== false ||
    invariants.publishedCount !== 513 ||
    invariants.heldCount !== 164 ||
    !scope ||
    !Array.isArray(scope.allows) ||
    !scope.allows.includes(
      'rebind the unchanged 50-row teaching selection and semantic-anchor rows to the recorded runtime index hashes',
    ) ||
    !Array.isArray(scope.doesNotAllow) ||
    !scope.doesNotAllow.includes(
      'modify teaching content, selection rows, or semantic-anchor rows',
    ) ||
    !scope.doesNotAllow.includes('change formula publication decisions') ||
    !scope.doesNotAllow.includes('merge or auto-merge') ||
    !scope.doesNotAllow.includes('deploy or promote Production')
  ) {
    return undefined;
  }
  return {
    priorSelectionSha256: rebindValue.priorSelectionSha256,
    priorAnchorsSha256: rebindValue.priorSemanticAnchorsSha256,
  };
}

function validateApprovalAuthority(
  approvalValue: unknown,
  packetValue: unknown,
  rebindValue: unknown,
  selectionValue: unknown,
  anchorsValue: unknown,
  expectedFormulaIds: readonly string[],
  selectionSha256: string,
  anchorsSha256: string,
  packetSha256: string,
  approvalSha256: string,
): ApprovalAuthorityV1 | undefined {
  if (!record(approvalValue) || !record(packetValue)) return undefined;
  const rebind = validateAuthorityRebind(
    rebindValue,
    selectionValue,
    anchorsValue,
    selectionSha256,
    anchorsSha256,
    approvalSha256,
    packetSha256,
  );
  if (!rebind) return undefined;
  const scope = record(approvalValue.scope) ? approvalValue.scope : undefined;
  const packetScope = record(packetValue.approvalScope)
    ? packetValue.approvalScope
    : undefined;
  const qualityGates = record(packetValue.qualityGates)
    ? packetValue.qualityGates
    : undefined;
  if (
    !exactKeys(approvalValue, [
      'schema',
      'status',
      'approvedAt',
      'actorId',
      'actorKind',
      'actorRole',
      'approvalPacketSha256',
      'approvalStatement',
      'maintainerResponse',
      'aiAssistanceDisclosure',
      'selectionSha256',
      'semanticAnchorsSha256',
      'scope',
    ]) ||
    approvalValue.schema !== 'fractalpark-teaching-maintainer-approval/v1' ||
    approvalValue.status !== 'maintainer-approved' ||
    typeof approvalValue.approvedAt !== 'string' ||
    !Number.isFinite(Date.parse(approvalValue.approvedAt)) ||
    typeof approvalValue.actorId !== 'string' ||
    approvalValue.actorKind !== 'human-maintainer' ||
    approvalValue.actorRole !== 'maintainer' ||
    approvalValue.maintainerResponse !== '同意' ||
    approvalValue.approvalPacketSha256 !== packetSha256 ||
    approvalValue.selectionSha256 !== rebind.priorSelectionSha256 ||
    approvalValue.semanticAnchorsSha256 !== rebind.priorAnchorsSha256 ||
    !scope ||
    !Array.isArray(scope.allows) ||
    !scope.allows.includes(
      'continue Commit 20d and planned Commit 21 under their existing contracts',
    ) ||
    !Array.isArray(scope.doesNotAllow) ||
    !scope.doesNotAllow.includes('merge or auto-merge') ||
    !scope.doesNotAllow.includes('deploy or promote Production') ||
    packetValue.schema !==
      'fractalpark-teaching-maintainer-approval-packet/v1' ||
    packetValue.status !== 'maintainer-pending' ||
    packetValue.selectionSha256 !== rebind.priorSelectionSha256 ||
    packetValue.semanticAnchorsSha256 !== rebind.priorAnchorsSha256 ||
    packetValue.formulaCount !== 50 ||
    packetValue.localeCount !== 7 ||
    packetValue.contentUnitCount !== 350 ||
    JSON.stringify(packetValue.locales) !==
      JSON.stringify(TEACHING_CONTENT_LOCALES_V1) ||
    !qualityGates ||
    qualityGates.compiler !== 'PASS' ||
    qualityGates.duplicateGroups !== 0 ||
    qualityGates.localeFlags !== 0 ||
    qualityGates.heldGuideCount !== 4 ||
    qualityGates.heldRuntimeIdentityCount !== 22 ||
    !packetScope ||
    !Array.isArray(packetScope.allows) ||
    !packetScope.allows.includes(
      'continue to planned commit 20d and 21 under existing constraints',
    ) ||
    !Array.isArray(packetScope.doesNotAllow) ||
    !packetScope.doesNotAllow.includes('merge or auto-merge') ||
    !packetScope.doesNotAllow.includes('deploy or promote Production') ||
    !Array.isArray(packetValue.batches) ||
    packetValue.batches.length !== 5
  ) {
    return undefined;
  }
  const packetFormulaIds: string[] = [];
  for (const [index, candidate] of packetValue.batches.entries()) {
    if (
      !record(candidate) ||
      candidate.batch !== index + 1 ||
      candidate.formulaCount !== 10 ||
      candidate.contentUnitCount !== 70 ||
      typeof candidate.candidateSha256 !== 'string' ||
      typeof candidate.reviewManifestSha256 !== 'string' ||
      typeof candidate.sourcePacketSha256 !== 'string' ||
      !Array.isArray(candidate.formulaIds) ||
      candidate.formulaIds.length !== 10 ||
      !candidate.formulaIds.every((value) => typeof value === 'string') ||
      !Array.isArray(candidate.displayNames) ||
      candidate.displayNames.length !== 10 ||
      !Array.isArray(candidate.reviewers) ||
      candidate.reviewers.length !== 2 ||
      ![
        candidate.candidateSha256,
        candidate.reviewManifestSha256,
        candidate.sourcePacketSha256,
      ].every((value) => /^[a-f0-9]{64}$/.test(value)) ||
      JSON.stringify(candidate.formulaIds) !==
        JSON.stringify(expectedFormulaIds.slice(index * 10, index * 10 + 10)) ||
      new Set(
        candidate.reviewers.map((reviewer) =>
          record(reviewer) ? reviewer.provider : undefined,
        ),
      ).size !== 2 ||
      !candidate.reviewers.every(
        (reviewer) =>
          record(reviewer) &&
          (reviewer.provider === 'deepseek' || reviewer.provider === 'kimi') &&
          typeof reviewer.reviewSha256 === 'string' &&
          /^[a-f0-9]{64}$/.test(reviewer.reviewSha256),
      )
    ) {
      return undefined;
    }
    packetFormulaIds.push(...(candidate.formulaIds as string[]));
  }
  if (JSON.stringify(packetFormulaIds) !== JSON.stringify(expectedFormulaIds)) {
    return undefined;
  }
  return {
    evidenceRef:
      'resources/formula-library/v1/teaching-review-evidence/' +
      `maintainer-approval.v1.json#sha256=${approvalSha256}`,
    actorId: approvalValue.actorId,
    actorKind: 'human-maintainer',
    actorRole: 'maintainer',
    approvedAt: approvalValue.approvedAt,
  };
}

function missing(
  requestedLocale: string,
  failureCode: MissingTeachingContentV1['failureCode'],
): MissingTeachingContentV1 {
  return {
    ...resolveTeachingDeliveryPolicyV1({
      requestedLocale,
      englishApproved: false,
      localizedApproved: false,
      bindingsValid: false,
      ledgerMatchesUnit: false,
    }),
    delivery: 'not-delivered',
    requestedLocale,
    contentLocale: null,
    failureCode,
  };
}

interface GlobalTeachingContextV1 {
  readonly bindings: ReadonlyMap<string, TeachingBindingV1>;
  readonly ledgerUnits: ReadonlyMap<string, JsonRecord>;
  readonly maintainers: ReadonlySet<string>;
  readonly runtimeFormulaIds: readonly string[];
  readonly approval: Readonly<{
    evidenceRef: string;
    actorId: string;
    actorKind: 'human-maintainer';
    actorRole: 'maintainer';
    approvedAt: string;
  }>;
}

function buildGlobalContextUnchecked(
  assets: TeachingContentAssetsV1,
): GlobalTeachingContextV1 | undefined {
  if (
    !rawAuthorityMatches(assets.selectionRaw, assets.selection) ||
    !rawAuthorityMatches(assets.anchorsRaw, assets.anchors) ||
    !rawAuthorityMatches(assets.runtimeIndexRaw, assets.runtimeIndex) ||
    !rawAuthorityMatches(assets.ledgerRaw, assets.ledger) ||
    !rawAuthorityMatches(assets.approvalRaw, assets.approval) ||
    !rawAuthorityMatches(assets.approvalPacketRaw, assets.approvalPacket) ||
    !rawAuthorityMatches(assets.authorityRebindRaw, assets.authorityRebind)
  ) {
    return undefined;
  }
  const selection = record(assets.selection) ? assets.selection : undefined;
  const anchors = record(assets.anchors) ? assets.anchors : undefined;
  const runtimeIndex = record(assets.runtimeIndex) ? assets.runtimeIndex : undefined;
  const ledger = record(assets.ledger) ? assets.ledger : undefined;
  const registry = record(assets.registry as unknown)
    ? (assets.registry as unknown as JsonRecord)
    : undefined;
  const selectionRows = rows(selection);
  const anchorRows = rows(anchors);
  const runtimeRows = rows(runtimeIndex);
  const runtimeFormulaIds = runtimeRows?.map((candidate) =>
    record(candidate) ? candidate.formulaId : undefined,
  );
  const ledgerUnits = ledger && Array.isArray(ledger.units) ? ledger.units : undefined;
  const expectedIds = TEACHING_SELECTION_BINDINGS_V1.map((row) => row.formulaId);
  const expectedIdSet = new Set(expectedIds);
  const selectionSha256 = sha256HexSyncV1(assets.selectionRaw);
  const anchorsSha256 = sha256HexSyncV1(assets.anchorsRaw);
  const runtimeIndexSha256 = sha256HexSyncV1(assets.runtimeIndexRaw);
  const approvalSha256 = sha256HexSyncV1(assets.approvalRaw);
  const approvalPacketSha256 = sha256HexSyncV1(assets.approvalPacketRaw);
  const pins = selection && record(selection.pins) ? selection.pins : undefined;
  const approval = validateApprovalAuthority(
    assets.approval,
    assets.approvalPacket,
    assets.authorityRebind,
    assets.selection,
    assets.anchors,
    expectedIds,
    selectionSha256,
    anchorsSha256,
    approvalPacketSha256,
    approvalSha256,
  );
  if (
    !registry ||
    selection?.schema !== 'fractalpark-teaching-selection/v1' ||
    selection.packageCount !== 50 ||
    selection.contentUnitCount !== 350 ||
    !pins ||
    pins.runtimeIndexSha256 !== runtimeIndexSha256 ||
    pins.runtimeIndexCanonicalSha256 !==
      sha256HexSyncV1(canonicalJsonV1(assets.runtimeIndex, 2_000_000)) ||
    JSON.stringify(selection.locales) !==
      JSON.stringify(TEACHING_CONTENT_LOCALES_V1) ||
    !selectionRows ||
    selectionRows.length !== 50 ||
    anchors?.schema !== 'fractalpark-teaching-semantic-anchors/v1' ||
    anchors.generatorRevision !== 1 ||
    anchors.selectionSha256 !== selectionSha256 ||
    anchors.rowCount !== 50 ||
    !anchorRows ||
    anchorRows.length !== 50 ||
    runtimeIndex?.schema !== 'fractalpark-published-formula-runtime-index/v1' ||
    runtimeIndex.rowCount !== 513 ||
    !runtimeRows ||
    runtimeRows.length !== 513 ||
    !runtimeFormulaIds ||
    runtimeFormulaIds.some(
      (value) =>
        typeof value !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
          value,
        ),
    ) ||
    new Set(runtimeFormulaIds).size !== runtimeFormulaIds.length ||
    ledger?.schema !== 'fractalpark-teaching-review-ledger/v1' ||
    ledger.selectionSha256 !== selectionSha256 ||
    ledger.authoritative !== true ||
    !approval ||
    !ledgerUnits ||
    ledgerUnits.length !== 50 ||
    !Array.isArray(ledger.maintainerActorIds) ||
    ledger.maintainerActorIds.length === 0 ||
    !ledger.maintainerActorIds.every(
      (value) => typeof value === 'string' && value.length > 0,
    ) ||
    !ledger.maintainerActorIds.includes(approval.actorId) ||
    new Set(ledger.maintainerActorIds).size !== ledger.maintainerActorIds.length
  ) {
    return undefined;
  }
  for (const locale of TEACHING_CONTENT_LOCALES_V1) {
    const localeRegistry = registry[locale];
    if (!record(localeRegistry)) return undefined;
    const ids = Object.keys(localeRegistry).sort();
    if (
      ids.length !== expectedIds.length ||
      JSON.stringify(ids) !== JSON.stringify([...expectedIds].sort())
    ) {
      return undefined;
    }
  }

  const bindings = new Map<string, TeachingBindingV1>();
  const units = new Map<string, JsonRecord>();
  const globalNodeIds = new Set<string>();
  for (const [index, expected] of TEACHING_SELECTION_BINDINGS_V1.entries()) {
    const selected = selectionRows[index];
    const anchor = uniqueFormulaRecord(anchorRows, expected.formulaId);
    const runtime = uniqueFormulaRecord(runtimeRows, expected.formulaId);
    const unit = uniqueFormulaRecord(ledgerUnits, expected.formulaId);
    if (
      !record(selected) ||
      selected.ordinal !== expected.ordinal ||
      selected.batch !== expected.batch ||
      selected.formulaId !== expected.formulaId ||
      selected.sourceRevision !== expected.sourceRevision ||
      selected.semanticHash !== expected.semanticHash ||
      !anchor ||
      anchor.sourceRevision !== expected.sourceRevision ||
      anchor.semanticHash !== expected.semanticHash ||
      !Array.isArray(anchor.anchors) ||
      anchor.anchorCount !== anchor.anchors.length ||
      anchor.anchors.length === 0 ||
      !runtime ||
      runtime.sourceRevision !== expected.sourceRevision ||
      runtime.semanticHash !== expected.semanticHash ||
      !Array.isArray(runtime.parameters) ||
      !unit ||
      unit.sourceRevision !== expected.sourceRevision ||
      unit.semanticHash !== expected.semanticHash
    ) {
      return undefined;
    }
    const nodeIds = anchor.anchors.map((candidate) =>
      record(candidate) ? candidate.nodeId : undefined,
    );
    const parameterSymbols = runtime.parameters.map((candidate) =>
      record(candidate) ? candidate.slotName : undefined,
    );
    if (
      nodeIds.some((value) => typeof value !== 'string' || value.length === 0) ||
      parameterSymbols.some(
        (value) => typeof value !== 'string' || value.length === 0,
      ) ||
      new Set(nodeIds).size !== nodeIds.length ||
      new Set(parameterSymbols).size !== parameterSymbols.length ||
      nodeIds.some((nodeId) => globalNodeIds.has(nodeId as string))
    ) {
      return undefined;
    }
    nodeIds.forEach((nodeId) => globalNodeIds.add(nodeId as string));
    bindings.set(expected.formulaId, {
      formulaId: expected.formulaId,
      sourceRevision: expected.sourceRevision,
      semanticHash: expected.semanticHash,
      nodeIds: new Set(nodeIds as string[]),
      parameterSymbols: new Set(parameterSymbols as string[]),
    });
    units.set(expected.formulaId, unit);
  }
  if (
    bindings.size !== expectedIdSet.size ||
    units.size !== expectedIdSet.size
  ) {
    return undefined;
  }
  return {
    bindings,
    ledgerUnits: units,
    maintainers: new Set(ledger.maintainerActorIds as string[]),
    runtimeFormulaIds: Object.freeze([...(runtimeFormulaIds as string[])]),
    approval,
  };
}

function buildGlobalContext(
  assets: TeachingContentAssetsV1,
): GlobalTeachingContextV1 | undefined {
  try {
    return buildGlobalContextUnchecked(assets);
  } catch {
    return undefined;
  }
}

const GLOBAL_CONTEXT_CACHE_V1 = new WeakMap<
  TeachingContentAssetsV1,
  GlobalTeachingContextV1 | null
>();

function resolveGlobalContext(
  assets: TeachingContentAssetsV1,
): GlobalTeachingContextV1 | undefined {
  if (!Object.isFrozen(assets)) return buildGlobalContext(assets);
  const cached = GLOBAL_CONTEXT_CACHE_V1.get(assets);
  if (cached !== undefined) return cached ?? undefined;
  const context = buildGlobalContext(assets);
  GLOBAL_CONTEXT_CACHE_V1.set(assets, context ?? null);
  return context;
}

function validReviewEvent(value: unknown): value is ReviewEventV1 {
  if (
    !record(value) ||
    !exactKeys(value, [
      'stage',
      'at',
      'actorId',
      'actorKind',
      'actorRole',
      'evidenceRefs',
    ]) ||
    typeof value.stage !== 'string' ||
    typeof value.at !== 'string' ||
    typeof value.actorId !== 'string' ||
    typeof value.actorKind !== 'string' ||
    typeof value.actorRole !== 'string' ||
    !Array.isArray(value.evidenceRefs) ||
    value.evidenceRefs.length === 0
  ) {
    return false;
  }
  return value.evidenceRefs.every(
    (reference) =>
      record(reference) &&
      exactKeys(reference, ['kind', 'value']) &&
      typeof reference.kind === 'string' &&
      typeof reference.value === 'string',
  );
}

function approvedLedgerLink(
  link: unknown,
  maintainers: ReadonlySet<string>,
  approval: ApprovalAuthorityV1,
  contentHash: string,
  englishContentHash?: string,
): boolean {
  const localizedLink = englishContentHash !== undefined;
  if (
    !record(link) ||
    !exactKeys(link, [
      'stage',
      'contentHash',
      'events',
      ...(localizedLink ? ['englishContentHash'] : []),
    ]) ||
    link.stage !== 'maintainer-approved' ||
    !Array.isArray(link.events) ||
    !link.events.every(validReviewEvent) ||
    typeof link.contentHash !== 'string' ||
    (localizedLink && typeof link.englishContentHash !== 'string')
  ) {
    return false;
  }
  const events = link.events;
  const terminal = events.at(-1);
  if (
    !terminal ||
    terminal.stage !== 'maintainer-approved' ||
    terminal.at !== approval.approvedAt ||
    terminal.actorId !== approval.actorId ||
    terminal.actorKind !== approval.actorKind ||
    terminal.actorRole !== approval.actorRole ||
    !terminal.evidenceRefs.some(
      (reference) =>
        reference.kind === 'review-artifact' &&
        reference.value === approval.evidenceRef,
    )
  ) {
    return false;
  }
  if (
    !validateReviewEventsV1(
      'maintainer-approved',
      events,
      maintainers,
      contentHash,
    ).ok
  ) {
    return false;
  }
  return validateReviewContentLinkV1(
    {
      stage: 'maintainer-approved',
      contentHash: link.contentHash,
      ...(Object.hasOwn(link, 'englishContentHash')
        ? {
            englishContentHash:
              typeof link.englishContentHash === 'string'
                ? link.englishContentHash
                : null,
          }
        : {}),
    },
    contentHash,
    englishContentHash,
  ).ok;
}

export function resolveTeachingContentFromAssetsV1(
  assets: TeachingContentAssetsV1,
  formulaId: string,
  requestedLocale: string,
): TeachingContentResolutionV1 {
  if (!(TEACHING_CONTENT_LOCALES_V1 as readonly string[]).includes(requestedLocale)) {
    return missing(requestedLocale, 'unsupported-locale');
  }
  const context = resolveGlobalContext(assets);
  const selected = TEACHING_SELECTION_BINDINGS_V1.some(
    (row) => row.formulaId === formulaId,
  );
  if (!context) {
    return missing(
      requestedLocale,
      selected ? 'binding-invalid' : 'formula-not-selected',
    );
  }
  const binding = context.bindings.get(formulaId);
  const unit = context.ledgerUnits.get(formulaId);
  if (!binding || !unit) {
    return missing(
      requestedLocale,
      selected ? 'binding-invalid' : 'formula-not-selected',
    );
  }
  const englishValue = assets.registry.en[formulaId];
  let englishHash: string;
  try {
    const englishValidation = validateEnglishTeachingUnitV1(englishValue, binding);
    if (!englishValidation.ok || !record(englishValue)) {
      return missing(requestedLocale, 'english-content-unavailable');
    }
    englishHash = contentHashV1(englishValue);
  } catch {
    return missing(requestedLocale, 'english-content-unavailable');
  }
  const englishApproved = approvedLedgerLink(
    unit.english,
    context.maintainers,
    context.approval,
    englishHash,
  );
  if (!englishApproved) {
    return missing(requestedLocale, 'english-content-unavailable');
  }
  const english = deepFreeze(englishValue as EnglishTeachingContentV1);
  if (requestedLocale === 'en') {
    const policy = resolveTeachingDeliveryPolicyV1({
      requestedLocale,
      englishApproved: true,
      localizedApproved: false,
      bindingsValid: true,
      ledgerMatchesUnit: true,
    });
    return {
      ...policy,
      delivery: 'delivered',
      requestedLocale,
      contentLocale: 'en',
      english,
      localized: null,
      fallbackReason: null,
    };
  }

  const localeRegistry = assets.registry[
    requestedLocale as keyof TeachingContentRegistryV1
  ];
  const localizedValue = localeRegistry?.[formulaId];
  const localized = record(localizedValue)
    ? (localizedValue as LocalizedTeachingContentV1)
    : undefined;
  let localizedApproved = false;
  try {
    if (localized) {
      const localizedHash = contentHashV1(
        Object.fromEntries(
          Object.entries(localized).filter(([key]) => key !== 'contentHash'),
        ),
      );
      const localizedLedger = record(unit.localized)
        ? unit.localized[requestedLocale]
        : undefined;
      localizedApproved =
        validateLocaleTeachingUnitV1(
          localized,
          binding,
          english,
          englishHash,
        ).ok &&
        approvedLedgerLink(
          localizedLedger,
          context.maintainers,
          context.approval,
          localizedHash,
          englishHash,
        );
    }
  } catch {
    localizedApproved = false;
  }
  const policy = resolveTeachingDeliveryPolicyV1({
    requestedLocale,
    englishApproved: true,
    localizedApproved,
    bindingsValid: true,
    ledgerMatchesUnit: true,
  });
  if (!localizedApproved || !localized) {
    return {
      ...policy,
      delivery: 'fallback-browse-only',
      requestedLocale,
      contentLocale: 'en',
      english,
      fallbackReason: 'localized-content-unavailable',
    };
  }
  return {
    ...policy,
    delivery: 'delivered',
    requestedLocale,
    contentLocale: requestedLocale,
    english,
    localized: deepFreeze(localized),
    fallbackReason: null,
  };
}

export function resolveDeliveredTeachingLocalesFromAssetsV1(
  assets: TeachingContentAssetsV1,
  formulaId: string,
): readonly string[] {
  return Object.freeze(
    TEACHING_CONTENT_LOCALES_V1.filter(
      (locale) =>
        resolveTeachingContentFromAssetsV1(assets, formulaId, locale).delivery ===
        'delivered',
    ),
  );
}

const PRODUCTION_ASSETS_V1: TeachingContentAssetsV1 = deepFreeze({
  selection: JSON.parse(TEACHING_SELECTION_RAW_V1) as unknown,
  selectionRaw: TEACHING_SELECTION_RAW_V1,
  anchors: JSON.parse(TEACHING_ANCHORS_RAW_V1) as unknown,
  anchorsRaw: TEACHING_ANCHORS_RAW_V1,
  runtimeIndex: JSON.parse(TEACHING_RUNTIME_INDEX_RAW_V1) as unknown,
  runtimeIndexRaw: TEACHING_RUNTIME_INDEX_RAW_V1,
  ledger: JSON.parse(TEACHING_LEDGER_RAW_V1) as unknown,
  ledgerRaw: TEACHING_LEDGER_RAW_V1,
  approval: JSON.parse(TEACHING_APPROVAL_RAW_V1) as unknown,
  approvalRaw: TEACHING_APPROVAL_RAW_V1,
  approvalPacket: JSON.parse(TEACHING_APPROVAL_PACKET_RAW_V1) as unknown,
  approvalPacketRaw: TEACHING_APPROVAL_PACKET_RAW_V1,
  authorityRebind: JSON.parse(TEACHING_AUTHORITY_REBIND_RAW_V1) as unknown,
  authorityRebindRaw: TEACHING_AUTHORITY_REBIND_RAW_V1,
  registry: TEACHING_CONTENT_REGISTRY_V1,
});

export function loadTeachingContentV1(
  formulaId: string,
  requestedLocale: string,
): TeachingContentResolutionV1 {
  return resolveTeachingContentFromAssetsV1(
    PRODUCTION_ASSETS_V1,
    formulaId,
    requestedLocale,
  );
}

export function loadDeliveredTeachingLocalesV1(
  formulaId: string,
): readonly string[] {
  return resolveDeliveredTeachingLocalesFromAssetsV1(
    PRODUCTION_ASSETS_V1,
    formulaId,
  );
}

export function loadPublishedRuntimeFormulaIdsV1(): readonly string[] {
  return resolveGlobalContext(PRODUCTION_ASSETS_V1)?.runtimeFormulaIds ?? [];
}

export function loadSelectedTeachingFormulaIdsV1(): readonly string[] {
  return Object.freeze(
    TEACHING_SELECTION_BINDINGS_V1.map((binding) => binding.formulaId),
  );
}
