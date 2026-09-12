import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import index from '../../public/formula-library/v1/runtime/published/index.json';
import executions from '../../resources/formula-library/v1/coordinate-parameter-execution.v1.json';
import fixedSeeds from '../../resources/formula-library/v1/fixed-seed-execution.v1.json';
import type { probe } from './helpers/coordinate-render-probe';

let bundle: string;
test.beforeAll(async () => {
  const result = await build({
    entryPoints: ['tests/e2e/helpers/coordinate-render-probe.ts'],
    bundle: true, write: false, format: 'iife', globalName: 'CoordinateRenderProbe',
    platform: 'browser', loader: { '.glsl': 'text' },
  });
  bundle = result.outputFiles[0].text;
});

for (const execution of [...executions.rows, ...fixedSeeds.rows]) {
  const row = index.rows.find(row => row.formulaId === execution.formulaId)!;
  const name = `${'mode' in execution ? 'fixed-seed ' : ''}${row.displayName}`;
  test(`${name}: production WebGL canvas/fixed/export contract`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/en/about');
    await page.addScriptTag({ content: bundle });
    const input = { ...row, source: readFileSync(`public/formula-library/v1/runtime/published/${row.definitionPath}`, 'utf8') };
    const result = await page.evaluate(async input => {
      const scope = window as unknown as { CoordinateRenderProbe: { probe: typeof probe } };
      return scope.CoordinateRenderProbe.probe(input);
    }, input);
    expect(result.ordinaryChangedChannels).toBe(0);
    expect(result.restoredChangedChannels).toBe(0);
    expect(result.repeatedChangedChannels).toBe(0);
    expect(result.exportChangedChannels).toBe(0);
    expect(result.stateChangedChannels).toBeGreaterThan(0);
    expect(result.opaquePixels).toBe(1200);
  });
}
