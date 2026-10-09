import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

import {
  compilePublishedFormulaPluginV1,
  type FormulaProfileV1,
  type PublishedFormulaRuntimeIndexRowV1,
} from '../src/engine/formulas/v1/index';
import { resolveApplicationPublishedDefaultProfileV1 } from '../src/engine/formulas/v1/published-default-profile-corrections-v1';
import { renderProvisionalPreviewV1 } from '../src/engine/formulas/v1/provisional-preview';

async function main(): Promise<void> {
  const root = process.cwd();
  const asset = JSON.parse(await readFile(join(root, 'public/explore-default-formula.json'), 'utf8')) as {
    row: PublishedFormulaRuntimeIndexRowV1;
    source: string;
  };
  const { row, source } = asset;
  const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
  if (sha256(source) !== row.sourceRevision) throw new Error('Explore default source revision mismatch');
  const compiled = await compilePublishedFormulaPluginV1({
    formulaId: row.formulaId,
    displayName: row.displayName,
    family: row.family,
    sourceRevision: row.sourceRevision,
    semanticHash: row.semanticHash,
    source,
  });
  if (!compiled.ok) throw new Error(`Explore default compilation failed: ${compiled.code}`);

  const effective = resolveApplicationPublishedDefaultProfileV1(row);
  const profile: FormulaProfileV1 = {
    schemaVersion: 1,
    formulaId: row.formulaId as FormulaProfileV1['formulaId'],
    sourceRevision: row.sourceRevision as FormulaProfileV1['sourceRevision'],
    profileRevision: sha256(JSON.stringify(effective)) as FormulaProfileV1['profileRevision'],
    parameters: Object.fromEntries(row.parameters.map((parameter) => [parameter.slotName, parameter.default])),
    mode: effective.mode,
    ...(effective.juliaC ? { juliaC: effective.juliaC } : {}),
    view: {
      centerX: effective.center[0],
      centerY: effective.center[1],
      zoom: effective.zoom,
      rotation: effective.rotation,
    },
    iterations: effective.iterations,
    coloring: { pipelineVersion: 1, outsideColoringId: 'smooth', insideColoringId: 'black', smooth: true },
    palette: { paletteId: 'inferno' },
    transform: { rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, offsetX: 0, offsetY: 0 },
  };

  const width = 512;
  const height = 320;
  const preview = renderProvisionalPreviewV1(compiled.value.backend, profile, width, height);
  if (preview.anomalies.length > 0) throw new Error(`Explore default poster anomaly: ${preview.anomalies.join(', ')}`);
  const output = await sharp(Buffer.from(preview.rgba), { raw: { width, height, channels: 4 } })
    .webp({ quality: 84 })
    .toBuffer();
  const target = join(root, 'public/images/formulas/explore-default.webp');
  if (process.argv.includes('--write')) {
    await writeFile(target, output);
  } else if (!output.equals(await readFile(target))) {
    throw new Error('Explore default poster is stale; run npx tsx scripts/generate-explore-default-poster.ts --write');
  }
}

void main();
