import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const libraryRoot = join(root, 'public/formula-library/v1');
const indexText = await readFile(join(libraryRoot, 'runtime/published/index.json'), 'utf8');
const directory = JSON.parse(await readFile(join(libraryRoot, 'directory/index.json'), 'utf8'));
const index = JSON.parse(indexText);
const indexHash = createHash('sha256').update(indexText).digest('hex');
if (directory.sourceBindings.runtime.sha256 !== indexHash) {
  throw new Error('Published directory does not match the runtime index');
}
const alias = directory.runtimeAliases.find((entry) => entry.runtimeId === 'mandelbrot');
const row = index.rows.find((entry) => entry.formulaId === alias?.canonicalFormulaId);
if (!row || row.displayName !== 'mandelbrot') {
  throw new Error('Classic Mandelbrot alias is missing from the published index');
}
const source = await readFile(join(libraryRoot, 'runtime/published', row.definitionPath), 'utf8');
if (createHash('sha256').update(source).digest('hex') !== row.sourceRevision) {
  throw new Error('Classic Mandelbrot Definition does not match its source revision');
}
const output = `${JSON.stringify({
  schema: 'fractalpark-explore-default/v1',
  runtimeAlias: 'mandelbrot',
  row,
  source,
})}\n`;
const target = join(root, 'public/explore-default-formula.json');
if (process.argv.includes('--write')) {
  await writeFile(target, output);
} else if (await readFile(target, 'utf8') !== output) {
  throw new Error('Explore default is stale; run node scripts/generate-explore-default.mjs --write');
}
