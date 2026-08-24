import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import identityAsset from "../../resources/formula-library/v1/standard-formula-ids.json";
import {
  FORMULA_DIRECTORY_COUNT_V1,
  FORMULA_DIRECTORY_FAMILIES_V1,
  PUBLICATION_DECISION_LEDGER_V1,
  STANDARD_FORMULA_DIRECTORY_V1,
  buildFormulaDirectoryFacetsV1,
  filterFormulaDirectoryV1,
} from "@/engine/formulas/v1";

describe("standard formula directory v1", () => {
  it("covers exactly 677 identities joined with decisions", () => {
    expect(STANDARD_FORMULA_DIRECTORY_V1).toHaveLength(677);
    expect(FORMULA_DIRECTORY_COUNT_V1).toBe(677);
    const seen = new Set<string>();
    for (const entry of STANDARD_FORMULA_DIRECTORY_V1) {
      expect(seen.has(entry.formulaId)).toBe(false);
      seen.add(entry.formulaId);
      const decision = PUBLICATION_DECISION_LEDGER_V1.decisionFor(
        entry.formulaId,
      );
      expect(decision).toBeDefined();
      expect(entry.publicationDecision).toBe(decision?.publicationDecision);
      expect(entry.rightsStatus).toBe(decision?.rightsStatus);
      expect(entry.implementationBasis).toBe(decision?.implementationBasis);
      expect(entry.displayName.length).toBeGreaterThan(0);
    }
  });

  it("projects the identity asset verbatim (displayName, family)", () => {
    const byId = new Map(
      STANDARD_FORMULA_DIRECTORY_V1.map((entry) => [entry.formulaId, entry]),
    );
    for (const row of identityAsset.formulas) {
      const entry = byId.get(row.formulaId as (typeof STANDARD_FORMULA_DIRECTORY_V1)[number]["formulaId"]);
      expect(entry).toBeDefined();
      expect(entry?.displayName).toBe(row.displayName);
      expect(entry?.primaryFamily).toBe(row.primaryFamily);
    }
  });

  it("uses only the seven declared families", () => {
    for (const entry of STANDARD_FORMULA_DIRECTORY_V1) {
      expect(FORMULA_DIRECTORY_FAMILIES_V1).toContain(entry.primaryFamily);
    }
  });

  it("facet counts sum to 677 and match the ledger", () => {
    const facets = buildFormulaDirectoryFacetsV1();
    expect(facets.families).toHaveLength(7);
    const sum = (facets: readonly { count: number }[]) =>
      facets.reduce((total, facet) => total + facet.count, 0);
    expect(sum(facets.families)).toBe(677);
    expect(sum(facets.decisions)).toBe(677);
    expect(sum(facets.rights)).toBe(677);
    expect(
      facets.decisions.find((facet) => facet.value === "publish")?.count,
    ).toBe(534);
    expect(
      facets.decisions.find((facet) => facet.value === "hold")?.count,
    ).toBe(143);
    expect(
      facets.rights.find((facet) => facet.value === "gpl-3.0-only")?.count,
    ).toBe(73);
    expect(
      facets.families.find((facet) => facet.value === "algebraic-power")
        ?.count,
    ).toBe(224);
  });

  it("filters by family and decision with exact partition semantics", () => {
    const published = filterFormulaDirectoryV1({ decision: "publish" });
    expect(published).toHaveLength(534);
    const heldAlgebraic = filterFormulaDirectoryV1({
      family: "algebraic-power",
      decision: "hold",
    });
    for (const entry of heldAlgebraic) {
      expect(entry.primaryFamily).toBe("algebraic-power");
      expect(entry.publicationDecision).toBe("hold");
    }
    const familyTotal = FORMULA_DIRECTORY_FAMILIES_V1.map(
      (family) => filterFormulaDirectoryV1({ family }).length,
    ).reduce((total, count) => total + count, 0);
    expect(familyTotal).toBe(677);
    expect(filterFormulaDirectoryV1({})).toHaveLength(677);
  });

  it("keeps held rows basis-free and published rows basis-recorded", () => {
    for (const entry of STANDARD_FORMULA_DIRECTORY_V1) {
      if (entry.publicationDecision === "publish") {
        expect(entry.implementationBasis).not.toBeNull();
      } else {
        expect(entry.implementationBasis).toBeNull();
      }
    }
  });

  it("keeps the public directory on the published projection only", () => {
    const pageSource = readFileSync(
      join(process.cwd(), "src/app/[locale]/formulas/directory/page.tsx"),
      "utf8",
    );
    expect(pageSource).toContain(
      'filterPublishedFormulaDirectoryV1(category)',
    );
    expect(pageSource).not.toContain("parseStatus");
    expect(pageSource).not.toContain("facets.status");

    const messagesRoot = join(process.cwd(), "messages");
    for (const file of readdirSync(messagesRoot).filter((name) => name.endsWith(".json"))) {
      const messages = JSON.parse(readFileSync(join(messagesRoot, file), "utf8"));
      const publicCopy = JSON.stringify(messages.formulas.directory);
      expect(publicCopy).not.toMatch(/\b(?:677|143)\b/);
      expect(messages.formulas.directory.description).toContain("{count}");
      expect(messages.formulas.directory.intro).toContain("{count}");
    }
  });
});
