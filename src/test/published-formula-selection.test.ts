import { describe, expect, it, vi } from "vitest";

import type {
  PublishedFormulaPluginArtifactV1,
  PublishedFormulaRuntimeIndexRowV1,
} from "@/engine/formulas/v1";
import {
  PublishedFormulaActionCoordinator,
  PublishedFormulaSelectionCoordinator,
  pickPublishedFormulaLuckyRow,
  type PublishedFormulaSelectionClient,
  type PublishedFormulaSelectionResult,
} from "@/lib/published-formula-selection";

function artifact(formulaId: string): PublishedFormulaPluginArtifactV1 {
  return {
    plugin: {
      id: formulaId,
      category: "formula",
      name: formulaId,
      source: "frm",
      glsl: "",
      uniforms: [],
    },
    descriptor: {
      schema: "fractalpark-published-formula-descriptor/v1",
      formulaId,
      sourceRevision: "a".repeat(64),
      semanticHash: "b".repeat(64),
      parameters: [],
    },
    backend: {} as PublishedFormulaPluginArtifactV1["backend"],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function row(formulaId: string): PublishedFormulaRuntimeIndexRowV1 {
  return {
    formulaId,
    displayName: formulaId,
    family: "algebraic-power",
    implementationBasis: "direct-adaptation",
    sourceRevision: "a".repeat(64),
    semanticHash: "b".repeat(64),
    definitionPath: `definitions/${"a".repeat(64)}.frm`,
    descriptorSchema: "fractalpark-published-formula-descriptor/v1",
    parameters: [],
    profile: {
      schema: "fractalpark-published-formula-profile/v1",
      quality: "mechanical",
      mode: "parameter-plane",
      center: [0, 0],
      zoom: 1,
      rotation: 0,
      iterations: 96,
    },
  };
}

describe("pickPublishedFormulaLuckyRow", () => {
  it("selects only published rows and avoids the current formula when possible", () => {
    const rows = [row("first"), row("current"), row("last")];

    expect(pickPublishedFormulaLuckyRow(rows, "current", () => 0)?.formulaId).toBe(
      "first",
    );
    expect(
      pickPublishedFormulaLuckyRow(rows, "current", () => 0.999999)?.formulaId,
    ).toBe("last");
    expect(pickPublishedFormulaLuckyRow([rows[1]], "current", () => 0)).toBe(
      rows[1],
    );
    expect(pickPublishedFormulaLuckyRow([], "current", () => 0)).toBeUndefined();
  });

  it("fails closed to the first eligible row for a non-finite random sample", () => {
    const rows = [row("first"), row("second")];
    expect(
      pickPublishedFormulaLuckyRow(rows, undefined, () => Number.NaN)?.formulaId,
    ).toBe("first");
  });
});

describe("PublishedFormulaActionCoordinator", () => {
  it("supersedes an action that is still awaiting the library index", async () => {
    const coordinator = new PublishedFormulaActionCoordinator();
    const index = deferred<string>();
    const generation = coordinator.begin();
    let applied = false;

    const action = (async (): Promise<PublishedFormulaSelectionResult> => {
      await index.promise;
      if (!coordinator.isCurrent(generation)) {
        return { ok: false, code: "selection-superseded" };
      }
      applied = true;
      return { ok: true };
    })();

    coordinator.cancel();
    index.resolve("ready");

    await expect(action).resolves.toEqual({
      ok: false,
      code: "selection-superseded",
    });
    expect(applied).toBe(false);
  });
});

describe("PublishedFormulaSelectionCoordinator", () => {
  it("applies only the latest successful selection", async () => {
    const first = deferred<ReturnType<PublishedFormulaSelectionClient["load"]> extends Promise<infer T> ? T : never>();
    const second = deferred<ReturnType<PublishedFormulaSelectionClient["load"]> extends Promise<infer T> ? T : never>();
    const client: PublishedFormulaSelectionClient = {
      load: vi.fn((formulaId) =>
        formulaId === "first" ? first.promise : second.promise,
      ),
    };
    const apply = vi.fn();
    const coordinator = new PublishedFormulaSelectionCoordinator();

    const firstSelection = coordinator.select("first", client, apply);
    const secondSelection = coordinator.select("second", client, apply);

    second.resolve({ ok: true, value: artifact("second") });
    await expect(secondSelection).resolves.toEqual({ ok: true });
    first.resolve({ ok: true, value: artifact("first") });
    await expect(firstSelection).resolves.toEqual({
      ok: false,
      code: "selection-superseded",
    });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(artifact("second"));
  });

  it("commits the close boundary before applying the loaded artifact", async () => {
    const order: string[] = [];
    const coordinator = new PublishedFormulaSelectionCoordinator();
    const client: PublishedFormulaSelectionClient = {
      load: vi.fn(async () => ({ ok: true, value: artifact("ready") })),
    };

    await expect(
      coordinator.select(
        "ready",
        client,
        () => order.push("apply"),
        async () => {
          order.push("close");
          await Promise.resolve();
          order.push("paint-boundary");
        },
      ),
    ).resolves.toEqual({ ok: true });

    expect(order).toEqual(["close", "paint-boundary", "apply"]);
  });

  it("does not apply failed loads and supports explicit cancellation", async () => {
    const apply = vi.fn();
    const coordinator = new PublishedFormulaSelectionCoordinator();
    const failedClient: PublishedFormulaSelectionClient = {
      load: vi.fn(async () => ({
        ok: false as const,
        code: "definition-compile-failed" as const,
      })),
    };

    await expect(
      coordinator.select("broken", failedClient, apply),
    ).resolves.toEqual({
      ok: false,
      code: "definition-compile-failed",
    });
    expect(apply).not.toHaveBeenCalled();

    const pending = deferred<ReturnType<PublishedFormulaSelectionClient["load"]> extends Promise<infer T> ? T : never>();
    const pendingClient: PublishedFormulaSelectionClient = {
      load: vi.fn(() => pending.promise),
    };
    const selection = coordinator.select("pending", pendingClient, apply);
    coordinator.cancel();
    pending.resolve({ ok: true, value: artifact("pending") });

    await expect(selection).resolves.toEqual({
      ok: false,
      code: "selection-superseded",
    });
    expect(apply).not.toHaveBeenCalled();
  });
});
