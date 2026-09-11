import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import runtime from '../../public/formula-library/v1/runtime/published/index.json';
import type { probe } from './helpers/recovered-parameter-render-probe';

const id = '280cd3e2-865b-5c78-90b7-39b2a36d7be0';

test('published Mandelbox preserves unquantized native output, lifecycle boundaries and export', async ({ page }) => {
  test.setTimeout(120_000);
  const bundle = await build({ entryPoints: ['tests/e2e/helpers/recovered-parameter-render-probe.ts'],
    bundle: true, write: false, format: 'iife', globalName: 'RecoveredParameterProbe',
    platform: 'browser', loader: { '.glsl': 'text' },
  });
  await page.goto('/en/about');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const row = runtime.rows.find(row => row.formulaId === id)!;
  const result = await page.evaluate(async input => {
    const scope = window as unknown as { RecoveredParameterProbe: { probe: typeof probe } };
    return scope.RecoveredParameterProbe.probe(input);
  }, { ...row, source: readFileSync(`public/formula-library/v1/runtime/published/${row.definitionPath}`, 'utf8') });
  expect(result.comparisons).toEqual(Array(8).fill(0));
  expect(result.sceneComparisons).toEqual(Array(5).fill(0));
  expect(result.deepSceneColors).toBeGreaterThan(1);
  expect(result.scaleChanged).toBeGreaterThan(0);
  expect(result.juliaChanged).toBeGreaterThan(0);
  expect(result.restored).toBe(0);
  expect(result.exported).toBe(0);
});

for (const width of [390, 1000]) {
  test(`Mandelbox scale edits reach the Worker and survive reload and Julia exit at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 720 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    // Match the existing Julia-toggle camera policy so the round-trip compares
    // identical scene inputs, not the formula's different landing Profile.
    await page.goto(`/en/explore?fm=${id}&julia=1&jre=2&jim=-2&iter=60&cx=0&cy=0&z=0.4`);
    const canvas = page.getByTestId('fractal-canvas');
    const scale = page.locator('#published-frmV1_mandelboxScale');
    const pixels = async () => createHash('sha256')
      .update(await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL()))
      .digest('hex');
    await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 60_000 });
    await expect(page.locator('#julia-mode')).toBeChecked();
    const before = await pixels();
    await scale.fill('2.5');
    await scale.press('Tab');
    await expect.poll(() => new URL(page.url()).searchParams.get('pp')).toContain('frmV1_mandelboxScale:2.5|0');
    await expect.poll(pixels, { timeout: 60_000 }).not.toBe(before);
    await expect(canvas).toHaveAttribute('data-render-status', 'ready');
    const changed = await pixels();
    await page.reload();
    await expect(scale).toHaveValue('2.5');
    await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 60_000 });
    await expect.poll(pixels).toBe(changed);
    await page.locator('#julia-mode').click();
    await expect(page.locator('#julia-mode')).not.toBeChecked();
    await expect(scale).toHaveValue('2.5');
    await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 60_000 });
    await page.locator('#julia-mode').click();
    await expect.poll(pixels, { timeout: 60_000 }).toBe(changed);
    await canvas.screenshot({ path: testInfo.outputPath('mandelbox-parameter-restored.png') });
    expect(errors).toEqual([]);
  });
}
