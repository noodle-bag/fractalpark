/** Deterministic, non-public Profile projection for Private Level 2 review candidates. */

import { validateFormulaProfileAssetV1 } from "./assets";
import { hashProfileRevisionV1 } from "./revisions";
import type {
  FormulaDefinitionV1,
  FormulaParameterValueV1,
  FormulaProfileV1,
  FormulaViewBoundsV1,
} from "./types";

export type ProvisionalBoundsSourceV1 =
  | "upstream-candidate"
  | "b94-catalog"
  | "family-fallback"
  | "project-fallback";

export interface ProvisionalBoundsCandidatesV1 {
  readonly upstreamCandidate?: unknown;
  readonly b94CatalogCandidate?: unknown;
  readonly familyFallback?: unknown;
}

export interface ProvisionalBoundsResolutionV1 {
  readonly source: ProvisionalBoundsSourceV1;
  readonly view: FormulaViewBoundsV1;
}

export interface ProvisionalProfileProjectionV1 {
  readonly schema: "fractalpark-provisional-profile/v1";
  readonly policyVersion: typeof PROVISIONAL_PROFILE_POLICY_V1.version;
  readonly provisionalDefaultProfile: true;
  readonly verifiedDefaultProfile: false;
  readonly publicationEligible: false;
  readonly boundsSource: ProvisionalBoundsSourceV1;
  readonly profile: FormulaProfileV1;
}

export const PROVISIONAL_PROFILE_POLICY_V1 = Object.freeze({
  version: "formula-library-provisional-profile/1" as const,
  projectFallbackView: Object.freeze({
    centerX: -0.5,
    centerY: 0,
    zoom: 0.4,
    rotation: 0,
  }),
  iterations: 200,
  mode: "parameter-plane" as const,
  coloring: Object.freeze({
    pipelineVersion: 1 as const,
    outsideColoringId: "smooth",
    insideColoringId: "black",
    smooth: true,
  }),
  palette: Object.freeze({ paletteId: "inferno" }),
  transform: Object.freeze({
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    skewX: 0,
    skewY: 0,
    offsetX: 0,
    offsetY: 0,
  }),
  preview: Object.freeze({ width: 96, height: 60, smoothPower: 2 }),
});

const FAMILY_SAFE_VIEW_V1 = PROVISIONAL_PROFILE_POLICY_V1.projectFallbackView;

/**
 * Conservative family lane for the seven frozen work-package families.
 * Values intentionally remain the project-safe viewport until a family has
 * stronger approved evidence; the map supplies precedence/provenance, not an
 * aesthetic claim.
 */
export const PROVISIONAL_FAMILY_SAFE_FALLBACKS_V1: Readonly<
  Record<string, FormulaViewBoundsV1>
> = Object.freeze({
  "algebraic-power": FAMILY_SAFE_VIEW_V1,
  "folded-absolute": FAMILY_SAFE_VIEW_V1,
  "function-composition": FAMILY_SAFE_VIEW_V1,
  "orbit-memory": FAMILY_SAFE_VIEW_V1,
  "rational-reciprocal": FAMILY_SAFE_VIEW_V1,
  "root-finding": FAMILY_SAFE_VIEW_V1,
  transcendental: FAMILY_SAFE_VIEW_V1,
});

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor?.enumerable && "value" in descriptor);
  });
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseView(value: unknown): FormulaViewBoundsV1 | null {
  if (!plainRecord(value)) return null;
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 4 ||
    Reflect.ownKeys(value).length !== 4 ||
    keys.join("\u0000") !== ["centerX", "centerY", "rotation", "zoom"].join("\u0000") ||
    !finite(value.centerX) ||
    !finite(value.centerY) ||
    !finite(value.zoom) ||
    value.zoom <= 0 ||
    !finite(value.rotation)
  )
    return null;
  return {
    centerX: value.centerX,
    centerY: value.centerY,
    zoom: value.zoom,
    rotation: value.rotation,
  };
}

export function resolveProvisionalBoundsV1(
  candidates: ProvisionalBoundsCandidatesV1 = {},
): ProvisionalBoundsResolutionV1 {
  const ordered: ReadonlyArray<
    readonly [ProvisionalBoundsSourceV1, unknown]
  > = [
    ["upstream-candidate", candidates.upstreamCandidate],
    ["b94-catalog", candidates.b94CatalogCandidate],
    ["family-fallback", candidates.familyFallback],
    ["project-fallback", PROVISIONAL_PROFILE_POLICY_V1.projectFallbackView],
  ];
  for (const [source, candidate] of ordered) {
    const view = parseView(candidate);
    if (view) return { source, view };
  }
  throw new Error("provisional-bounds-unavailable");
}

function cloneParameterDefault(
  value: FormulaParameterValueV1,
): FormulaParameterValueV1 {
  return Array.isArray(value)
    ? ([value[0], value[1]] as readonly [number, number])
    : value;
}

export async function projectProvisionalProfileV1(
  definition: FormulaDefinitionV1,
  candidates: ProvisionalBoundsCandidatesV1 = {},
): Promise<ProvisionalProfileProjectionV1> {
  const bounds = resolveProvisionalBoundsV1(candidates);
  const parameters: Record<string, FormulaParameterValueV1> = {};
  for (const parameter of definition.parameters) {
    if (Object.hasOwn(parameters, parameter.name))
      throw new Error("provisional-parameter-duplicate");
    parameters[parameter.name] = cloneParameterDefault(parameter.default);
  }
  const withoutRevision: Omit<FormulaProfileV1, "profileRevision"> = {
    schemaVersion: 1,
    formulaId: definition.formulaId,
    sourceRevision: definition.sourceRevision,
    parameters,
    mode: PROVISIONAL_PROFILE_POLICY_V1.mode,
    view: bounds.view,
    iterations: PROVISIONAL_PROFILE_POLICY_V1.iterations,
    coloring: { ...PROVISIONAL_PROFILE_POLICY_V1.coloring },
    palette: { ...PROVISIONAL_PROFILE_POLICY_V1.palette },
    transform: { ...PROVISIONAL_PROFILE_POLICY_V1.transform },
  };
  const profileRevision = await hashProfileRevisionV1(withoutRevision);
  const candidate: FormulaProfileV1 = { ...withoutRevision, profileRevision };
  const validation = await validateFormulaProfileAssetV1(
    candidate,
    definition,
    profileRevision,
  );
  if (!validation.ok) throw new Error("provisional-profile-invalid");
  return {
    schema: "fractalpark-provisional-profile/v1",
    policyVersion: PROVISIONAL_PROFILE_POLICY_V1.version,
    provisionalDefaultProfile: true,
    verifiedDefaultProfile: false,
    publicationEligible: false,
    boundsSource: bounds.source,
    profile: validation.value,
  };
}
