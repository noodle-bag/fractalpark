import { expect, test } from '@playwright/test';

const CLASSIC = '00e14aa8-b766-54ea-a359-3f5d20d329b7';

test('Lucky compilation yields to UI and a newer selection wins', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    const state = { hold: false, polls: 0, blockingQueries: 0, draws: 0, ticks: 0 };
    Object.assign(window, { compileProbe: state });
    setInterval(() => { state.ticks += 1; }, 20);
    const get = WebGLRenderingContext.prototype.getProgramParameter;
    let heldProgram: WebGLProgram | undefined;
    WebGLRenderingContext.prototype.getProgramParameter = function (program, parameter) {
      if (state.hold) {
        if (parameter === 0x91b1 && !heldProgram) heldProgram = program;
        if (program === heldProgram) {
          if (parameter === 0x91b1) { state.polls += 1; return false; }
          if (parameter === this.LINK_STATUS || parameter === this.ACTIVE_UNIFORMS) state.blockingQueries += 1;
        }
      }
      return get.call(this, program, parameter);
    };
    const draw = WebGLRenderingContext.prototype.drawArrays;
    WebGLRenderingContext.prototype.drawArrays = function (...args) {
      state.draws += 1;
      return draw.apply(this, args);
    };
  });
  await page.goto('/en/explore');
  const canvas = page.getByTestId('fractal-canvas');
  await expect(canvas).toHaveAttribute('data-rendered-formula-id', CLASSIC, { timeout: 30000 });
  test.skip(!await canvas.evaluate((element: HTMLCanvasElement) => Boolean(
    element.getContext('webgl')?.getExtension('KHR_parallel_shader_compile'),
  )), 'The non-blocking compile contract needs KHR_parallel_shader_compile; fallback responsiveness remains unresolved.');
  const ticks = await page.evaluate(() => {
    const state = (window as unknown as { compileProbe: { hold: boolean; ticks: number } }).compileProbe;
    state.hold = true;
    Math.random = () => 0.5;
    return state.ticks;
  });
  await page.getByRole('button', { name: /feeling lucky/i }).click();
  await expect.poll(() => page.evaluate(() => (
    window as unknown as { compileProbe: { polls: number } }
  ).compileProbe.polls)).toBeGreaterThan(2);
  await expect(canvas).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('status').filter({ hasText: 'Loading formula' })).toBeVisible();
  const probe = await page.evaluate(() => (window as unknown as {
    compileProbe: { ticks: number; blockingQueries: number };
  }).compileProbe);
  expect(probe.ticks).toBeGreaterThan(ticks);
  expect(probe.blockingQueries).toBe(0);

  await page.getByRole('button', { name: 'Open Library', exact: true }).click();
  await page.locator(`button[data-formula-id="${CLASSIC}"]`).click();
  await expect(canvas).toHaveAttribute('data-rendered-formula-id', CLASSIC);
  await expect(canvas).toHaveAttribute('aria-busy', 'false');
  const draws = await page.evaluate(() => {
    const state = (window as unknown as { compileProbe: { hold: boolean; draws: number } }).compileProbe;
    state.hold = false;
    return state.draws;
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as {
    compileProbe: { draws: number };
  }).compileProbe.draws)).toBe(draws);
  await expect(canvas).toHaveAttribute('data-rendered-formula-id', CLASSIC);
});

test('fixed Lucky samples render with non-blocking compile queries', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 800, height: 600 });
  await page.addInitScript(() => {
    const trace: { name: string; ms: number }[] = [];
    Object.assign(window, { glTrace: trace });
    for (const name of ['getShaderParameter', 'getProgramParameter', 'drawArrays'] as const) {
      const original = WebGLRenderingContext.prototype[name];
      // These overloads are deliberately instrumented only in the test browser.
      Object.defineProperty(WebGLRenderingContext.prototype, name, { value: function (...args: unknown[]) {
        const start = performance.now();
        const result = Reflect.apply(original, this, args);
        trace.push({ name, ms: performance.now() - start });
        return result;
      } });
    }
  });
  await page.goto('/en/explore');
  const canvas = page.getByTestId('fractal-canvas');
  await expect(canvas).toHaveAttribute('data-rendered-formula-id', CLASSIC, { timeout: 30000 });
  test.skip(!await canvas.evaluate((element: HTMLCanvasElement) => Boolean(
    element.getContext('webgl')?.getExtension('KHR_parallel_shader_compile'),
  )), 'The non-blocking compile contract needs KHR_parallel_shader_compile; fallback responsiveness remains unresolved.');
  for (const sample of [0.5, 0.99]) {
    await page.evaluate((value) => { Math.random = () => value; }, sample);
    const previous = await page.getByTestId('explore-root').getAttribute('data-formula-id');
    await page.getByRole('button', { name: /feeling lucky/i }).click();
    await expect(page.getByTestId('explore-root')).not.toHaveAttribute('data-formula-id', previous!);
    const current = await page.getByTestId('explore-root').getAttribute('data-formula-id');
    await expect(canvas).toHaveAttribute('data-rendered-formula-id', current!, { timeout: 30000 });
  }
  const trace = await page.evaluate(() => (window as unknown as { glTrace: unknown }).glTrace);
  await testInfo.attach('webgl-timings.json', { body: JSON.stringify(trace), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('lucky-rendered.png') });
});
