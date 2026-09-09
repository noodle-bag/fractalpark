import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import directoryAsset from '../../public/formula-library/v1/directory/index.json';
import runtimeIndexAsset from '../../public/formula-library/v1/runtime/published/index.json';
import presetsFile from '../../public/gallery-presets.json';
import type {
  PublishedFormulaPluginArtifactV1,
  PublishedFormulaRuntimeIndexRowV1,
} from '@/engine/formulas/v1';
import type { FormulaPlugin } from '@/engine/plugins/types';
import {
  resolvePublishedArtworkRuntime,
  resolvePublishedArtworkRuntimeAvailability,
  type PublishedArtworkLibraryLoader,
} from '@/lib/published-artwork-runtime';
import {
  buildPublishedArtworkCollection,
  buildPublishedArtworkPlayback,
} from '@/lib/published-artworks';
import {
  createPublishedFormulaLibraryClient,
  PUBLISHED_FORMULA_LIBRARY_DIRECTORY_URL,
  PUBLISHED_FORMULA_LIBRARY_INDEX_URL,
  PUBLISHED_FORMULA_LIBRARY_ROOT_URL,
  type PublishedFormulaLibraryClient,
} from '@/lib/published-formula-library';

const RUNTIME_ROOT = join(
  process.cwd(),
  'public/formula-library/v1/runtime/published',
);
const DIRECTORY_PATH = join(
  process.cwd(),
  'public/formula-library/v1/directory/index.json',
);

const runtimeRows = runtimeIndexAsset.rows as unknown as
  PublishedFormulaRuntimeIndexRowV1[];
const rowByFormulaId = new Map(
  runtimeRows.map((row) => [row.formulaId, row]),
);
const formulaIdByRuntimeId = new Map(
  directoryAsset.runtimeAliases.map((alias) => [
    alias.runtimeId,
    alias.canonicalFormulaId,
  ]),
);

function artifactFor(
  row: PublishedFormulaRuntimeIndexRowV1,
): PublishedFormulaPluginArtifactV1 {
  return {
    plugin: {
      id: row.formulaId,
      category: 'formula',
      name: row.displayName,
      source: 'frm',
      glsl: '',
      uniforms: [],
      bailout: 4,
      supportsPower: false,
      supportsJulia: false,
      cacheFingerprint: row.sourceRevision,
    } as FormulaPlugin,
    descriptor: {
      schema: row.descriptorSchema,
      formulaId: row.formulaId,
      sourceRevision: row.sourceRevision,
      semanticHash: row.semanticHash,
      parameters: row.parameters,
    },
  } as PublishedFormulaPluginArtifactV1;
}

function libraryLoader() {
  const load = vi.fn(async (formulaId: string) => {
    const row = rowByFormulaId.get(formulaId);
    return row
      ? { ok: true as const, value: artifactFor(row) }
      : { ok: false as const, code: 'formula-not-published' as const };
  });
  const client = {
    resolveRuntimeAlias(runtimeId: string) {
      const formulaId = formulaIdByRuntimeId.get(runtimeId);
      return formulaId ? rowByFormulaId.get(formulaId) : undefined;
    },
    load,
  } as unknown as PublishedFormulaLibraryClient;
  const loader: PublishedArtworkLibraryLoader = async () => ({
    ok: true,
    value: client,
  });
  return { client, load, loader };
}

describe('published artwork runtime', () => {
  it('keeps built-in parameter-plane playback on the synchronous safe path', async () => {
    const playback = buildPublishedArtworkPlayback(
      buildPublishedArtworkCollection(presetsFile, 'en')[0],
    );
    const loadLibrary = vi.fn<PublishedArtworkLibraryLoader>();

    const resolved = await resolvePublishedArtworkRuntime(
      playback,
      loadLibrary,
    );

    expect(resolved).toEqual({
      ok: true,
      value: { params: playback.params },
    });
    expect(loadLibrary).not.toHaveBeenCalled();
  });

  it('enables only the 18 Julia presets backed by active canonical revisions', async () => {
    const artworks = buildPublishedArtworkCollection(presetsFile, 'en');
    const juliaPlaybacks = artworks
      .map(buildPublishedArtworkPlayback)
      .filter((playback) => playback.runtimeFormula);
    const { loader } = libraryLoader();
    const resolved = await Promise.all(
      juliaPlaybacks.map(async (playback) => ({
        id: playback.id,
        availability: await resolvePublishedArtworkRuntimeAvailability(
          playback,
          loader,
        ),
      })),
    );

    expect(juliaPlaybacks).toHaveLength(19);
    expect(
      resolved.filter(({ availability }) => availability.available),
    ).toHaveLength(18);
    expect(
      resolved.filter(({ availability }) => !availability.available),
    ).toEqual([
      {
        id: 'preset-magnet-julia-ember-reach',
        availability: {
          available: false,
          reason: 'julia-unsupported',
        },
      },
    ]);
  });

  it('loads the canonical Julia plugin and preserves legacy preset parameters', async () => {
    const playback = buildPublishedArtworkCollection(presetsFile, 'en')
      .map(buildPublishedArtworkPlayback)
      .find(({ id }) => id === 'preset-phoenix-multi-ember-compass');
    const { load, loader } = libraryLoader();

    expect(playback).toBeDefined();
    const resolved = await resolvePublishedArtworkRuntime(playback!, loader);

    expect(resolved.ok ? 'ok' : resolved.reason).toBe('ok');
    if (!resolved.ok) return;
    expect(resolved.value.params.formula).toBe(
      formulaIdByRuntimeId.get('phoenixMulti'),
    );
    expect(resolved.value.params.isJulia).toBe(true);
    expect(resolved.value.params.pluginParams).toMatchObject({
      frmV1_phoenixMultiP: [-1.05, 0],
    });
    expect(resolved.value.params.pluginParams).not.toHaveProperty(
      'u_phoenixMultiP',
    );
    expect(resolved.value.formulaPlugin?.id).toBe(
      resolved.value.params.formula,
    );
    expect(resolved.value.formulaPlugin?.supportsJulia).toBe(false);
    expect(load).toHaveBeenCalledOnce();
  });

  it('compiles an active Julia preset from the shipped public library', async () => {
    const playback = buildPublishedArtworkCollection(presetsFile, 'en')
      .map(buildPublishedArtworkPlayback)
      .find(({ id }) => id === 'preset-lambda-julia-vortex');
    const loader: PublishedArtworkLibraryLoader = () =>
      createPublishedFormulaLibraryClient(async (input) => {
        const url = String(input);
        if (url === PUBLISHED_FORMULA_LIBRARY_INDEX_URL) {
          return new Response(
            readFileSync(join(RUNTIME_ROOT, 'index.json'), 'utf8'),
            { status: 200 },
          );
        }
        if (url === PUBLISHED_FORMULA_LIBRARY_DIRECTORY_URL) {
          return new Response(readFileSync(DIRECTORY_PATH, 'utf8'), {
            status: 200,
          });
        }
        const relative = url.slice(
          `${PUBLISHED_FORMULA_LIBRARY_ROOT_URL}/`.length,
        );
        return new Response(
          readFileSync(join(RUNTIME_ROOT, relative), 'utf8'),
          { status: 200 },
        );
      });

    expect(playback).toBeDefined();
    const resolved = await resolvePublishedArtworkRuntime(playback!, loader);

    expect(resolved.ok ? 'ok' : resolved.reason).toBe('ok');
    if (!resolved.ok) return;
    expect(resolved.value.params.isJulia).toBe(true);
    expect(resolved.value.formulaPlugin?.id).toBe(
      resolved.value.params.formula,
    );
  });

  it('fails closed before loading a formula without active Julia evidence', async () => {
    const playback = buildPublishedArtworkCollection(presetsFile, 'en')
      .map(buildPublishedArtworkPlayback)
      .find(({ id }) => id === 'preset-magnet-julia-ember-reach');
    const { load, loader } = libraryLoader();

    expect(playback).toBeDefined();
    await expect(
      resolvePublishedArtworkRuntime(playback!, loader),
    ).resolves.toEqual({
      ok: false,
      reason: 'julia-unsupported',
    });
    expect(load).not.toHaveBeenCalled();
  });

  it('fails closed when an authorized formula cannot be loaded', async () => {
    const playback = buildPublishedArtworkCollection(presetsFile, 'en')
      .map(buildPublishedArtworkPlayback)
      .find(({ id }) => id === 'preset-spider-julia-abyss');
    const { load, loader } = libraryLoader();
    load.mockRejectedValueOnce(new Error('network unavailable'));

    expect(playback).toBeDefined();
    await expect(
      resolvePublishedArtworkRuntime(playback!, loader),
    ).resolves.toEqual({
      ok: false,
      reason: 'formula-load-failed',
    });
  });
});
