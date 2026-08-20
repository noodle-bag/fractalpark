// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublishedFormulaLibrary } from "@/components/fractal/PublishedFormulaLibrary";
import type {
  PublishedFormulaLibraryClient,
  PublishedFormulaLibraryClientResult,
} from "@/lib/published-formula-library";
import type { PublishedFormulaSelectionResult } from "@/lib/published-formula-selection";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values?.count === undefined ? key : `${key}:${String(values.count)}`,
}));

function client(rowCount = 60): PublishedFormulaLibraryClient {
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    formulaId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    displayName: `Formula ${index + 1}`,
    family: index % 2 === 0 ? "algebraic-power" : "root-finding",
    implementationBasis: "direct-adaptation" as const,
    sourceRevision: String(index + 1).padStart(64, "a").slice(-64),
    semanticHash: String(index + 1).padStart(64, "b").slice(-64),
    definitionPath: `definitions/${String(index + 1).padStart(64, "a").slice(-64)}.frm`,
    descriptorSchema: "fractalpark-published-formula-descriptor/v1" as const,
    parameters: [],
    profile: {
      schema: "fractalpark-published-formula-profile/v1" as const,
      quality: "mechanical" as const,
      mode: "parameter-plane" as const,
      center: [0, 0] as const,
      zoom: 1,
      rotation: 0,
      iterations: 100,
    },
  }));
  return {
    index: {
      schema: "fractalpark-published-formula-runtime-index/v1",
      decisionRevision: 3,
      publicationDecisionsContentHash: "a".repeat(64),
      rowCount,
      rows,
    },
    get: (formulaId) => rows.find((row) => row.formulaId === formulaId),
    load: vi.fn(),
  };
}

function successfulClient(value = client()): () => Promise<PublishedFormulaLibraryClientResult> {
  return async () => ({ ok: true, value });
}

afterEach(cleanup);

describe("PublishedFormulaLibrary", () => {
  it("opens a bounded published-only directory without text search", async () => {
    render(
      <PublishedFormulaLibrary
        currentFormula="mandelbrot"
        loadClient={successfulClient()}
        onSelect={vi.fn(async (): Promise<PublishedFormulaSelectionResult> => ({ ok: true }))}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "formula.library.open" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "formula.family.algebraic-power" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "formula.family.root-finding" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Formula 48" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Formula 49" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "formula.library.loadMore" }));
    expect(await screen.findByRole("button", { name: "Formula 60" })).toBeInTheDocument();
  });

  it("closes only after a successful selection and keeps failures visible", async () => {
    const onCancel = vi.fn();
    const onSelect = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: "definition-compile-failed" })
      .mockImplementationOnce(async (
        _formulaId: string,
        beforeApply?: () => void | Promise<void>,
      ) => {
        await beforeApply?.();
        return { ok: true };
      });
    render(
      <PublishedFormulaLibrary
        currentFormula="mandelbrot"
        loadClient={successfulClient(client(2))}
        onSelect={onSelect}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "formula.library.open" }));
    fireEvent.click(await screen.findByRole("button", { name: "Formula 1" }));
    expect(await screen.findByText("formula.library.selectionFailed")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Formula 2" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels an in-flight parent selection when the user closes the sheet", async () => {
    let finishSelection!: (result: PublishedFormulaSelectionResult) => void;
    const onSelect = vi.fn(
      () => new Promise<PublishedFormulaSelectionResult>((resolve) => {
        finishSelection = resolve;
      }),
    );
    const onCancel = vi.fn();
    render(
      <PublishedFormulaLibrary
        currentFormula="mandelbrot"
        loadClient={successfulClient(client(1))}
        onSelect={onSelect}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "formula.library.open" }));
    fireEvent.click(await screen.findByRole("button", { name: "Formula 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    finishSelection({ ok: false, code: "selection-superseded" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
