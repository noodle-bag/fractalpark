import type { FrmLikeV1ClassicGuard } from "@/engine/frm/v1";

/**
 * Per-row classic dialect guard declarations for the v1 formula library.
 *
 * Maintainer decision 2026-08-18 (publication-pipeline gate item 1): the nine
 * residual release-oracle rows from planned commit 12d are classic zero-guard
 * dialect rows, not numeric defects. Evidence: conformance-diagnosis-v1 shows
 * orbit-length-or-event-mismatch only — values agree up to the singular step
 * and diverge purely on the classic guard event:
 *
 * - floored-log (classic log floors the radius at 1e-20): ent, ent2;
 * - zero-division (classic guarded division yields (0, 0) at the singular
 *   point, including the GPU surface's x/Inf flush): pseudozeepi, zeepi;
 * - zero-division + hyperbolic-clamp (the orbit crosses both the guarded
 *   division and the classic ±80 hyperbolic clamp): richard2, richard4,
 *   richard10, richard11;
 * - hyperbolic-clamp alone: richard6 — diagnosis-held: the clamp bounds
 *   finiteness but standard32 quantization of the clamped ~2.8e34 argument
 *   decorrelates downstream transcendental values from the classic oracle.
 *
 * pseudozeepi also relies on the complex-pow zero-radius guard, which the v1
 * backend already implements on both surfaces, so it needs no declaration.
 *
 * The v1 stdlib remains nonFinite-by-design; guards apply only to the rows
 * listed here. Extending this list requires the same per-row diagnosis
 * evidence and a maintainer decision — do not broaden it opportunistically.
 */
export const CLASSIC_DIALECT_GUARDS_V1: Readonly<
  Record<string, readonly FrmLikeV1ClassicGuard[]>
> = Object.freeze({
  "97e2fc76-3590-5119-8b38-d8cc43f18d74": ["floored-log"], // ent
  "f978281a-4cea-5545-a9c6-7ca68ca084f0": ["floored-log"], // ent2
  "7ce8c07c-0ba6-560c-9316-9aa2439997b3": ["zero-division"], // pseudozeepi
  "300db23f-8a8a-59d7-b4f1-bc77757286c6": ["zero-division"], // zeepi
  "d30d2e42-cdc2-5a2a-b9e5-cb167617180a": ["zero-division", "hyperbolic-clamp"], // richard2
  "93724077-ebed-5039-956b-7a66910a40d2": ["zero-division", "hyperbolic-clamp"], // richard4
  "b8c9d4a5-5b89-5ea7-af30-addd315fd806": ["zero-division", "hyperbolic-clamp"], // richard10
  "66f1c52e-0d3a-576b-bc3c-75f65786bff5": ["zero-division", "hyperbolic-clamp"], // richard11
  "df663e75-a1ab-5eb2-a710-d0e9b466fa9c": ["hyperbolic-clamp"], // richard6
});

export function classicDialectGuardsForV1(
  formulaId: string,
): readonly FrmLikeV1ClassicGuard[] | undefined {
  return CLASSIC_DIALECT_GUARDS_V1[formulaId];
}
