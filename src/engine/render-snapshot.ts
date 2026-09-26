import type { FractalDocument } from './document';
import { documentToRuntimeParams } from './document-adapter';
import type { FractalParams, ViewBounds } from './types';

declare const renderSnapshotBrand: unique symbol;

export type RenderSnapshot = FractalParams & {
  readonly [renderSnapshotBrand]: true;
};

export interface RenderSnapshotOverrides {
  bounds?: ViewBounds;
  maxIterations?: number;
  useSSAA?: boolean;
  ssaaLevel?: number;
}

export function createRenderSnapshot(
  document: FractalDocument,
  overrides: RenderSnapshotOverrides = {}
): RenderSnapshot {
  return {
    ...documentToRuntimeParams(document),
    ...overrides,
  } as RenderSnapshot;
}
