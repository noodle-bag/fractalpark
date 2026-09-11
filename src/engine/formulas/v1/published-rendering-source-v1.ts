import type { FormulaPlugin } from '../../plugins/types';
import type { PublishedFormulaPluginArtifactV1 } from './published-adapter';

export interface PublishedRenderingPluginV1 extends FormulaPlugin {
  /** Validated Definition identity, not the shader program cache key. */
  readonly sourceRevision: string;
}

export function publishedRenderingSourceRevisionV1(plugin: FormulaPlugin): string | undefined {
  const revision = (plugin as Partial<PublishedRenderingPluginV1>).sourceRevision;
  return typeof revision === 'string' ? revision : undefined;
}

/** Attach validated source identity without changing the frozen compiler. */
export function bindPublishedRenderingSourceV1(
  artifact: PublishedFormulaPluginArtifactV1,
): PublishedRenderingPluginV1 {
  const { plugin, descriptor } = artifact;
  if (plugin.id !== descriptor.formulaId || plugin.cacheFingerprint !== descriptor.sourceRevision) {
    throw new Error('published-rendering-source-mismatch');
  }
  return Object.freeze({ ...plugin, sourceRevision: descriptor.sourceRevision });
}
