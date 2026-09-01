import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalizeFrmLikeV1, hashFrmLikeV1, parseFrmLikeV1 } from "../src/engine/frm/v1";
import type { FrmV1UnaryFunctionName } from "../src/engine/frm/frm-v1-stdlib";
import { decideJuliaParameterAuthorityV1 } from "../src/engine/formulas/v1/julia-parameter-authority";
import { classifyJuliaBindingRolesV1 } from "../src/engine/formulas/v1/julia-binding";
import { runJuliaCpuHarnessV1, type JuliaCpuComplexV1 } from "../src/engine/formulas/v1/julia-cpu-harness";
import { createPublicationDecisionLedgerV1 } from "../src/engine/formulas/v1/publication-decisions";
import { parsePublishedFormulaRuntimeIndexV1 } from "../src/engine/formulas/v1/published-runtime";
import { canonicalJsonV1, sha256HexSyncV1 } from "../src/engine/formulas/v1/revisions";
import { validateFormulaSafetyEnvelopeV1 } from "../src/engine/formulas/v1/safety-envelope";

const ROOT = process.cwd(), RESOURCE = join(ROOT, "resources/formula-library/v1"), PUBLISHED = join(ROOT, "public/formula-library/v1/runtime/published"), OUTPUT = join(RESOURCE, "julia-parameter-authority.v1.json");
const fail = (message: string): never => { throw new Error(`julia-parameter-authority: ${message}`); };
const readJson = (path: string): Record<string, unknown> => JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
const runtimeParameters = (parameters: readonly { slotName: string; type: string; default: unknown }[]): Readonly<Record<string, number | JuliaCpuComplexV1 | FrmV1UnaryFunctionName>> => Object.freeze(Object.fromEntries(parameters.map((p) => [p.slotName, p.type === "complex" ? (() => { const v = p.default as readonly number[]; return [v[0]!, v[1]!] as JuliaCpuComplexV1; })() : p.default as number | FrmV1UnaryFunctionName])));
const same = (a: unknown, b: unknown) => canonicalJsonV1(a, 10_000_000) === canonicalJsonV1(b, 10_000_000);
const count = (rows: readonly Record<string, unknown>[], key: string) => rows.reduce<Record<string, number>>((out, row) => ((out[String(row[key])] = (out[String(row[key])] ?? 0) + 1), out), {});

async function build(): Promise<Record<string, unknown>> {
  const contractPath = join(RESOURCE, "julia-pixel-recovery-contract.v1.json"), oldPath = join(RESOURCE, "julia-parameter-binding-evidence.v1.json"), censusPath = join(RESOURCE, "julia-pixel-role-census.v1.json"), runtimePath = join(PUBLISHED, "index.json"), rightsPath = join(RESOURCE, "publication-decisions.json");
  const contract = readJson(contractPath), old = readJson(oldPath), census = readJson(censusPath), rightsAsset = readJson(rightsPath);
  const parsedIndex = parsePublishedFormulaRuntimeIndexV1(readJson(runtimePath));
  const runtimeRows = parsedIndex.ok
    ? parsedIndex.value.rows
    : fail("runtime-index-invalid");
  const ledgerResult = createPublicationDecisionLedgerV1();
  const ledger = ledgerResult.ok
    ? ledgerResult.ledger
    : fail("publication-ledger-invalid");
  if (typeof contract.contentHash !== "string" || typeof old.contentHash !== "string" || typeof census.contentHash !== "string" || !Array.isArray((contract.lineage as Record<string, unknown>)?.orderedFormulaIds) || !Array.isArray(old.rows) || !Array.isArray(census.rows)) fail("input-shape");
  const oldById = new Map((old.rows as Record<string, unknown>[]).map((r) => [String(r.formulaId), r]));
  const censusById = new Map((census.rows as Record<string, unknown>[]).map((r) => [String(r.formulaId), r]));
  const runtimeById = new Map(runtimeRows.map((r) => [r.formulaId, r]));
  const ids = ((contract.lineage as Record<string, unknown>).orderedFormulaIds as unknown[]).filter((id): id is string => typeof id === "string" && (oldById.get(id)?.tier0 as Record<string, unknown> | undefined)?.status === "blocked");
  if (ids.length !== 175) fail("blocked-row-count");
  const rows: Record<string, unknown>[] = [];
  for (const formulaId of ids) {
    const prior = oldById.get(formulaId) ?? fail(`prior:${formulaId}`);
    const runtime = runtimeById.get(formulaId) ?? fail(`runtime:${formulaId}`);
    const mode = censusById.get(formulaId) ?? fail(`mode:${formulaId}`);
    const right = ledger.decisionFor(formulaId) ?? fail(`rights:${formulaId}`);
    if (right.publicationDecision !== "publish" || right.implementationBasis !== runtime.implementationBasis || right.leakageScanStatus !== "passed" || prior.sourceRevision !== runtime.sourceRevision || prior.semanticHash !== runtime.semanticHash) fail(`source-or-rights:${formulaId}`);
    if (!["classic-julia", "generalized-two-plane", "undetermined"].includes(String(mode.modeClass))) fail(`census-mode:${formulaId}`);
    const source = readFileSync(join(PUBLISHED, runtime.definitionPath), "utf8");
    const parsedResult = parseFrmLikeV1(source);
    const baselineIr = parsedResult.ok ? parsedResult.ir : fail(`parse:${formulaId}`);
    const baseline = await hashFrmLikeV1(source, baselineIr); if (baseline.sourceRevision !== runtime.sourceRevision || baseline.semanticHash !== runtime.semanticHash) fail(`baseline-hash:${formulaId}`);
    const canonical = canonicalizeFrmLikeV1(baselineIr); if (canonical.endsWith("\n")) fail(`canonical-newline:${formulaId}`);
    const canonicalResult = parseFrmLikeV1(canonical);
    const canonicalIr = canonicalResult.ok ? canonicalResult.ir : fail(`canonical-parse:${formulaId}`);
    if (!same(baselineIr, canonicalIr)) fail(`canonical-ir:${formulaId}`);
    const candidate = await hashFrmLikeV1(canonical, canonicalIr); if (candidate.semanticHash !== baseline.semanticHash || !same(baselineIr.parameters, canonicalIr.parameters)) fail(`canonical-invariant:${formulaId}`);
    const safety = await validateFormulaSafetyEnvelopeV1({ schemaVersion: 1, source: canonical, sourceRevision: candidate.sourceRevision, semanticHash: candidate.semanticHash, languageVersion: "frm-like/1", stdlibVersion: 1, supportedNumericProfiles: ["standard32"], parameters: canonicalIr.parameters, programModel: "orbit", termination: { predicateMeaning: "continue-iteration", nonFinite: "terminate-with-event", maximumIterations: "profile-resolved" }, channels: [], capabilities: [] });
    if (!safety.ok || canonical !== canonicalizeFrmLikeV1(safety.ir) || !same(baselineIr, safety.ir) || !same(baselineIr.parameters, safety.ir.parameters)) fail(`safety-or-ir:${formulaId}`);
    const attempts: unknown[] = []; const passing: string[] = [];
    for (const parameter of canonicalIr.parameters.filter((p) => p.type === "complex")) {
      const binding = { kind: "parameter", slotName: parameter.name } as const; const classified = classifyJuliaBindingRolesV1(canonicalIr, binding);
      if (!classified.ok) { attempts.push({ slotName: parameter.name, status: "static-rejected", reasonCode: classified.reasonCode }); continue; }
      const harnessResult = runJuliaCpuHarnessV1(canonicalIr, binding, { parameters: runtimeParameters(runtime.parameters) });
      const harness = harnessResult.ok ? harnessResult.value : fail(`harness:${formulaId}:${parameter.name}`);
      const attempt = { slotName: parameter.name, status: harness.candidatePass ? "tier1-candidate" : "blocked", bindingRevision: sha256HexSyncV1(canonicalJsonV1({ schema: "fractalpark-julia-binding-revision/v1", formulaId, sourceRevision: runtime.sourceRevision, binding: harness.contract.binding, modeClass: harness.contract.modeClass, supportLane: harness.contract.supportLane, z0Role: harness.contract.z0Role })), contract: harness.contract, checks: harness.checks, reasonCodes: harness.reasonCodes };
      attempts.push(attempt); if (harness.candidatePass === true) passing.push(parameter.name);
    }
    const oldAttempts = prior.attempts; const oldResolution = prior.slotResolution as Record<string, unknown>; const oldPassing = oldResolution.status === "single-passing-slot" ? [String(oldResolution.selectedSlotName)] : oldResolution.status === "multiple-passing-slots" ? oldResolution.passingSlotNames : [];
    if (!same(attempts, oldAttempts) || !same(passing, oldPassing)) fail(`historical-replay:${formulaId}`);
    const status = passing.length === 1 ? "unique" : passing.length > 1 ? "multiple" : "no-passing";
    rows.push({ formulaId, baselineSourceRevision: baseline.sourceRevision, baselineSemanticHash: baseline.semanticHash, baselineParameterSchema: baselineIr.parameters, candidateSourceRevision: candidate.sourceRevision, canonicalSourceDelta: (prior.tier0 as Record<string, unknown>).canonicalSourceDelta, modeClass: mode.modeClass, rights: { rightsStatus: right.rightsStatus, publicationDecision: "publish" }, invariants: { safetyEnvelopePass: true, irInvariant: true, semanticInvariant: true, parameterSchemaInvariant: true }, slotResolution: status === "unique" ? { status, selectedSlotName: passing[0], passingSlotNames: passing } : { status, passingSlotNames: passing }, attempts, authorityDecision: decideJuliaParameterAuthorityV1(mode.modeClass as "classic-julia" | "generalized-two-plane" | "undetermined", passing) });
  }
  const deltas = count(rows, "canonicalSourceDelta"), decisions = count(rows, "authorityDecision");
  const expected = { "canonical-authority-recovered": 43, "generalized-held": 3, "undetermined-unknown": 116, "multiple-held": 4, "no-passing-blocked": 9 };
  if (!same(deltas, { "terminal-newline-only": 163, other: 12 }) || !same(decisions, expected)) fail(`counts:${JSON.stringify({ deltas, decisions })}`);
  if (typeof rightsAsset.contentHash !== "string") fail("publication-content-hash");
  const asset: Record<string, unknown> = { schema: "fractalpark-julia-parameter-authority/v1", revision: 1, evidenceClass: "source-binding-receipts-only", sourceBindings: { recoveryContractContentHash: contract.contentHash, parameterBindingEvidenceContentHash: old.contentHash, pixelRoleCensusContentHash: census.contentHash, runtimeIndexCanonicalSha256: sha256HexSyncV1(canonicalJsonV1(readJson(runtimePath), 131_072)), publicationDecisionsContentHash: rightsAsset.contentHash }, rowCount: 175, canonicalSourceDelta: deltas, authorityDecision: decisions, safetyEnvelopePass: 175, irInvariant: 175, semanticInvariant: 175, parameterSchemaInvariant: 175, rows };
  try { asset.contentHash = sha256HexSyncV1(canonicalJsonV1(asset, 10_000_000)); } catch { fail("asset-content-hash-budget"); } return asset;
}
void build().then((asset) => { const text = `${JSON.stringify(asset, null, 2)}\n`; if (process.argv.includes("--write")) writeFileSync(OUTPUT, text); else if (!existsSync(OUTPUT) || readFileSync(OUTPUT, "utf8") !== text) fail("output-drift"); console.log(JSON.stringify({ rowCount: asset.rowCount, canonicalSourceDelta: asset.canonicalSourceDelta, authorityDecision: asset.authorityDecision, contentHash: asset.contentHash })); }).catch((error: unknown) => { console.error(error); process.exitCode = 1; });
