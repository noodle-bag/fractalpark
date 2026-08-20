import type {
  PublishedFormulaPluginArtifactV1,
  PublishedFormulaRuntimeResultV1,
} from "@/engine/formulas/v1";

export interface PublishedFormulaSelectionClient {
  load(
    formulaId: string,
    signal?: AbortSignal,
  ): Promise<PublishedFormulaRuntimeResultV1<PublishedFormulaPluginArtifactV1>>;
}

export type PublishedFormulaBeforeApply = () => void | Promise<void>;

type PublishedFormulaSelectionFailureCode =
  Exclude<
    PublishedFormulaRuntimeResultV1<PublishedFormulaPluginArtifactV1>,
    { readonly ok: true }
  >["code"];

export type PublishedFormulaSelectionResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code:
        | PublishedFormulaSelectionFailureCode
        | "library-unavailable"
        | "selection-superseded";
    };

export class PublishedFormulaSelectionCoordinator {
  private generation = 0;
  private controller: AbortController | undefined;

  async select(
    formulaId: string,
    client: PublishedFormulaSelectionClient,
    apply: (artifact: PublishedFormulaPluginArtifactV1) => void,
    beforeApply?: PublishedFormulaBeforeApply,
  ): Promise<PublishedFormulaSelectionResult> {
    const generation = ++this.generation;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;

    const loaded = await client.load(formulaId, controller.signal);
    if (
      generation !== this.generation ||
      controller.signal.aborted
    ) {
      return { ok: false, code: "selection-superseded" };
    }
    if (!loaded.ok) return loaded;

    await beforeApply?.();
    if (
      generation !== this.generation ||
      controller.signal.aborted
    ) {
      return { ok: false, code: "selection-superseded" };
    }

    apply(loaded.value);
    if (this.controller === controller) this.controller = undefined;
    return { ok: true };
  }

  cancel(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = undefined;
  }
}
