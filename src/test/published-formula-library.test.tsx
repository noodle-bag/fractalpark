// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublishedFormulaLibrary } from "@/components/fractal/PublishedFormulaLibrary";
import type {
  PublishedFormulaLibraryClient,
  PublishedFormulaLibraryClientResult,
} from "@/lib/published-formula-library";
import type { PublishedFormulaSelectionResult } from "@/lib/published-formula-selection";
import type { FormulaIdV1 } from "@/engine/formulas/v1";
import type { PublishedFormulaDirectoryRowV1 } from "@/content/published-formula-directory";
import type { PublishedFormulaDirectoryFamilyV1 } from "@/content/formula-directory-categories";

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
  const directoryRows = rows.map((row, index): PublishedFormulaDirectoryRowV1 => {
    const primaryFamily = row.family as PublishedFormulaDirectoryFamilyV1;
    const formulaId = row.formulaId as FormulaIdV1;
    return {
      formulaId,
      displayName: row.displayName,
      primaryFamily,
      categories: Object.freeze(
        index < Math.min(rowCount, 50)
          ? (["classic", primaryFamily] as const)
          : ([primaryFamily] as const),
      ),
      canonicalPath: `/formulas/${formulaId}`,
      guideSlug: null,
    };
  });
  return {
    index: {
      schema: "fractalpark-published-formula-runtime-index/v1",
      decisionRevision: 3,
      publicationDecisionsContentHash: "a".repeat(64),
      rowCount,
      rows,
    },
    directory: {
      rows: directoryRows,
      categoryCounts: {
        classic: Math.min(rowCount, 50),
        "algebraic-power": Math.ceil(rowCount / 2),
        transcendental: 1,
        "function-composition": 1,
        "rational-reciprocal": 1,
        "orbit-memory": 1,
        "folded-absolute": 1,
        "root-finding": Math.floor(rowCount / 2),
      },
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
  it("opens on Classic 94 and exposes All plus the seven structure categories", async () => {
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
    expect(
      screen.getByRole("group", { name: "formula.library.categoryFilter" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "formula.family.classic" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "formula.family.all" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "formula.family.algebraic-power" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "formula.family.transcendental" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "formula.family.function-composition" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "formula.family.rational-reciprocal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "formula.family.orbit-memory" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "formula.family.folded-absolute" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "formula.family.root-finding" })).toBeInTheDocument();
    expect(document.querySelectorAll("img")).toHaveLength(0);
    expect(await screen.findByRole("button", { name: "Formula 48" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Formula 49" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "formula.library.loadMore" }));
    expect(await screen.findByRole("button", { name: "Formula 50" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Formula 51" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "formula.family.all" }));
    expect(screen.queryByRole("button", { name: "Formula 49" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "formula.library.loadMore" }));
    expect(await screen.findByRole("button", { name: "Formula 60" })).toBeInTheDocument();
  }, 10_000);

  it("keeps Lucky and Library in one compact row while hiding Profile Reset and Undo", async () => {
    const onFeelingLucky = vi.fn(async (): Promise<PublishedFormulaSelectionResult> => ({
      ok: true,
    }));
    const onResetProfile = vi.fn(async (): Promise<PublishedFormulaSelectionResult> => ({
      ok: true,
    }));
    const onUndo = vi.fn();

    render(
      <PublishedFormulaLibrary
        currentFormula="00000000-0000-4000-8000-000000000001"
        loadClient={successfulClient(client(2))}
        onSelect={vi.fn(async (): Promise<PublishedFormulaSelectionResult> => ({ ok: true }))}
        onFeelingLucky={onFeelingLucky}
        onResetProfile={onResetProfile}
        canResetProfile
        canUndo
        onUndo={onUndo}
      />,
    );

    const actions = screen.getByTestId("published-formula-discovery-actions");
    expect(actions).toHaveClass("grid-cols-2");
    expect(actions).toContainElement(
      screen.getByRole("button", { name: "formula.library.lucky" }),
    );
    expect(actions).toContainElement(
      screen.getByRole("button", { name: "formula.library.open" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "formula.library.lucky" }));
    await waitFor(() => expect(onFeelingLucky).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "formula.library.resetProfile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "formula.library.undoFormulaChange" })).not.toBeInTheDocument();
    expect(onResetProfile).not.toHaveBeenCalled();
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("keeps only the latest rapid Lucky result visible and preserves failures", async () => {
    let finishFirst!: (result: PublishedFormulaSelectionResult) => void;
    let finishSecond!: (result: PublishedFormulaSelectionResult) => void;
    const onFeelingLucky = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<PublishedFormulaSelectionResult>((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<PublishedFormulaSelectionResult>((resolve) => {
            finishSecond = resolve;
          }),
      )
      .mockResolvedValueOnce({ ok: false, code: "definition-compile-failed" });

    render(
      <PublishedFormulaLibrary
        currentFormula="mandelbrot"
        loadClient={successfulClient(client(2))}
        onSelect={vi.fn(async (): Promise<PublishedFormulaSelectionResult> => ({ ok: true }))}
        onFeelingLucky={onFeelingLucky}
      />,
    );

    const lucky = screen.getByRole("button", {
      name: "formula.library.lucky",
    });
    fireEvent.click(lucky);
    fireEvent.click(lucky);
    expect(onFeelingLucky).toHaveBeenCalledTimes(2);

    finishFirst({ ok: false, code: "definition-compile-failed" });
    finishSecond({ ok: true });
    await waitFor(() =>
      expect(
        screen.queryByText("formula.library.selectionFailed"),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(lucky);
    await waitFor(() => expect(onFeelingLucky).toHaveBeenCalledTimes(3));
    expect(
      await screen.findByText("formula.library.selectionFailed"),
    ).toBeInTheDocument();
  });

  it("announces loading, exposes busy state, and rolls back a failed selection", async () => {
    let finishLoad!: (result: PublishedFormulaLibraryClientResult) => void;
    let finishSelection!: (result: PublishedFormulaSelectionResult) => void;
    const loadClient = vi.fn(
      () =>
        new Promise<PublishedFormulaLibraryClientResult>((resolve) => {
          finishLoad = resolve;
        }),
    );
    const onSelect = vi.fn(
      () =>
        new Promise<PublishedFormulaSelectionResult>((resolve) => {
          finishSelection = resolve;
        }),
    );

    render(
      <PublishedFormulaLibrary
        currentFormula="mandelbrot"
        loadClient={loadClient}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "formula.library.open" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("formula.library.loading");

    finishLoad({ ok: true, value: client(1) });
    const row = await screen.findByRole("button", { name: "Formula 1" });
    await waitFor(() => expect(dialog).toHaveAttribute("aria-busy", "false"));

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-busy", "true");
    expect(dialog).toHaveAttribute("aria-busy", "true");
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    finishSelection({ ok: false, code: "definition-compile-failed" });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "formula.library.selectionFailed",
    );
    expect(dialog).toBeInTheDocument();
    expect(row).toHaveAttribute("aria-busy", "false");
    expect(dialog).toHaveAttribute("aria-busy", "false");
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
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    finishSelection({ ok: false, code: "selection-superseded" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
