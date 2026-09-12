import { expect, test, type Page } from '@playwright/test';

interface FrameProbe {
  hold: boolean;
  release: (fail?: boolean) => void;
  requests: string[];
  painted: string[];
  canvas?: HTMLCanvasElement;
}
declare global { interface Window { lastGoodFrameProbe: FrameProbe } }

test.setTimeout(120000);

async function pixels(page: Page) {
  return page.getByTestId('fractal-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    const probe: FrameProbe = { hold: false, release: () => {}, requests: [], painted: [] };
    window.lastGoodFrameProbe = probe;
    const NativeWorker = window.Worker;
    const identities = new WeakMap<object, string>();
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', (event) => {
          if (event.data.type === 'frame') identities.set(event.data.bitmap, event.data.formulaId);
        });
      }
      postMessage(message: unknown, transfer?: Transferable[]) {
        const request = message as { type: string; requestId: number; generation: number; params: { formula: string } };
        if (request.type === 'render') {
          probe.requests.push(request.params.formula);
          if (probe.hold) {
            probe.release = (fail = false) => {
              probe.hold = false;
              if (fail) this.dispatchEvent(new MessageEvent('message', { data: {
                type: 'error', requestId: request.requestId, generation: request.generation, message: 'Test render failure',
              } }));
              else super.postMessage(message, transfer ?? []);
            };
            return;
          }
        }
        super.postMessage(message, transfer ?? []);
      }
    };
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args: Parameters<typeof draw>) {
      if (this.canvas.dataset.testid === 'fractal-canvas') probe.painted.push(identities.get(args[0]) ?? 'unknown');
      return Reflect.apply(draw, this, args);
    };
  });
  await page.goto('/en/explore?fm=perpendicularCeltic&iter=24');
  await expect(page.getByTestId('fractal-canvas')).toHaveAttribute('data-render-status', 'ready', { timeout: 60000 });
  await page.evaluate(() => {
    window.lastGoodFrameProbe.canvas = document.querySelector('[data-testid="fractal-canvas"]') as HTMLCanvasElement;
    window.lastGoodFrameProbe.painted = [];
  });
});

for (const width of [1280, 390]) {
test(`Lucky keeps old pixels through loading, resize and supersession at ${width}px`, async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const canvas = page.getByTestId('fractal-canvas');
  await page.setViewportSize({ width, height: 900 });
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) =>
    element.width === Math.round(element.getBoundingClientRect().width * window.devicePixelRatio)
  )).toBe(true);
  await expect(canvas).toHaveAttribute('data-render-status', 'ready');
  const before = await pixels(page);
  await page.evaluate(() => {
    window.lastGoodFrameProbe.painted = [];
    window.lastGoodFrameProbe.hold = true;
    Math.random = () => 0.5;
  });
  await page.getByRole('button', { name: /feeling lucky/i }).click();
  await expect(page.getByTestId('explore-root')).not.toHaveAttribute('data-formula-id', 'perpendicularCeltic');
  await expect(canvas).toHaveAttribute('data-render-status', 'pending');
  expect(await pixels(page)).toBe(before);
  await expect(page.getByRole('button', { name: 'Save to Gallery', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: width === 390 ? 360 : 1100, height: 800 });
  expect(await pixels(page)).toBe(before);
  await page.screenshot({ path: testInfo.outputPath('retained-frame.png') });
  const firstTarget = await page.getByTestId('explore-root').getAttribute('data-formula-id');
  await page.evaluate(() => { Math.random = () => 0.25; });
  await page.getByRole('button', { name: /feeling lucky/i }).click();
  await expect(page.getByTestId('explore-root')).not.toHaveAttribute('data-formula-id', firstTarget!);
  const target = await page.getByTestId('explore-root').getAttribute('data-formula-id');
  await expect.poll(() => page.evaluate(() => window.lastGoodFrameProbe.requests.at(-1))).toBe(target);
  expect(await pixels(page)).toBe(before);
  expect(await page.evaluate(() => window.lastGoodFrameProbe.canvas === document.querySelector('[data-testid="fractal-canvas"]'))).toBe(true);
  expect(await page.evaluate(() => window.lastGoodFrameProbe.painted)).toEqual([]);
  await page.evaluate(() => window.lastGoodFrameProbe.release());
  await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 60000 });
  await expect(canvas).toHaveAttribute('data-rendered-formula-id', target!);
  expect(await page.evaluate(() => window.lastGoodFrameProbe.painted)).toEqual([target]);
  await expect(page.getByRole('button', { name: 'Save to Gallery', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeEnabled();
});
}

test('failed replacement retains the old frame and a later selection recovers', async ({ page }) => {
  test.setTimeout(120000);
  const before = await pixels(page);
  await page.evaluate(() => { window.lastGoodFrameProbe.hold = true; Math.random = () => 0.5; });
  await page.getByRole('button', { name: /feeling lucky/i }).click();
  await expect.poll(() => page.evaluate(() => window.lastGoodFrameProbe.requests.at(-1))).not.toBe('perpendicularCeltic');
  await page.evaluate(() => window.lastGoodFrameProbe.release(true));
  await expect(page.getByTestId('fractal-canvas')).toHaveAttribute('data-render-status', 'error');
  expect(await pixels(page)).toBe(before);
  await expect(page.getByRole('alert').filter({ hasText: /formula/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save to Gallery', exact: true })).toBeDisabled();
  await page.evaluate(() => { Math.random = () => 0.25; });
  await page.getByRole('button', { name: /feeling lucky/i }).click();
  await expect(page.getByTestId('fractal-canvas')).toHaveAttribute('data-render-status', 'ready', { timeout: 60000 });
  const target = await page.getByTestId('explore-root').getAttribute('data-formula-id');
  await expect(page.getByTestId('fractal-canvas')).toHaveAttribute('data-rendered-formula-id', target!);
  await expect(page.getByRole('button', { name: 'Save to Gallery', exact: true })).toBeEnabled();
});
