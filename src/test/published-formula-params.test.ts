import { describe, expect, it } from "vitest";

import type { PublishedFormulaDescriptorV1 } from "@/engine/formulas/v1";
import {
  normalizePublishedFormulaParams,
  partitionPublishedFormulaParams,
} from "@/lib/published-formula-params";

const descriptor: PublishedFormulaDescriptorV1 = {
  schema: "fractalpark-published-formula-descriptor/v1",
  formulaId: "00000000-0000-5000-8000-000000000001",
  sourceRevision: "a".repeat(64),
  semanticHash: "b".repeat(64),
  parameters: [
    {
      slotName: "scale",
      type: "real",
      default: 0.5,
      hardDomain: [-2, 2],
      uniformName: "frmV1_scale",
    },
    {
      slotName: "offset",
      type: "complex",
      default: [0, 0],
      uniformName: "frmV1_offset",
    },
    {
      slotName: "fn1",
      type: "function",
      default: "identity",
      options: ["identity", "sin"],
      uniformName: "u_frm_fn1",
    },
  ],
};

describe("normalizePublishedFormulaParams", () => {
  it("normalizes valid URL values to renderer-safe parameter shapes", () => {
    expect(
      normalizePublishedFormulaParams(descriptor, {
        frmV1_scale: 0.25,
        frmV1_offset: [0.1, -0.2],
        u_frm_fn1: 1,
      }),
    ).toEqual({
      frmV1_scale: [0.25, 0],
      frmV1_offset: [0.1, -0.2],
      u_frm_fn1: 1,
    });
  });

  it("drops unknown keys and fails invalid shapes or domains to defaults", () => {
    expect(
      normalizePublishedFormulaParams(descriptor, {
        frmV1_scale: [999, 0],
        frmV1_offset: 3,
        u_frm_fn1: 8,
        hostile_unknown: [1, 2],
      }),
    ).toEqual({
      frmV1_scale: [0.5, 0],
      frmV1_offset: [0, 0],
      u_frm_fn1: 0,
    });
  });

  it("rejects a non-zero imaginary component for a real parameter", () => {
    expect(
      normalizePublishedFormulaParams(descriptor, {
        frmV1_scale: [0.25, 1],
      }).frmV1_scale,
    ).toEqual([0.5, 0]);
  });

  it("repartitions valid coloring and transform values from the URL bucket", () => {
    expect(
      partitionPublishedFormulaParams(
        descriptor,
        {
          formula: {
            frmV1_scale: 0.25,
            u_stripeFrequency: 7,
            u_polarAngleScale: 1.5,
            hostile_unknown: 1,
          },
        },
        {
          outside: [
            {
              name: "u_stripeFrequency",
              type: "float",
              default: 5,
              min: 1,
              max: 20,
            },
          ],
          transform: [
            {
              name: "u_polarAngleScale",
              type: "float",
              default: 1,
              min: 0.25,
              max: 3,
            },
          ],
        },
      ),
    ).toEqual({
      formula: {
        frmV1_scale: [0.25, 0],
        frmV1_offset: [0, 0],
        u_frm_fn1: 0,
      },
      outside: { u_stripeFrequency: 7 },
      inside: undefined,
      transform: { u_polarAngleScale: 1.5 },
    });
  });

  it("drops invalid and cross-domain ambiguous plugin values", () => {
    expect(
      partitionPublishedFormulaParams(
        descriptor,
        {
          formula: {
            u_shared: 1,
            u_polarAngleScale: 99,
          },
        },
        {
          outside: [{ name: "u_shared", type: "float", default: 0 }],
          transform: [
            { name: "u_shared", type: "float", default: 0 },
            {
              name: "u_polarAngleScale",
              type: "float",
              default: 1,
              min: 0.25,
              max: 3,
            },
          ],
        },
      ),
    ).toEqual({
      formula: {
        frmV1_scale: [0.5, 0],
        frmV1_offset: [0, 0],
        u_frm_fn1: 0,
      },
      outside: undefined,
      inside: undefined,
      transform: undefined,
    });
  });
});
