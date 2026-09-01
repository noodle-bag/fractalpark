/* Independent replay verifier: intentionally does not import the builder. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalizeFrmLikeV1, hashFrmLikeV1, parseFrmLikeV1 } from "../src/engine/frm/v1";
import type { FrmV1UnaryFunctionName } from "../src/engine/frm/frm-v1-stdlib";
import { decideJuliaParameterAuthorityV1, parseJuliaParameterAuthorityAssetV1 } from "../src/engine/formulas/v1/julia-parameter-authority";
import { classifyJuliaBindingRolesV1 } from "../src/engine/formulas/v1/julia-binding";
import { runJuliaCpuHarnessV1, type JuliaCpuComplexV1 } from "../src/engine/formulas/v1/julia-cpu-harness";
import { createPublicationDecisionLedgerV1 } from "../src/engine/formulas/v1/publication-decisions";
import { parsePublishedFormulaRuntimeIndexV1 } from "../src/engine/formulas/v1/published-runtime";
import { canonicalJsonV1, sha256HexSyncV1 } from "../src/engine/formulas/v1/revisions";
import { validateFormulaSafetyEnvelopeV1 } from "../src/engine/formulas/v1/safety-envelope";

const ROOT = process.cwd(), R = join(ROOT, "resources/formula-library/v1"), P = join(ROOT, "public/formula-library/v1/runtime/published");
const fail = (x: string): never => { throw new Error(`julia-parameter-authority verify: ${x}`); };
const json = (p: string): Record<string, unknown> => JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
const equal = (a: unknown, b: unknown) => canonicalJsonV1(a, 10_000_000) === canonicalJsonV1(b, 10_000_000);
const params = (p: readonly { slotName: string; type: string; default: unknown }[]): Readonly<Record<string, number | JuliaCpuComplexV1 | FrmV1UnaryFunctionName>> => Object.freeze(Object.fromEntries(p.map((x) => [x.slotName, x.type === "complex" ? (() => { const v = x.default as readonly number[]; return [v[0]!, v[1]!] as JuliaCpuComplexV1; })() : x.default as number | FrmV1UnaryFunctionName])));

void (async () => {
  const assetRaw = json(join(R, "julia-parameter-authority.v1.json"));
  const parsedAsset = parseJuliaParameterAuthorityAssetV1(assetRaw);
  const asset = parsedAsset.ok ? parsedAsset.value : fail("asset-parse");
  const contract = json(join(R, "julia-pixel-recovery-contract.v1.json")), old = json(join(R, "julia-parameter-binding-evidence.v1.json")), census = json(join(R, "julia-pixel-role-census.v1.json"));
  const indexRaw = json(join(P, "index.json")), rightsAsset = json(join(R, "publication-decisions.json")), indexResult = parsePublishedFormulaRuntimeIndexV1(indexRaw);
  const runtimeRows = indexResult.ok ? indexResult.value.rows : fail("runtime-index");
  const ledgerResult = createPublicationDecisionLedgerV1();
  const ledger = ledgerResult.ok ? ledgerResult.ledger : fail("publication-ledger");
  if (!Array.isArray(old.rows) || !Array.isArray(census.rows) || !Array.isArray((contract.lineage as Record<string, unknown>)?.orderedFormulaIds)) fail("inputs");
  const bindings = asset.sourceBindings; if (bindings.recoveryContractContentHash !== contract.contentHash || bindings.parameterBindingEvidenceContentHash !== old.contentHash || bindings.pixelRoleCensusContentHash !== census.contentHash || bindings.runtimeIndexCanonicalSha256 !== sha256HexSyncV1(canonicalJsonV1(indexRaw, 131_072)) || bindings.publicationDecisionsContentHash !== rightsAsset.contentHash) fail("source-bindings");
  const oldMap = new Map((old.rows as Record<string, unknown>[]).map((x) => [String(x.formulaId), x])), censusMap = new Map((census.rows as Record<string, unknown>[]).map((x) => [String(x.formulaId), x])), runtimeMap = new Map(runtimeRows.map((x) => [x.formulaId, x]));
  const ids = ((contract.lineage as Record<string, unknown>).orderedFormulaIds as unknown[]).filter((x): x is string => typeof x === "string" && (oldMap.get(x)?.tier0 as Record<string, unknown> | undefined)?.status === "blocked"); if (ids.length !== 175 || asset.rows.length !== 175) fail("row-count");
  const dc: Record<string, number> = {}, sc: Record<string, number> = {};
  for (const [i, id] of ids.entries()) {
    const row = asset.rows[i] ?? fail(`asset-row:${id}`);
    const prior = oldMap.get(id) ?? fail(`prior:${id}`);
    const mode = censusMap.get(id) ?? fail(`mode:${id}`);
    const runtime = runtimeMap.get(id) ?? fail(`runtime:${id}`);
    const right = ledger.decisionFor(id) ?? fail(`rights:${id}`);
    if (row.formulaId !== id || right.publicationDecision !== "publish" || right.implementationBasis !== runtime.implementationBasis || right.leakageScanStatus !== "passed" || prior.sourceRevision !== runtime.sourceRevision) fail(`binding:${id}`);
    const source = readFileSync(join(P, runtime.definitionPath), "utf8");
    const originalResult = parseFrmLikeV1(source);
    const originalIr = originalResult.ok ? originalResult.ir : fail(`parse:${id}`);
    const baseline = await hashFrmLikeV1(source, originalIr);
    const candidateSource = canonicalizeFrmLikeV1(originalIr);
    const sourceDelta = source === `${candidateSource}\n`
      ? "terminal-newline-only"
      : "other";
    const canonicalResult = parseFrmLikeV1(candidateSource);
    const canonicalIr = canonicalResult.ok ? canonicalResult.ir : fail(`canonical-parse:${id}`);
    if (candidateSource.endsWith("\n")) fail(`canonical-newline:${id}`);
    const candidate = await hashFrmLikeV1(candidateSource, canonicalIr);
    const safety = await validateFormulaSafetyEnvelopeV1({ schemaVersion: 1, source: candidateSource, sourceRevision: candidate.sourceRevision, semanticHash: candidate.semanticHash, languageVersion: "frm-like/1", stdlibVersion: 1, supportedNumericProfiles: ["standard32"], parameters: canonicalIr.parameters, programModel: "orbit", termination: { predicateMeaning: "continue-iteration", nonFinite: "terminate-with-event", maximumIterations: "profile-resolved" }, channels: [], capabilities: [] });
    if (!safety.ok || baseline.sourceRevision !== runtime.sourceRevision || baseline.semanticHash !== runtime.semanticHash || candidate.semanticHash !== baseline.semanticHash || !equal(originalIr, canonicalIr) || !equal(originalIr, safety.ir) || !equal(originalIr.parameters, canonicalIr.parameters) || !equal(originalIr.parameters, safety.ir.parameters)) fail(`invariants:${id}`);
    const attempts: unknown[] = [], passing: string[] = [];
    for (const p of canonicalIr.parameters.filter((x) => x.type === "complex")) {
      const binding = { kind: "parameter", slotName: p.name } as const;
      const classified = classifyJuliaBindingRolesV1(canonicalIr, binding);
      if (!classified.ok) {
        attempts.push({ slotName: p.name, status: "static-rejected", reasonCode: classified.reasonCode });
        continue;
      }
      const harnessResult = runJuliaCpuHarnessV1(canonicalIr, binding, { parameters: params(runtime.parameters) });
      const harness = harnessResult.ok ? harnessResult.value : fail(`harness:${id}:${p.name}`);
      attempts.push({ slotName: p.name, status: harness.candidatePass ? "tier1-candidate" : "blocked", bindingRevision: sha256HexSyncV1(canonicalJsonV1({ schema: "fractalpark-julia-binding-revision/v1", formulaId: id, sourceRevision: runtime.sourceRevision, binding: harness.contract.binding, modeClass: harness.contract.modeClass, supportLane: harness.contract.supportLane, z0Role: harness.contract.z0Role })), contract: harness.contract, checks: harness.checks, reasonCodes: harness.reasonCodes });
      if (harness.candidatePass === true) passing.push(p.name);
    }
    const oldResolution = prior.slotResolution as Record<string, unknown>, historical = oldResolution.status === "single-passing-slot" ? [oldResolution.selectedSlotName] : oldResolution.status === "multiple-passing-slots" ? oldResolution.passingSlotNames : []; const decision = decideJuliaParameterAuthorityV1(mode.modeClass as "classic-julia" | "generalized-two-plane" | "undetermined", passing);
    if (!equal(attempts, prior.attempts) || !equal(passing, historical) || row.baselineSourceRevision !== baseline.sourceRevision || row.baselineSemanticHash !== baseline.semanticHash || !equal(row.baselineParameterSchema, originalIr.parameters) || row.candidateSourceRevision !== candidate.sourceRevision || row.canonicalSourceDelta !== sourceDelta || row.canonicalSourceDelta !== (prior.tier0 as Record<string, unknown>).canonicalSourceDelta || row.modeClass !== mode.modeClass || row.rights.rightsStatus !== right.rightsStatus || row.authorityDecision !== decision || !equal(row.slotResolution.passingSlotNames, passing) || (passing.length === 1 && row.slotResolution.selectedSlotName !== passing[0])) fail(`replay:${id}`);
    dc[decision] = (dc[decision] ?? 0) + 1; sc[row.canonicalSourceDelta] = (sc[row.canonicalSourceDelta] ?? 0) + 1;
  }
  if (!equal(dc, asset.authorityDecision) || !equal(sc, asset.canonicalSourceDelta) || !equal(dc, { "canonical-authority-recovered": 43, "generalized-held": 3, "undetermined-unknown": 116, "multiple-held": 4, "no-passing-blocked": 9 }) || !equal(sc, { "terminal-newline-only": 163, other: 12 })) fail("counts"); console.log(`PASS 175 ${asset.contentHash}`);
})().catch((e: unknown) => { console.error(e); process.exitCode = 1; });
