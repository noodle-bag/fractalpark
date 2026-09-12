import { expect, test } from '@playwright/test';

const CLASSIC = '00e14aa8-b766-54ea-a359-3f5d20d329b7';

test('Lucky rendering stays responsive and a newer selection terminates it', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript((classicFormulaId) => {
    const state = {
      delayedPosts: 0,
      terminations: 0,
      ticks: 0,
    };
    Object.assign(window, { workerRenderProbe: state });
    setInterval(() => { state.ticks += 1; }, 20);

    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      private pendingTimers = new Set<number>();

      postMessage(message: unknown, transfer?: Transferable[]): void {
        const request = message as { type?: string; params?: { formula?: string } };
        if (request.type === 'render' && request.params?.formula !== classicFormulaId) {
          state.delayedPosts += 1;
          const timer = window.setTimeout(() => {
            this.pendingTimers.delete(timer);
            super.postMessage(message, transfer ?? []);
          }, 5000);
          this.pendingTimers.add(timer);
          return;
        }
        super.postMessage(message, transfer ?? []);
      }

      terminate(): void {
        state.terminations += 1;
        for (const timer of this.pendingTimers) window.clearTimeout(timer);
        this.pendingTimers.clear();
        super.terminate();
      }
    };
  }, CLASSIC);

  await page.goto('/en/explore');
  const canvas = page.getByTestId('fractal-canvas');
  await expect(canvas).toHaveAttribute('data-render-backend', 'worker');
  await expect(canvas).toHaveAttribute('data-rendered-formula-id', CLASSIC, {
    timeout: 90000,
  });

  const ticksBefore = await page.evaluate(() => (
    window as unknown as { workerRenderProbe: { ticks: number } }
  ).workerRenderProbe.ticks);
  await page.evaluate(() => { Math.random = () => 0.5; });
  await page.getByRole('button', { name: /feeling lucky/i }).click();
  await expect.poll(() => page.evaluate(() => (
    window as unknown as { workerRenderProbe: { delayedPosts: number } }
  ).workerRenderProbe.delayedPosts)).toBeGreaterThan(0);
  await expect(canvas).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('status').filter({ hasText: 'Loading formula' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (
    window as unknown as { workerRenderProbe: { ticks: number } }
  ).workerRenderProbe.ticks)).toBeGreaterThan(ticksBefore);

  const terminationsBefore = await page.evaluate(() => (
    window as unknown as { workerRenderProbe: { terminations: number } }
  ).workerRenderProbe.terminations);
  await page.getByRole('button', { name: 'Open Library', exact: true }).click();
  await page.locator(`button[data-formula-id="${CLASSIC}"]`).click();

  await expect.poll(() => page.evaluate(() => (
    window as unknown as { workerRenderProbe: { terminations: number } }
  ).workerRenderProbe.terminations)).toBeGreaterThan(terminationsBefore);
  await expect(canvas).toHaveAttribute('data-rendered-formula-id', CLASSIC, {
    timeout: 90000,
  });
  await expect(canvas).toHaveAttribute('aria-busy', 'false');
  await page.waitForTimeout(300);
  await expect(canvas).toHaveAttribute('data-rendered-formula-id', CLASSIC);
});
