import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd());
const repoFile = (relativePath: string): string =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");
const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const locales = ["zh", "pt", "ko", "ru", "es", "fr"] as const;
type Locale = (typeof locales)[number];
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
interface EvidenceRef {
  surface: string;
  path: string;
  sha256: string;
}
interface ModelReview {
  status: string;
  provider: string;
  requestedModel: string;
  actualModel: string;
  evidence: EvidenceRef[];
}
interface LocaleReview {
  manualPath: string;
  manualSha256: string;
  messageFile: string;
  messageProjectionSha256: string;
  generation: Record<string, string>;
  modelReviews: Record<"deepseek" | "kimi-k3", ModelReview>;
  maintainerApproval: { status: string; approvedBy?: string; approvedAt?: string };
  state: string;
}
interface ReviewEvidence {
  evidenceId: string;
  schemaVersion: number;
  locale: string;
  surface: string;
  provider: string;
  requestedModel: string;
  actualModel: string;
  finishReason: string;
  status: string;
  sourceCommit: string;
  sourceManualSha256: string;
  sourceMessageProjectionSha256: string;
  targetManualSha256: string;
  targetMessageProjectionSha256: string;
  messagePathCount: number;
  reviewText: string;
  [key: string]: unknown;
}
interface ReviewLedger {
  source: {
    commit: string;
    manualPath: string;
    manualSha256: string;
    messageFile: string;
    messageProjectionSha256: string;
  };
  messagePaths: string[];
  reviewPolicy: {
    aiGenerated: boolean;
    maintainerApprovalRequired: boolean;
    aiMayApproveAsMaintainer: boolean;
  };
  locales: Record<Locale, LocaleReview>;
  publicationRevision4Rebind: {
    authorization: string;
    scope: string;
    aiAssistanceDisclosure: string;
    changes: {
      manualNumericSubstitutions: string[];
      reviewedMessagePaths: string[];
      additionalMessagePaths: string[];
    };
    priorSnapshot: Record<Locale | "en", {
      manualSha256: string;
      messageProjectionSha256: string;
    }>;
    currentProjection: Record<Locale | "en", {
      manualSha256: string;
      messageProjectionSha256: string;
    }>;
    contentRowsChanged: boolean;
    modelReviewEvidenceReusedForCurrentBytes: boolean;
    reviewStatus: string;
  };
}

const ledger = JSON.parse(
  repoFile("resources/formula-library/v1/frm-like-v1-localization-review.v1.json"),
) as ReviewLedger;
const expectedSourceCommit = "37320f293839812017178bb91efe7670239edfa3";
const expectedSourceManualSha256 =
  "e5168f1a0211596659314d748fa53825892a2a6f089350e636a8c0baf3903758";
const expectedSourceProjectionSha256 =
  "effb295f43ad338c80f1becab42a90cbb8afd2345a79c2e014acf031ea1faaf7";
const sourceManual = repoFile(ledger.source.manualPath);
const sourceMessages = JSON.parse(repoFile(ledger.source.messageFile)) as JsonValue;

const body = (markdown: string): string => {
  const match = markdown.match(/^## 1\.\s/m);
  if (!match || match.index === undefined) throw new Error("manual section 1 missing");
  return markdown.slice(match.index);
};
const fencedBlocks = (markdown: string): string[] =>
  body(markdown).match(/^```[^\n]*\n[\s\S]*?^```$/gm) ?? [];
const inlineCodes = (markdown: string): string[] => {
  const prose = body(markdown).replace(/^```[^\n]*\n[\s\S]*?^```$/gm, "");
  return [...prose.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]).sort();
};
const linkTargets = (markdown: string): string[] =>
  [...body(markdown).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1])
    .sort();
const headingLevels = (markdown: string): number[] =>
  [...body(markdown).matchAll(/^(#{1,6})\s+/gm)].map((match) => match[1].length);
const sectionNumbers = (markdown: string): string[] =>
  [...body(markdown).matchAll(/^##\s+(\d+)\./gm)].map((match) => match[1]);
const markdownListMarkers = (markdown: string): string[] =>
  body(markdown)
    .split("\n")
    .map((line) => line.match(/^\s*(-|\d+\.)\s+/)?.[1])
    .filter((marker): marker is string => Boolean(marker));
const tableShapes = (markdown: string): number[][] => {
  const groups: number[][] = [];
  let current: number[] = [];
  for (const line of body(markdown).split("\n")) {
    if (line.startsWith("|")) {
      current.push(line.split("|").length - 2);
    } else if (current.length > 0) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
};
const numericValues = (value: string, locale: Locale | "en"): string[] => {
  let prose = body(value)
    .replace(/^```[^\n]*\n[\s\S]*?^```$/gm, "")
    .replace(/`[^`\n]+`/g, "");
  const separator =
    locale === "pt" || locale === "es"
      ? "\\."
      : locale === "fr" || locale === "ru"
        ? "[ \\u00a0\\u202f]"
        : ",";
  const grouped = new RegExp(`(?<!\\d)\\d{1,3}(?:${separator}\\d{3})+(?!\\d)`, "g");
  prose = prose.replace(grouped, (match) => match.replace(/[,. \u00a0\u202f]/g, ""));
  return [...prose.matchAll(/\d+(?:\.\d+)?/g)].map((match) => match[0]).sort();
};
const placeholders = (value: string): string[] =>
  [...value.matchAll(/\{[^{}]+\}/g)].map((match) => match[0]).sort();
const inlineCodeInText = (value: string): string[] =>
  [...value.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]).sort();
const protectedTokens = [
  "FRM-like/1",
  "sourceRevision",
  "semanticHash",
  "NumericProfile",
  "LastSqr",
  "zPrev",
  "FractalPark",
  "Fractint",
  "WebGL",
  "CPU",
  "GLSL",
  "AST",
  ".frm",
  "Profile",
  "Standard",
  "Definition",
  "Formula Record",
  "Remix",
  "Open",
] as const;

// The manual always enforces the complete protected set. Message prose may
// translate only these path-scoped ordinary-language uses; action labels such
// as `Open` in the Editor note remain protected.
const translatableMessageTokens = {
  Open: new Set([
    "formulas.index.intro",
  ]),
  Standard: new Set([
    "formulas.index.intro",
    "formulas.index.frm.description",
    "formulas.frmGuide.intro",
    "formulas.frmGuide.sections.what-is-frm.body.0",
    "formulas.frmGuide.sections.support.intro",
    "formulas.frmGuide.sections.support.disclaimer",
    "formulas.frmGuide.sections.pipeline.note",
    "explore.landing.whatIsAnswer",
    "metadata.explore.description",
    "metadata.explore.ogDescription",
    "metadata.formulaAtlas.description",
    "about.aiDescription",
    "about.techStack.formula",
    "publicProject.definition",
    "publicProject.aiDescription",
    "publicProject.boundaries.current.0",
  ]),
} as const;
const protectedMessageTokens = (messagePath: string) =>
  protectedTokens.filter((token) =>
    token !== "Open" && token !== "Standard"
      ? true
      : !translatableMessageTokens[token].has(messagePath),
  );

const protectedCount = (value: string, token: string): number => {
  if (token.startsWith(".")) return value.split(token).length - 1;
  const boundary = token === "Open" ? "A-Za-z0-9_-" : "A-Za-z0-9_";
  const expression = new RegExp(
    `(?<![${boundary}])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![${boundary}])`,
    "g",
  );
  return value.match(expression)?.length ?? 0;
};
const valueAt = (root: JsonValue, dottedPath: string): JsonValue => {
  let current = root;
  for (const segment of dottedPath.split(".")) {
    if (Array.isArray(current)) current = current[Number(segment)];
    else if (current !== null && typeof current === "object") current = current[segment];
    else throw new Error(`cannot resolve ${dottedPath}`);
  }
  return current;
};
const projection = (messages: JsonValue): Array<{ path: string; value: JsonValue }> =>
  ledger.messagePaths.map((messagePath) => ({
    path: messagePath,
    value: valueAt(messages, messagePath),
  }));
const projectionSha256 = (messages: JsonValue): string =>
  sha256(`${JSON.stringify(projection(messages))}\n`);
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
};
const requireEvidence = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};
const validateEvidence = (
  evidence: ReviewEvidence,
  reference: EvidenceRef,
  locale: Locale,
  review: LocaleReview,
  modelReview: ModelReview,
): void => {
  const { evidenceId, ...payload } = evidence;
  requireEvidence(
    evidenceId === sha256(JSON.stringify(canonicalize(payload))),
    "evidenceId mismatch",
  );
  requireEvidence(evidence.schemaVersion === 1, "unsupported evidence schema");
  requireEvidence(evidence.locale === locale, "locale mismatch");
  requireEvidence(evidence.surface === reference.surface, "surface mismatch");
  requireEvidence(evidence.provider === modelReview.provider, "provider mismatch");
  requireEvidence(evidence.requestedModel === modelReview.requestedModel, "requested model mismatch");
  requireEvidence(
    evidence.actualModel === modelReview.actualModel && evidence.actualModel.length > 0,
    "actual model mismatch",
  );
  requireEvidence(evidence.finishReason === "stop", "incomplete review");
  requireEvidence(evidence.status === "approved", "review not approved");
  requireEvidence(evidence.sourceCommit === expectedSourceCommit, "source commit mismatch");
  requireEvidence(
    evidence.sourceManualSha256 === expectedSourceManualSha256,
    "source manual mismatch",
  );
  requireEvidence(
    evidence.sourceMessageProjectionSha256 === expectedSourceProjectionSha256,
    "source projection mismatch",
  );
  requireEvidence(evidence.targetManualSha256 === review.manualSha256, "target manual mismatch");
  requireEvidence(
    evidence.targetMessageProjectionSha256 === review.messageProjectionSha256,
    "target projection mismatch",
  );
  requireEvidence(evidence.messagePathCount === 39, "message path count mismatch");
  const verdict = evidence.reviewText
    .split("\n")
    .find((line) => line.trim())
    ?.replaceAll("**", "")
    .trim();
  requireEvidence(verdict === "VERDICT: APPROVE", "verdict mismatch");
};
const loadAndValidateEvidence = (
  reference: EvidenceRef,
  locale: Locale,
  review: LocaleReview,
  modelReview: ModelReview,
): ReviewEvidence => {
  const serialized = repoFile(reference.path);
  requireEvidence(sha256(serialized) === reference.sha256, "artifact file hash mismatch");
  const evidence = JSON.parse(serialized) as ReviewEvidence;
  validateEvidence(evidence, reference, locale, review, modelReview);
  return evidence;
};

const sourceQuickHeadingRemoved = body(sourceManual).replace(
  "### Standard library quick reference",
  "",
);
const disclosureMarkers: Record<Locale, RegExp> = {
  zh: /AI/,
  pt: /IA/,
  ko: /AI/,
  ru: /ИИ/,
  es: /IA/,
  fr: /IA/,
};

describe("FRM-like v1 localized manual review ledger", () => {
  it("binds the English authority and exactly 39 projected message leaves", () => {
    expect(locales).toEqual(Object.keys(ledger.locales));
    expect(ledger.messagePaths).toHaveLength(39);
    expect(new Set(ledger.messagePaths).size).toBe(39);
    expect(ledger.source.commit).toBe(expectedSourceCommit);
    expect(ledger.source.manualSha256).toBe(expectedSourceManualSha256);
    expect(ledger.source.messageProjectionSha256).toBe(expectedSourceProjectionSha256);
    expect(sha256(sourceManual)).toBe(
      ledger.publicationRevision4Rebind.currentProjection.en.manualSha256,
    );
    expect(projectionSha256(sourceMessages)).toBe(
      ledger.publicationRevision4Rebind.currentProjection.en.messageProjectionSha256,
    );
    expect(ledger.publicationRevision4Rebind).toMatchObject({
      authorization: "approved-v0.4.19-plan-v1.5-expected-commit-26c",
      scope: "mechanical-release-fact-and-public-boundary-copy-only",
      contentRowsChanged: false,
      modelReviewEvidenceReusedForCurrentBytes: false,
      reviewStatus: "ellie-main-agent-reviewed",
    });
    expect(ledger.publicationRevision4Rebind.priorSnapshot.en).toEqual({
      manualSha256: ledger.source.manualSha256,
      messageProjectionSha256: ledger.source.messageProjectionSha256,
    });
    expect(ledger.reviewPolicy).toMatchObject({
      aiGenerated: true,
      maintainerApprovalRequired: true,
      aiMayApproveAsMaintainer: false,
    });
  });

  for (const locale of locales) {
    it(`${locale} binds reviewed manual and message projection hashes`, () => {
      const review = ledger.locales[locale];
      const manual = repoFile(review.manualPath);
      const messages = JSON.parse(repoFile(review.messageFile)) as JsonValue;
      expect(sha256(manual)).toBe(
        ledger.publicationRevision4Rebind.currentProjection[locale].manualSha256,
      );
      expect(projectionSha256(messages)).toBe(
        ledger.publicationRevision4Rebind.currentProjection[locale]
          .messageProjectionSha256,
      );
      expect(ledger.publicationRevision4Rebind.priorSnapshot[locale]).toEqual({
        manualSha256: review.manualSha256,
        messageProjectionSha256: review.messageProjectionSha256,
      });
      const deepseek = review.modelReviews.deepseek;
      const kimi = review.modelReviews["kimi-k3"];
      expect(deepseek).toMatchObject({
        status: "approved",
        provider: "deepseek",
        requestedModel: "deepseek-chat",
        actualModel: "deepseek-v4-flash",
      });
      expect(deepseek.evidence.map(({ surface }) => surface).sort()).toEqual([
        "manual-a",
        "manual-b",
        "messages",
      ]);
      expect(kimi).toMatchObject({
        status: "approved",
        provider: "kimi-coding",
        requestedModel: "k3",
        actualModel: "k3",
      });
      expect(kimi.evidence.map(({ surface }) => surface)).toEqual(["combined"]);
      for (const reference of deepseek.evidence) {
        loadAndValidateEvidence(reference, locale, review, deepseek);
      }
      for (const reference of kimi.evidence) {
        loadAndValidateEvidence(reference, locale, review, kimi);
      }
      expect(review.generation).not.toEqual({});
    });
  }

  it("binds explicit human maintainer approval after model-review closure", () => {
    for (const locale of locales) {
      const review = ledger.locales[locale];
      expect(review.maintainerApproval).toEqual({
        status: "approved",
        approvedBy: "project-maintainer",
        approvedAt: "2026-08-21T17:18:09+08:00",
      });
      expect(review.state).toBe("maintainer-approved");
    }
  });

  it("rejects missing, mutated, and model-anonymous review evidence", () => {
    const locale: Locale = "zh";
    const review = ledger.locales[locale];
    const modelReview = review.modelReviews.deepseek;
    const reference = modelReview.evidence[0];
    expect(() =>
      loadAndValidateEvidence(
        { ...reference, path: `${reference.path}.missing` },
        locale,
        review,
        modelReview,
      ),
    ).toThrow();
    const evidence = JSON.parse(repoFile(reference.path)) as ReviewEvidence;
    expect(() =>
      validateEvidence(
        { ...evidence, targetManualSha256: "0".repeat(64) },
        reference,
        locale,
        review,
        modelReview,
      ),
    ).toThrow("evidenceId mismatch");
    const anonymousPayload = { ...evidence };
    delete (anonymousPayload as Partial<ReviewEvidence>).evidenceId;
    anonymousPayload.actualModel = "";
    expect(() =>
      validateEvidence(
        {
          ...anonymousPayload,
          evidenceId: sha256(JSON.stringify(canonicalize(anonymousPayload))),
        } as ReviewEvidence,
        reference,
        locale,
        review,
        modelReview,
      ),
    ).toThrow("actual model mismatch");
  });
});

describe("FRM-like v1 localized manual structural and factual parity", () => {
  for (const locale of locales) {
    it(`${locale} preserves the manual contract`, () => {
      const review = ledger.locales[locale];
      const manual = repoFile(review.manualPath);
      expect(manual).toContain(`- Locale: ${locale}`);
      expect(manual).toContain(`- Source manual SHA-256: ${ledger.source.manualSha256}`);
      expect(manual).toContain(`/${locale}/formulas/<formulaId>`);
      expect(manual).toMatch(disclosureMarkers[locale]);
      expect(manual).toContain('<a id="standard-library-quick-reference"></a>');
      expect(fencedBlocks(manual)).toEqual(fencedBlocks(sourceManual));
      expect(inlineCodes(manual)).toEqual(inlineCodes(sourceManual));
      expect(linkTargets(manual)).toEqual(linkTargets(sourceManual));
      expect(headingLevels(manual)).toEqual(headingLevels(sourceManual));
      expect(sectionNumbers(manual)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
      expect(markdownListMarkers(manual)).toEqual(markdownListMarkers(sourceManual));
      expect(tableShapes(manual)).toEqual(tableShapes(sourceManual));
      expect(numericValues(manual, locale)).toEqual(numericValues(sourceManual, "en"));
      const localizedQuickHeadingRemoved = body(manual).replace(/^### .*$/m, "");
      for (const token of protectedTokens) {
        expect(protectedCount(localizedQuickHeadingRemoved, token)).toBeGreaterThanOrEqual(
          protectedCount(sourceQuickHeadingRemoved, token),
        );
      }
    });
  }
});

describe("FRM-like v1 localized message projection parity", () => {
  for (const locale of locales) {
    it(`${locale} translates all 39 reviewed leaves without semantic token drift`, () => {
      const messages = JSON.parse(repoFile(ledger.locales[locale].messageFile)) as JsonValue;
      for (const messagePath of ledger.messagePaths) {
        const source = valueAt(sourceMessages, messagePath);
        const translated = valueAt(messages, messagePath);
        expect(typeof source).toBe("string");
        expect(typeof translated).toBe("string");
        const sourceText = source as string;
        const translatedText = translated as string;
        expect(translatedText).not.toBe(sourceText);
        expect(placeholders(translatedText)).toEqual(placeholders(sourceText));
        expect(inlineCodeInText(translatedText)).toEqual(inlineCodeInText(sourceText));
        expect(numericValues(`## 1. X\n${translatedText}`, locale)).toEqual(
          numericValues(`## 1. X\n${sourceText}`, "en"),
        );
        for (const token of protectedMessageTokens(messagePath)) {
          expect(protectedCount(translatedText, token)).toBeGreaterThanOrEqual(
            protectedCount(sourceText, token),
          );
        }
      }
    });
  }
});
