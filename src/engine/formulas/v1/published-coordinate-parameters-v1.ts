import executions from '../../../../resources/formula-library/v1/coordinate-parameter-execution.v1.json';
import fixedSeeds from '../../../../resources/formula-library/v1/fixed-seed-execution.v1.json';
import {
  compilePublishedFormulaPluginV1,
  type PublishedFormulaPluginArtifactV1,
} from './published-adapter';
import type { PublishedFormulaRuntimeResultV1 } from './published-runtime';

export const COORDINATE_SOURCE_UNIFORM = 'frmV1_pixelSource';
export const COORDINATE_VALUE_UNIFORM = 'frmV1_pixelConstant';
const byId = new Map([...executions.rows, ...fixedSeeds.rows].map(row => [row.formulaId, row]));
const fixedSeedById = new Map(fixedSeeds.rows.map(row => [row.formulaId, row]));
const executionRevisions = new WeakMap<PublishedFormulaPluginArtifactV1, string>();

export function fixedSeedModeV1(formulaId: string, sourceRevision: unknown): 'julia' | 'dynamical' | undefined {
  const row = fixedSeedById.get(formulaId);
  if (!row || row.baselineSourceRevision !== sourceRevision) return undefined;
  return row.mode === 'julia' ? 'julia' : 'dynamical';
}

export function hasCoordinateParametersV1(formulaId: string, sourceRevision: unknown): boolean {
  const row = byId.get(formulaId);
  return !!row && row.baselineSourceRevision === sourceRevision
    && fixedSeedModeV1(formulaId, sourceRevision) !== 'julia';
}

/** Only immutable, successfully compiled application projections are attested. */
export function publishedCoordinateExecutionRevisionV1(
  artifact: PublishedFormulaPluginArtifactV1,
): string | undefined {
  return executionRevisions.get(artifact);
}

/**
 * Compile exact reviewed coordinate/seed extensions without changing catalog identity.
 * Ordinary modes preserve their original initial state and parameters. Explicit
 * fixed-seed Julia/dynamical modes use the canvas seed only when selected.
 */
export async function applyPublishedCoordinateParametersV1(
  artifact: PublishedFormulaPluginArtifactV1,
): Promise<PublishedFormulaRuntimeResultV1<PublishedFormulaPluginArtifactV1>> {
  const { descriptor, plugin } = artifact;
  const execution = byId.get(descriptor.formulaId);
  if (!execution) return { ok: true, value: artifact };
  if (
    descriptor.sourceRevision !== execution.baselineSourceRevision
    || descriptor.semanticHash !== execution.baselineSemanticHash
    || plugin.id !== descriptor.formulaId
    || plugin.cacheFingerprint !== descriptor.sourceRevision
  ) return { ok: false, code: 'definition-compile-failed' };

  const compiled = await compilePublishedFormulaPluginV1({
    formulaId: plugin.id,
    displayName: plugin.name,
    family: plugin.family ?? 'other',
    sourceRevision: execution.sourceRevision,
    semanticHash: execution.semanticHash,
    source: execution.source,
  });
  if (!compiled.ok) return { ok: false, code: 'definition-compile-failed' };
  const parameters = compiled.value.descriptor.parameters;
  const julia = fixedSeedModeV1(descriptor.formulaId, descriptor.sourceRevision) === 'julia';
  if (
    parameters.length !== descriptor.parameters.length + (julia ? 0 : 2)
    || JSON.stringify(julia ? parameters : parameters.slice(0, -2)) !== JSON.stringify(descriptor.parameters)
    || (!julia && (parameters.at(-2)?.uniformName !== COORDINATE_SOURCE_UNIFORM
      || parameters.at(-1)?.uniformName !== COORDINATE_VALUE_UNIFORM))
  ) return { ok: false, code: 'descriptor-mismatch' };

  // Keep catalog identity separate from the extended execution descriptor and
  // shader cache. No existing URL/Document value is rewritten or migrated.
  const projected = Object.freeze({
    descriptor: Object.freeze({ ...descriptor, parameters }),
    backend: compiled.value.backend,
    plugin: Object.freeze({
      ...compiled.value.plugin,
      sourceRevision: descriptor.sourceRevision,
      executionSourceRevision: execution.sourceRevision,
    }),
  });
  executionRevisions.set(projected, execution.sourceRevision);
  return { ok: true, value: projected };
}
