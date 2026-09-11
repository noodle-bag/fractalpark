import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import runtime from '../../public/formula-library/v1/runtime/published/index.json';
import type { probe } from './helpers/newton-render-probe';

test('Ember restores historical math across native, published and Gallery with independent AA checks', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const row = runtime.rows.find(row => row.displayName === 'newtonCosh')!;
  const bundle = await build({ entryPoints: ['tests/e2e/helpers/newton-render-probe.ts'],
    bundle: true, write: false, format: 'iife', globalName: 'NewtonProbe', platform: 'browser', loader: { '.glsl': 'text' },
  });
  await page.goto('/en/about'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const samples = await page.evaluate(async input => {
    const scope = window as unknown as { NewtonProbe: { probe: typeof probe } };
    return scope.NewtonProbe.probe(input);
  }, { ...row, source: readFileSync(`public/formula-library/v1/runtime/published/${row.definitionPath}`, 'utf8') });
  expect(samples).toHaveLength(10);
  for (const sample of samples) {
    expect(sample.differences).toEqual([0, 0, 0, 0]);
    await writeFile(testInfo.outputPath(`frame-${sample.time}-aa-${sample.useSSAA}.png`), Buffer.from(sample.png.split(',')[1], 'base64'));
  }
});

for (const formula of ['newtonCosh', 'a89891b1-8ccb-5d58-9fbb-05944b85ce3c']) {
  test(`Newton ${formula} keeps Julia unavailable and reloads the same image`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 760 });
    await page.goto(`/en/explore?fm=${formula}&cx=0.0000094944&cy=-2.7954909613&z=1784.86&iter=200`);
    const canvas = page.getByTestId('fractal-canvas');
    await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 45_000 });
    await expect(page.locator('#julia-mode')).toHaveCount(0);
    const before = await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL());
    await page.reload();
    await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 45_000 });
    await expect.poll(() => canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL())).toBe(before);
  });
}
