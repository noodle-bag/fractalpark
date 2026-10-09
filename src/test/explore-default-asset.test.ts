import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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
  });
});
