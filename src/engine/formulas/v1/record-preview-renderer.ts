/** Deterministic CPU preview evidence over the production FRM-like v1 backend. */

import type { FrmLikeV1Backend } from "@/engine/frm/v1-backend";
import type { FrmV1UnaryFunctionName } from "@/engine/frm/frm-v1-stdlib";
import { PROVISIONAL_PROFILE_POLICY_V1 } from "./provisional-profile";
import type { FormulaProfileV1 } from "./types";

export type ProvisionalPreviewAnomalyV1 =
  | "flat-preview"
  | "no-escaped-pixels"
  | "no-interior-pixels"
  | "non-finite-pixels";

export interface ProvisionalPreviewV1 {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  readonly escapedPixels: number;
  readonly interiorPixels: number;
  readonly nonFinitePixels: number;
  readonly uniqueColors: number;
  readonly anomalies: readonly ProvisionalPreviewAnomalyV1[];
}

function byte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function fract(value: number): number {
  return value - Math.floor(value);
}

/** Production palette index 0: palettes.glsl `iqPalette` with legacy phases. */
export function provisionalLegacyInfernoColorV1(
  paletteT: number,
): readonly [number, number, number] {
  const tau = 6.28318530718;
  return [
    byte(0.5 + 0.5 * Math.cos(tau * paletteT)),
    byte(0.5 + 0.5 * Math.cos(tau * (paletteT + 0.1))),
    byte(0.5 + 0.5 * Math.cos(tau * (paletteT + 0.2))),
  ];
}

function escapedColor(smoothIteration: number, maximum: number): readonly [number, number, number] {
  const paletteT = fract((smoothIteration / Math.max(1, maximum)) * 4);
  return provisionalLegacyInfernoColorV1(paletteT);
}

function recordPreviewOrbitAverageColorV1(
  logarithmicRadiusSum: number,
  angleSineSum: number,
  angleCosineSum: number,
  samples: number,
): readonly [number, number, number] {
  if (samples < 1) return [0, 0, 0];
  const averageLogarithmicRadius = logarithmicRadiusSum / samples;
  const averageAngle = Math.atan2(angleSineSum, angleCosineSum) / (Math.PI * 2);
  return provisionalLegacyInfernoColorV1(
    fract(averageLogarithmicRadius * 0.125 + averageAngle + 0.5),
  );
}

/** Production framework.frag.glsl after-step smooth formula. */
export function provisionalLegacySmoothIterationV1(
  escapedAt: number,
  magnitude: number,
  power: number,
): number {
  return (
    escapedAt -
    Math.log2(Math.log2(Math.max(magnitude, 1.00001))) /
      Math.log2(Math.max(power, 2)) +
    4
  );
}

function assertSupportedVisualPolicy(profile: FormulaProfileV1): void {
  if (
    (profile.mode !== "parameter-plane" &&
      (profile.mode !== "julia" ||
        !Array.isArray(profile.juliaC) ||
        profile.juliaC.length !== 2 ||
        !profile.juliaC.every(Number.isFinite))) ||
    profile.coloring.pipelineVersion !== 1 ||
    profile.coloring.outsideColoringId !== "smooth" ||
    !["black", "record-preview-orbit-average-v1"].includes(
      profile.coloring.insideColoringId,
    ) ||
    profile.coloring.smooth !== true ||
    profile.palette.paletteId !== "inferno" ||
    profile.transform.rotation !== 0 ||
    profile.transform.scaleX !== 1 ||
    profile.transform.scaleY !== 1 ||
    profile.transform.skewX !== 0 ||
    profile.transform.skewY !== 0 ||
    profile.transform.offsetX !== 0 ||
    profile.transform.offsetY !== 0
  )
    throw new Error("provisional-preview-policy-unsupported");
}

export function renderRecordPreviewV1(
  backend: FrmLikeV1Backend,
  profile: FormulaProfileV1,
  width: number,
  height: number,
): ProvisionalPreviewV1 {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 512 ||
    height > 512 ||
    !Number.isSafeInteger(profile.iterations) ||
    profile.iterations < 1
  )
    throw new Error("provisional-preview-dimensions-invalid");
  assertSupportedVisualPolicy(profile);

  const rgba = new Uint8Array(width * height * 4);
  const colors = new Set<string>();
  const radians = profile.view.rotation;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const halfWidth = 1 / profile.view.zoom;
  const halfHeight = halfWidth * (height / width);
  let escapedPixels = 0;
  let interiorPixels = 0;
  let nonFinitePixels = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const localX = ((x + 0.5) / width * 2 - 1) * halfWidth;
      const localY = (1 - (y + 0.5) / height * 2) * halfHeight;
      const coordinate = {
        re: profile.view.centerX + localX * cosine - localY * sine,
        im: profile.view.centerY + localX * sine + localY * cosine,
      };
      const state = backend.cpu.createState({
        pixel: coordinate,
        c:
          profile.mode === "parameter-plane"
            ? coordinate
            : { re: profile.juliaC![0], im: profile.juliaC![1] },
        maxit: profile.iterations,
        ismand: profile.mode === "parameter-plane",
        parameters: profile.parameters as Readonly<
          Record<string, number | readonly [number, number] | FrmV1UnaryFunctionName>
        >,
      });
      const useOrbitAverage =
        profile.coloring.insideColoringId ===
        "record-preview-orbit-average-v1";
      let logarithmicRadiusSum = 0;
      let angleSineSum = 0;
      let angleCosineSum = 0;
      let orbitSamples = 0;
      const initialized = backend.cpu.init(state);
      let event = initialized.event;
      if (!event && useOrbitAverage) {
        const z = state.values.z;
        const magnitude = Math.hypot(z.re, z.im);
        const angle = Math.atan2(z.im, z.re);
        logarithmicRadiusSum += Math.log1p(magnitude);
        angleSineSum += Math.sin(angle);
        angleCosineSum += Math.cos(angle);
        orbitSamples += 1;
      }
      let escapedAt: number | null = null;
      for (let iteration = 0; iteration < profile.iterations && !event; iteration++) {
        const stepped = backend.cpu.step(state);
        if (stepped.event) {
          event = stepped.event;
          break;
        }
        if (useOrbitAverage) {
          const z = state.values.z;
          const magnitude = Math.hypot(z.re, z.im);
          const angle = Math.atan2(z.im, z.re);
          logarithmicRadiusSum += Math.log1p(magnitude);
          angleSineSum += Math.sin(angle);
          angleCosineSum += Math.cos(angle);
          orbitSamples += 1;
        }
        const continuation = backend.cpu.shouldContinue(state);
        if (continuation.event) {
          event = continuation.event;
          break;
        }
        if (continuation.continue === false) {
          escapedAt = iteration + 1;
          break;
        }
      }
      let color: readonly [number, number, number];
      if (event) {
        nonFinitePixels++;
        color = [255, 0, 255];
      } else if (escapedAt !== null) {
        escapedPixels++;
        const z = state.values.z;
        const magnitude = Math.hypot(z.re, z.im);
        const smoothIteration = provisionalLegacySmoothIterationV1(
          escapedAt,
          magnitude,
          PROVISIONAL_PROFILE_POLICY_V1.preview.smoothPower,
        );
        color = escapedColor(
          Number.isFinite(smoothIteration) ? smoothIteration : escapedAt,
          profile.iterations,
        );
      } else {
        interiorPixels++;
        color = useOrbitAverage
          ? recordPreviewOrbitAverageColorV1(
              logarithmicRadiusSum,
              angleSineSum,
              angleCosineSum,
              orbitSamples,
            )
          : [0, 0, 0];
      }
      const offset = (y * width + x) * 4;
      rgba[offset] = color[0];
      rgba[offset + 1] = color[1];
      rgba[offset + 2] = color[2];
      rgba[offset + 3] = 255;
      colors.add(`${color[0]},${color[1]},${color[2]}`);
    }
  }

  const anomalies: ProvisionalPreviewAnomalyV1[] = [];
  if (colors.size < 2) anomalies.push("flat-preview");
  if (escapedPixels === 0) anomalies.push("no-escaped-pixels");
  if (interiorPixels === 0) anomalies.push("no-interior-pixels");
  if (nonFinitePixels > 0) anomalies.push("non-finite-pixels");
  return {
    width,
    height,
    rgba,
    escapedPixels,
    interiorPixels,
    nonFinitePixels,
    uniqueColors: colors.size,
    anomalies,
  };
}

export function composeProvisionalContactSheetV1(
  previews: readonly Pick<ProvisionalPreviewV1, "width" | "height" | "rgba">[],
  columns = 5,
): { readonly width: number; readonly height: number; readonly rgba: Uint8Array } {
  if (previews.length === 0 || !Number.isInteger(columns) || columns < 1)
    throw new Error("provisional-contact-sheet-input-invalid");
  const tileWidth = previews[0].width;
  const tileHeight = previews[0].height;
  if (
    previews.some(
      (preview) =>
        preview.width !== tileWidth ||
        preview.height !== tileHeight ||
        preview.rgba.length !== tileWidth * tileHeight * 4,
    )
  )
    throw new Error("provisional-contact-sheet-input-invalid");
  const rows = Math.ceil(previews.length / columns);
  const width = tileWidth * columns;
  const height = tileHeight * rows;
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  for (const [index, preview] of previews.entries()) {
    const tileX = (index % columns) * tileWidth;
    const tileY = Math.floor(index / columns) * tileHeight;
    for (let y = 0; y < tileHeight; y++) {
      const sourceStart = y * tileWidth * 4;
      const targetStart = ((tileY + y) * width + tileX) * 4;
      rgba.set(preview.rgba.subarray(sourceStart, sourceStart + tileWidth * 4), targetStart);
    }
  }
  return { width, height, rgba };
}
