import { FractalRenderer } from './renderer';

/** @deprecated Use FractalRenderer instead */
export class MandelbrotRenderer extends FractalRenderer {
  init(): void {
    // no-op: FractalRenderer compiles lazily
  }
}
