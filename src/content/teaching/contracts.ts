import { canonicalJsonV1, sha256HexSyncV1 } from '@/engine/formulas/v1/revisions';
import terminologyAsset from '../../../resources/formula-library/v1/teaching-terminology.v1.json';

const SHA256 = /^[a-f0-9]{64}$/;
const LOCALES = new Set(['zh', 'pt', 'ko', 'ru', 'es', 'fr']);
const PROTECTED_LITERAL_TOKENS = new Set(
  terminologyAsset.protectedLiteralTokens,
);
const REVIEW_STAGES = [
  'not-started',
  'source-drafted',
  'technical-reviewed',
  'locale-reviewed',
  'maintainer-approved',
] as const;
const TERMINAL_REVIEW_STAGES = new Set(['blocked', 'superseded']);
const ACTOR_KINDS = new Set([
  'human-maintainer',
  'model-reviewer',
  'automated-contract',
]);
const ACTOR_ROLES = new Set([
  'author',
  'technical-reviewer',
  'locale-reviewer',
  'maintainer',
]);
const EVIDENCE_KINDS = new Set([
  'content-hash',
  'diff-ref',
  'source-id',
  'anchor-export',
  'review-artifact',
  'test-run',
]);

type JsonRecord = Record<string, unknown>;

export interface TeachingBindingV1 {
  readonly formulaId: string;
  readonly sourceRevision: string;
  readonly semanticHash: string;
  readonly nodeIds: ReadonlySet<string>;
  readonly parameterSymbols: ReadonlySet<string>;
}

export type TeachingValidationResultV1 =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string };

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  );
}

function nonemptyStrings(value: unknown, allowEmpty = false): value is string[] {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every(nonempty)
  );
}

function bindingMatches(value: JsonRecord, binding: TeachingBindingV1): boolean {
  return (
    value.formulaId === binding.formulaId &&
    value.sourceRevision === binding.sourceRevision &&
    value.semanticHash === binding.semanticHash
  );
}

export function contentHashV1(value: unknown): string {
  return sha256HexSyncV1(canonicalJsonV1(value, 65_536));
}

export function validateEnglishTeachingUnitV1(
  value: unknown,
  binding: TeachingBindingV1,
): TeachingValidationResultV1 {
  if (!record(value)) return { ok: false, code: 'english-unit-invalid' };
  const required = [
    'schema',
    'formulaId',
    'sourceRevision',
    'semanticHash',
    'overview',
    'mathDisclosure',
    ...(Object.hasOwn(value, 'mathSummary') ? ['mathSummary'] : []),
    'sourceWalkthrough',
    'syntaxFeatures',
    'parameterExperiment',
    'exercise',
    'facts',
  ];
  if (!exactKeys(value, required)) return { ok: false, code: 'english-unit-fields-invalid' };
  if (
    value.schema !== 'fractalpark-teaching-en-fact/v1' ||
    !bindingMatches(value, binding) ||
    !nonempty(value.overview) ||
    !['exact-compact', 'exact-structured', 'omitted-complex', 'unavailable'].includes(
      String(value.mathDisclosure),
    ) ||
    (Object.hasOwn(value, 'mathSummary') && !nonempty(value.mathSummary))
  ) {
    return { ok: false, code: 'english-unit-binding-invalid' };
  }

  if (!Array.isArray(value.sourceWalkthrough) || value.sourceWalkthrough.length === 0) {
    return { ok: false, code: 'english-walkthrough-invalid' };
  }
  const annotations = new Set<string>();
  const annotationPrefix = `${binding.formulaId}:${binding.sourceRevision}:`;
  for (const item of value.sourceWalkthrough) {
    if (
      !record(item) ||
      !exactKeys(item, ['annotationId', 'nodeId', 'explanation']) ||
      !nonempty(item.annotationId) ||
      !(item.annotationId as string).startsWith(annotationPrefix) ||
      (item.annotationId as string).length === annotationPrefix.length ||
      !nonempty(item.nodeId) ||
      !binding.nodeIds.has(item.nodeId) ||
      !nonempty(item.explanation) ||
      annotations.has(item.annotationId)
    ) {
      return { ok: false, code: 'english-walkthrough-invalid' };
    }
    annotations.add(item.annotationId);
  }

  if (!Array.isArray(value.syntaxFeatures) || value.syntaxFeatures.length === 0) {
    return { ok: false, code: 'english-syntax-features-invalid' };
  }
  const featureIds = new Set<string>();
  for (const feature of value.syntaxFeatures) {
    if (
      !record(feature) ||
      !exactKeys(feature, ['featureId', 'annotationIds', 'explanation']) ||
      !nonempty(feature.featureId) ||
      featureIds.has(feature.featureId) ||
      !nonemptyStrings(feature.annotationIds) ||
      !(feature.annotationIds as string[]).every((id) => annotations.has(id)) ||
      !nonempty(feature.explanation)
    ) {
      return { ok: false, code: 'english-syntax-features-invalid' };
    }
    featureIds.add(feature.featureId);
  }

  const experiment = value.parameterExperiment;
  if (
    !record(experiment) ||
    !exactKeys(experiment, [
      'parameterSymbols',
      'steps',
      'expectedObservation',
      ...(Object.hasOwn(experiment, 'safetyNote') ? ['safetyNote'] : []),
    ]) ||
    !nonemptyStrings(experiment.parameterSymbols, true) ||
    new Set(experiment.parameterSymbols as string[]).size !==
      (experiment.parameterSymbols as string[]).length ||
    !(experiment.parameterSymbols as string[]).every((symbol) =>
      binding.parameterSymbols.has(symbol),
    ) ||
    !nonemptyStrings(experiment.steps) ||
    !nonempty(experiment.expectedObservation) ||
    (Object.hasOwn(experiment, 'safetyNote') && !nonempty(experiment.safetyNote))
  ) {
    return { ok: false, code: 'english-parameter-experiment-invalid' };
  }
  const experimentText = (experiment.steps as string[]).join('\n');
  if (
    !(experiment.parameterSymbols as string[]).every((symbol) =>
      experimentText.includes(symbol),
    )
  ) {
    return { ok: false, code: 'english-parameter-symbol-missing' };
  }

  const exercise = value.exercise;
  const facts = value.facts;
  if (
    !record(exercise) ||
    !exactKeys(exercise, ['prompt', 'completionCheck', 'answerDisclosure']) ||
    !nonempty(exercise.prompt) ||
    !nonempty(exercise.completionCheck) ||
    !['none', 'hint', 'reviewed-answer'].includes(String(exercise.answerDisclosure)) ||
    !record(facts) ||
    !exactKeys(facts, [
      'provenanceStatement',
      'rightsStatement',
      'sourceIds',
      'licenseIds',
      'claims',
    ]) ||
    !nonempty(facts.provenanceStatement) ||
    !nonempty(facts.rightsStatement) ||
    !nonemptyStrings(facts.sourceIds) ||
    !nonemptyStrings(facts.licenseIds, true) ||
    !Array.isArray(facts.claims) ||
    facts.claims.length === 0
  ) {
    return { ok: false, code: 'english-facts-invalid' };
  }
  const declaredSourceIds = new Set(facts.sourceIds as string[]);
  for (const claim of facts.claims) {
    if (
      !record(claim) ||
      !exactKeys(claim, ['text', 'sourceIds']) ||
      !nonempty(claim.text) ||
      !nonemptyStrings(claim.sourceIds) ||
      new Set(claim.sourceIds as string[]).size !==
        (claim.sourceIds as string[]).length ||
      !(claim.sourceIds as string[]).every((sourceId) =>
        declaredSourceIds.has(sourceId),
      )
    ) {
      return { ok: false, code: 'english-fact-claim-unsourced' };
    }
  }
  return { ok: true };
}

export function validateLocaleTeachingUnitV1(
  value: unknown,
  binding: TeachingBindingV1,
  englishUnit: JsonRecord,
  expectedEnglishContentHash: string,
): TeachingValidationResultV1 {
  if (!record(value)) return { ok: false, code: 'locale-unit-invalid' };
  const englishValidation = validateEnglishTeachingUnitV1(englishUnit, binding);
  if (!englishValidation.ok) {
    return { ok: false, code: 'locale-english-unit-invalid' };
  }
  const computedEnglishContentHash = contentHashV1(englishUnit);
  const required = [
    'schema',
    'formulaId',
    'locale',
    'sourceRevision',
    'semanticHash',
    'englishContentHash',
    ...(Object.hasOwn(value, 'localizedName') ? ['localizedName'] : []),
    'overview',
    'sourceWalkthrough',
    'syntaxFeatures',
    'parameterExperiment',
    'exercise',
    'factsPresentation',
    'contentHash',
  ];
  if (!exactKeys(value, required)) return { ok: false, code: 'locale-unit-fields-invalid' };
  const { contentHash: claimedContentHash, ...localePayload } = value;
  if (
    value.schema !== 'fractalpark-teaching-locale/v1' ||
    !LOCALES.has(String(value.locale)) ||
    !bindingMatches(value, binding) ||
    value.englishContentHash !== computedEnglishContentHash ||
    expectedEnglishContentHash !== computedEnglishContentHash ||
    !SHA256.test(String(claimedContentHash)) ||
    claimedContentHash !== contentHashV1(localePayload) ||
    !nonempty(value.overview) ||
    (Object.hasOwn(value, 'localizedName') && !nonempty(value.localizedName))
  ) {
    return { ok: false, code: 'locale-unit-binding-invalid' };
  }
  const englishWalkthrough = englishUnit.sourceWalkthrough as JsonRecord[];
  const englishFeatures = englishUnit.syntaxFeatures as JsonRecord[];
  const walkthrough = value.sourceWalkthrough;
  const features = value.syntaxFeatures;
  if (
    !record(walkthrough) ||
    !record(features) ||
    JSON.stringify(Object.keys(walkthrough).sort()) !==
      JSON.stringify(englishWalkthrough.map((item) => item.annotationId).sort()) ||
    JSON.stringify(Object.keys(features).sort()) !==
      JSON.stringify(englishFeatures.map((item) => item.featureId).sort()) ||
    !Object.values(walkthrough).every(nonempty) ||
    !Object.values(features).every(nonempty)
  ) {
    return { ok: false, code: 'locale-unit-keyset-invalid' };
  }
  const experiment = value.parameterExperiment;
  if (
    !record(experiment) ||
    !exactKeys(experiment, [
      'steps',
      'expectedObservation',
      ...(Object.hasOwn(experiment, 'safetyNote') ? ['safetyNote'] : []),
    ]) ||
    !nonemptyStrings(experiment.steps) ||
    !nonempty(experiment.expectedObservation) ||
    (Object.hasOwn(experiment, 'safetyNote') && !nonempty(experiment.safetyNote))
  ) {
    return { ok: false, code: 'locale-parameter-experiment-invalid' };
  }
  const symbols = (englishUnit.parameterExperiment as JsonRecord)
    .parameterSymbols as string[];
  const localeSteps = (experiment.steps as string[]).join('\n');
  if (!symbols.every((symbol) => localeSteps.includes(symbol))) {
    return { ok: false, code: 'locale-parameter-symbol-missing' };
  }
  const exercise = value.exercise;
  const factsPresentation = value.factsPresentation;
  if (
    !record(exercise) ||
    !exactKeys(exercise, [
      'prompt',
      'completionCheck',
      ...(Object.hasOwn(exercise, 'hint') ? ['hint'] : []),
    ]) ||
    !nonempty(exercise.prompt) ||
    !nonempty(exercise.completionCheck) ||
    (Object.hasOwn(exercise, 'hint') && !nonempty(exercise.hint)) ||
    !record(factsPresentation) ||
    !exactKeys(factsPresentation, ['provenanceLead', 'rightsLead']) ||
    !nonempty(factsPresentation.provenanceLead) ||
    !nonempty(factsPresentation.rightsLead)
  ) {
    return { ok: false, code: 'locale-editorial-shape-invalid' };
  }
  const englishCanonical = canonicalJsonV1(englishUnit, 65_536);
  const localeCanonical = canonicalJsonV1(value, 65_536);
  if (
    [...PROTECTED_LITERAL_TOKENS].some(
      (token) => englishCanonical.includes(token) && !localeCanonical.includes(token),
    )
  ) {
    return { ok: false, code: 'locale-protected-literal-missing' };
  }
  return { ok: true };
}

export interface ReviewEventV1 {
  readonly stage: string;
  readonly at: string;
  readonly actorId: string;
  readonly actorKind: string;
  readonly actorRole: string;
  readonly evidenceRefs: ReadonlyArray<Readonly<{ kind: string; value: string }>>;
}

export function validateReviewEventsV1(
  current: string,
  events: readonly ReviewEventV1[],
  maintainerActorIds: ReadonlySet<string>,
  expectedRegressionContentHash?: string,
): TeachingValidationResultV1 {
  if (current === 'not-started') {
    return events.length === 0
      ? { ok: true }
      : { ok: false, code: 'review-not-started-has-events' };
  }
  let previousIndex = 0;
  for (const [eventIndex, event] of events.entries()) {
    const evidenceValid =
      nonempty(event.at) &&
      nonempty(event.actorId) &&
      ACTOR_KINDS.has(event.actorKind) &&
      ACTOR_ROLES.has(event.actorRole) &&
      Array.isArray(event.evidenceRefs) &&
      event.evidenceRefs.length > 0 &&
      event.evidenceRefs.every(
        (reference) =>
          EVIDENCE_KINDS.has(reference.kind) &&
          nonempty(reference.value) &&
          (reference.kind !== 'content-hash' ||
            SHA256.test(reference.value.replace(/^sha256:/, ''))),
      );
    if (TERMINAL_REVIEW_STAGES.has(event.stage)) {
      const nextEvent = events[eventIndex + 1];
      const terminalTransitionValid =
        previousIndex >= 1 &&
        (event.stage === 'superseded'
          ? nextEvent === undefined
          : nextEvent === undefined || nextEvent.stage === 'source-drafted');
      if (!evidenceValid || !terminalTransitionValid) {
        return { ok: false, code: 'review-terminal-transition-invalid' };
      }
      continue;
    }
    const index = REVIEW_STAGES.indexOf(event.stage as never);
    const hasMatchingContentHashEvidence =
      expectedRegressionContentHash !== undefined &&
      SHA256.test(expectedRegressionContentHash) &&
      event.evidenceRefs.some(
        (reference) =>
          reference.kind === 'content-hash' &&
          reference.value.replace(/^sha256:/, '') ===
            expectedRegressionContentHash,
    );
    const documentedRegression =
      hasMatchingContentHashEvidence &&
      ((event.stage === 'source-drafted' && previousIndex >= 1) ||
        (event.stage === 'locale-reviewed' && previousIndex >= 3));
    if (
      (index !== previousIndex + 1 && !documentedRegression) ||
      !evidenceValid
    ) {
      return { ok: false, code: 'review-transition-invalid' };
    }
    if (
      event.stage === 'maintainer-approved' &&
      (event.actorKind !== 'human-maintainer' ||
        event.actorRole !== 'maintainer' ||
        !maintainerActorIds.has(event.actorId))
    ) {
      return { ok: false, code: 'review-approval-actor-invalid' };
    }
    previousIndex = index;
  }
  return events.at(-1)?.stage === current
    ? { ok: true }
    : { ok: false, code: 'review-current-mismatch' };
}

export interface ReviewContentLinkV1 {
  readonly stage: string;
  readonly contentHash: string | null;
  readonly englishContentHash?: string | null;
}

export function validateReviewContentLinkV1(
  link: ReviewContentLinkV1,
  actualContentHash: string | null,
  actualEnglishContentHash?: string | null,
): TeachingValidationResultV1 {
  if (link.stage === 'not-started') {
    return link.contentHash === null &&
      actualContentHash === null &&
      (!Object.hasOwn(link, 'englishContentHash') ||
        (link.englishContentHash === null && actualEnglishContentHash === null))
      ? { ok: true }
      : { ok: false, code: 'review-not-started-content-present' };
  }
  if (TERMINAL_REVIEW_STAGES.has(link.stage) && link.contentHash === null) {
    return actualContentHash === null &&
      (!Object.hasOwn(link, 'englishContentHash') ||
        (link.englishContentHash === null && actualEnglishContentHash === null))
      ? { ok: true }
      : { ok: false, code: 'review-terminal-content-mismatch' };
  }
  if (
    actualContentHash === null ||
    !SHA256.test(actualContentHash) ||
    link.contentHash !== actualContentHash
  ) {
    return { ok: false, code: 'review-content-hash-mismatch' };
  }
  if (
    Object.hasOwn(link, 'englishContentHash') &&
    (actualEnglishContentHash === null ||
      actualEnglishContentHash === undefined ||
      !SHA256.test(actualEnglishContentHash) ||
      link.englishContentHash !== actualEnglishContentHash)
  ) {
    return { ok: false, code: 'review-english-hash-mismatch' };
  }
  return { ok: true };
}

export type TeachingDeliveryPolicyV1 = Readonly<{
  delivery: 'not-delivered' | 'fallback-browse-only' | 'delivered';
  contentLocale: 'en' | string | null;
  robots: 'index,follow' | 'noindex,follow';
  contentEligibleForCommit21: boolean;
}>;

export function resolveTeachingDeliveryPolicyV1(input: {
  requestedLocale: string;
  englishApproved: boolean;
  localizedApproved: boolean;
  bindingsValid: boolean;
  ledgerMatchesUnit: boolean;
}): TeachingDeliveryPolicyV1 {
  const valid = input.bindingsValid && input.ledgerMatchesUnit;
  if (input.requestedLocale === 'en') {
    return valid && input.englishApproved
      ? {
          delivery: 'delivered',
          contentLocale: 'en',
          robots: 'index,follow',
          contentEligibleForCommit21: true,
        }
      : {
          delivery: 'not-delivered',
          contentLocale: null,
          robots: 'noindex,follow',
          contentEligibleForCommit21: false,
        };
  }
  if (valid && input.localizedApproved) {
    return {
      delivery: 'delivered',
      contentLocale: input.requestedLocale,
      robots: 'index,follow',
      contentEligibleForCommit21: true,
    };
  }
  if (valid && input.englishApproved) {
    return {
      delivery: 'fallback-browse-only',
      contentLocale: 'en',
      robots: 'noindex,follow',
      contentEligibleForCommit21: false,
    };
  }
  return {
    delivery: 'not-delivered',
    contentLocale: null,
    robots: 'noindex,follow',
    contentEligibleForCommit21: false,
  };
}
