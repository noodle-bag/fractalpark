import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import type { probe } from './helpers/recovered-runtime-render-probe';

for (const name of ['Cobalt Bastion', 'Gilded Plumes', 'Penitent Mandala']) {
  test(`${name} uses matching Gallery, native Explore and tiled rendering`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const bundle = await build({ entryPoints: ['tests/e2e/helpers/recovered-runtime-render-probe.ts'],
      bundle: true, write: false, format: 'iife', globalName: 'RecoveredRuntimeProbe',
      platform: 'browser', loader: { '.glsl': 'text' },
    });
    await page.goto('/en/about');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const result = await page.evaluate(async name => {
      const scope = window as unknown as { RecoveredRuntimeProbe: { probe: typeof probe } };
      return scope.RecoveredRuntimeProbe.probe(name);
    }, name);
    expect(result.differencesByMode.length).toBeGreaterThanOrEqual(8);
    expect(result.differencesByMode.every(value => value === 0)).toBe(true);
    await testInfo.attach('reviewed-render', { body: Buffer.from(result.png.split(',')[1], 'base64'), contentType: 'image/png' });
  });
}
