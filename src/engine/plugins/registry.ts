import type {
  FormulaPlugin,
  OutsideColoringPlugin,
  InsideColoringPlugin,
  TransformPlugin,
  FractalPlugin,
  PluginCategory,
} from './types';

export interface FormulaRegistryEvent {
  type: 'registered' | 'unregistered';
  formulaId: string;
}

export class PluginRegistry {
  private formulas = new Map<string, FormulaPlugin>();
  private outsideColoring = new Map<string, OutsideColoringPlugin>();
  private insideColoring = new Map<string, InsideColoringPlugin>();
  private transforms = new Map<string, TransformPlugin>();
  private formulaListeners = new Set<(event: FormulaRegistryEvent) => void>();

  register(plugin: FractalPlugin): void {
    switch (plugin.category) {
      case 'formula':
        this.formulas.set(plugin.id, plugin as FormulaPlugin);
        this.emitFormulaEvent({ type: 'registered', formulaId: plugin.id });
        break;
      case 'outsideColoring':
        this.outsideColoring.set(plugin.id, plugin as OutsideColoringPlugin);
        break;
      case 'insideColoring':
        this.insideColoring.set(plugin.id, plugin as InsideColoringPlugin);
        break;
      case 'transform':
        this.transforms.set(plugin.id, plugin as TransformPlugin);
        break;
      default:
        throw new Error(`Unknown plugin category: ${(plugin as FractalPlugin).category}`);
    }
  }

  unregister(category: PluginCategory, id: string): void {
    switch (category) {
      case 'formula':
        this.formulas.delete(id);
        this.emitFormulaEvent({ type: 'unregistered', formulaId: id });
        break;
      case 'outsideColoring':
        this.outsideColoring.delete(id);
        break;
      case 'insideColoring':
        this.insideColoring.delete(id);
        break;
      case 'transform':
        this.transforms.delete(id);
        break;
    }
  }

  getFormula(id: string): FormulaPlugin | undefined {
    return this.formulas.get(id);
  }

  getOutsideColoring(id: string): OutsideColoringPlugin | undefined {
    return this.outsideColoring.get(id);
  }

  getInsideColoring(id: string): InsideColoringPlugin | undefined {
    return this.insideColoring.get(id);
  }

  getTransform(id: string): TransformPlugin | undefined {
    return this.transforms.get(id);
  }

  listFormulas(): FormulaPlugin[] {
    return Array.from(this.formulas.values());
  }

  listOutsideColoring(): OutsideColoringPlugin[] {
    return Array.from(this.outsideColoring.values());
  }

  listInsideColoring(): InsideColoringPlugin[] {
    return Array.from(this.insideColoring.values());
  }

  listTransforms(): TransformPlugin[] {
    return Array.from(this.transforms.values());
  }

  hasFormula(id: string): boolean {
    return this.formulas.has(id);
  }

  hasOutsideColoring(id: string): boolean {
    return this.outsideColoring.has(id);
  }

  hasInsideColoring(id: string): boolean {
    return this.insideColoring.has(id);
  }

  hasTransform(id: string): boolean {
    return this.transforms.has(id);
  }

  subscribeToFormulaEvents(listener: (event: FormulaRegistryEvent) => void): () => void {
    this.formulaListeners.add(listener);
    return () => {
      this.formulaListeners.delete(listener);
    };
  }

  private emitFormulaEvent(event: FormulaRegistryEvent): void {
    for (const listener of this.formulaListeners) {
      listener(event);
    }
  }
}

export const pluginRegistry = new PluginRegistry();
