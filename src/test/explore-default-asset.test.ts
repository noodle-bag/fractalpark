import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { getExploreDefaultDocument, getExploreDefaultFormula } from '@/lib/explore-default-formula';
import { getFormulaUniformDefaults } from '@/lib/formula-documents';

describe('Explore default formula asset', () => {
  it('matches the published alias, index row, and Definition', async () => {
    const root = join(process.cwd(), 'public/formula-library/v1');
    const indexText = await readFile(join(root, 'runtime/published/index.json'), 'utf8');
    const index = JSON.parse(indexText);
    const directory = JSON.parse(await readFile(join(root, 'directory/index.json'), 'utf8'));
    const bootstrap = JSON.parse(await readFile(join(process.cwd(), 'public/explore-default-formula.json'), 'utf8'));
    const alias = directory.runtimeAliases.find((entry: { runtimeId: string }) => entry.runtimeId === 'mandelbrot');
    const row = index.rows.find((entry: { formulaId: string }) => entry.formulaId === alias.canonicalFormulaId);
    const source = await readFile(join(root, 'runtime/published', row.definitionPath), 'utf8');
    expect(directory.sourceBindings.runtime.sha256).toBe(createHash('sha256').update(indexText).digest('hex'));
    expect(bootstrap.schema).toBe('fractalpark-explore-default/v1');
    expect(bootstrap.runtimeAlias).toBe('mandelbrot');
    expect(bootstrap.row).toEqual(row);
    expect(bootstrap.source).toBe(source);
    expect(row.sourceRevision).toBe(createHash('sha256').update(source).digest('hex'));
    const poster = await sharp(join(process.cwd(), 'public/images/formulas/explore-default.webp')).metadata();
    expect([poster.width, poster.height]).toEqual([512, 320]);
  });

  it('starts with the published identity and Profile before its plugin compiles', async () => {
    const bootstrap = getExploreDefaultFormula();
    const document = getExploreDefaultDocument();
    expect(document.formula.formulaId).toBe(bootstrap.row.formulaId);
    expect(document.scene.bounds).toEqual({ centerX: -0.5, centerY: 0, zoom: 0.4, rotation: 0 });
    expect(document.render.maxIterations).toBe(96);
    const result = await bootstrap.client.load(bootstrap.row.formulaId);
    expect(result.ok).toBe(true);
    if (result.ok) expect(getFormulaUniformDefaults(result.value.plugin)).toEqual({ frmV1_power: [2, 0] });
  });
});
