import { expect, test, type Page } from '@playwright/test';

interface FrameProbe {
  hold: boolean;
  release: (fail?: boolean) => void;
  requests: Array<{ formula: string; juliaC: [number, number]; workerId: number }>;
  painted: string[];
  workersCreated: number;
  workersTerminated: number;
  terminatedWorkerIds: number[];
  mainWorkerId?: number;
  canvas?: HTMLCanvasElement;
}
declare global { interface Window { lastGoodFrameProbe: FrameProbe } }

test.setTimeout(120000);

async function pixels(page: Page) {
  return page.getByRole('main').getByTestId('fractal-canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
}

test.beforeEach(async ({ page, context }) => {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) await route.abort();
    else if (url.pathname.startsWith('/api/creation/')) await route.fulfill({ status: 401, json: { error: { code: 'unauthenticated' } } });
    else if (url.pathname.startsWith('/_vercel/')) await route.fulfill({ status: 204 });
    else await route.continue();
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    const probe: FrameProbe = {
      hold: false,
      release: () => {},
      requests: [],
      painted: [],
      workersCreated: 0,
      workersTerminated: 0,
      terminatedWorkerIds: [],
    };
    window.lastGoodFrameProbe = probe;
    const NativeWorker = window.Worker;
    const identities = new WeakMap<object, { formula: string; workerId: number }>();
    const heldReleases: Array<(fail?: boolean) => void> = [];
    window.Worker = class extends NativeWorker {
      readonly workerId: number;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        probe.workersCreated += 1;
        this.workerId = probe.workersCreated;
        this.addEventListener('message', (event) => {
          if (event.data.type === 'frame') {
            identities.set(event.data.bitmap, {
              formula: event.data.formulaId,
              workerId: this.workerId,
            });
          }
        });
      }
      terminate() {
        probe.workersTerminated += 1;
        probe.terminatedWorkerIds.push(this.workerId);
        super.terminate();
      }
      postMessage(message: unknown, transfer?: Transferable[]) {
        const request = message as {
          type: string;
          requestId: number;
          generation: number;
          params: { formula: string; juliaC: [number, number] };
        };
        if (request.type === 'render') {
          probe.requests.push({
            formula: request.params.formula,
            juliaC: request.params.juliaC,
            workerId: this.workerId,
          });
          if (probe.hold) {
            heldReleases.push((fail = false) => {
              if (fail) this.dispatchEvent(new MessageEvent('message', { data: {
                type: 'error', requestId: request.requestId, generation: request.generation, message: 'Test render failure',
              } }));
              else super.postMessage(message, transfer ?? []);
            });
            probe.release = (fail = false) => {
              probe.hold = false;
              const releases = heldReleases.splice(0);
              releases.forEach(release => release(fail));
            };
            return;
          }
        }
        super.postMessage(message, transfer ?? []);
      }
    };
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args: Parameters<typeof draw>) {
      if (this.canvas.dataset.testid === 'fractal-canvas') {
        const identity = identities.get(args[0]);
        if (this.canvas.closest('main')) {
          probe.painted.push(identity?.formula ?? 'unknown');
          if (identity) probe.mainWorkerId = identity.workerId;
        }
      }
      return Reflect.apply(draw, this, args);
    };
  });
  await page.goto('/en/explore?fm=perpendicularCeltic&iter=24');
  await expect(page.getByRole('main').getByTestId('fractal-canvas')).toHaveAttribute('data-render-status', 'ready', { timeout: 60000 });
  await page.evaluate(() => {
    window.lastGoodFrameProbe.canvas = document.querySelector('main [data-testid="fractal-canvas"]') as HTMLCanvasElement;
    window.lastGoodFrameProbe.requests = [];
    window.lastGoodFrameProbe.painted = [];
  });
});

for (const width of [1280, 390]) {
test(`Lucky keeps old pixels through loading, resize and supersession at ${width}px`, async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const canvas = page.getByRole('main').getByTestId('fractal-canvas');
  await page.setViewportSize({ width, height: 900 });
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) =>
    element.width === Math.round(element.getBoundingClientRect().width * window.devicePixelRatio)
  )).toBe(true);
  await expect(canvas).toHaveAttribute('data-render-status', 'ready');
  const artworkDisclosure = page.locator('.explore-artwork-disclosure > summary');
  const saveButton = page.getByRole('button', { name: 'Save to Gallery', exact: true });
  if (!(await saveButton.isVisible()) && await artworkDisclosure.isVisible()) {
    await artworkDisclosure.click();
  }
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
  await expect(saveButton).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: width === 390 ? 360 : 1100, height: 800 });
  expect(await pixels(page)).toBe(before);
  await page.screenshot({ path: testInfo.outputPath('retained-frame.png') });
  const firstTarget = await page.getByTestId('explore-root').getAttribute('data-formula-id');
  const requestCountBeforeSecond = await page.evaluate(() => window.lastGoodFrameProbe.requests.filter(
    request => request.workerId === window.lastGoodFrameProbe.mainWorkerId,
  ).length);
  await page.evaluate(() => { Math.random = () => 0.25; });
  await page.getByRole('button', { name: /feeling lucky/i }).click();
  await expect(page.getByTestId('explore-root')).not.toHaveAttribute('data-formula-id', firstTarget!);
  const target = await page.getByTestId('explore-root').getAttribute('data-formula-id');
  expect(await page.evaluate(() => window.lastGoodFrameProbe.requests.filter(
    request => request.workerId === window.lastGoodFrameProbe.mainWorkerId,
  ).length)).toBe(requestCountBeforeSecond);
  expect(await pixels(page)).toBe(before);
  expect(await page.evaluate(() => window.lastGoodFrameProbe.canvas === document.querySelector('main [data-testid="fractal-canvas"]'))).toBe(true);
  expect(await page.evaluate(() => window.lastGoodFrameProbe.painted)).toEqual([]);
  await page.evaluate(() => window.lastGoodFrameProbe.release());
  await expect.poll(() => page.evaluate(() => window.lastGoodFrameProbe.requests.filter(
    request => request.workerId === window.lastGoodFrameProbe.mainWorkerId,
  ).at(-1)?.formula)).toBe(target);
  await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 60000 });
  await expect(canvas).toHaveAttribute('data-rendered-formula-id', target!);
  expect(await page.evaluate(() => window.lastGoodFrameProbe.painted)).toEqual([target]);
  await expect(saveButton).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeEnabled();
});
}

test('rapid Julia dragging keeps one main Worker and renders the latest value', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  const canvas = page.getByRole('main').getByTestId('fractal-canvas');
  await page.locator('#julia-mode').click();
  await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 60000 });

  const plane = page.locator('[data-plane-picker="complex"]').first();
  await plane.scrollIntoViewIfNeeded();
  const box = (await plane.boundingBox())!;
  const mainWorkerId = await page.evaluate(() => window.lastGoodFrameProbe.mainWorkerId);
  await page.evaluate(() => {
    window.lastGoodFrameProbe.requests = [];
    window.lastGoodFrameProbe.painted = [];
    window.lastGoodFrameProbe.hold = true;
  });

  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  for (let step = 1; step <= 20; step += 1) {
    const ratio = 0.2 + step * 0.03;
    await page.mouse.move(box.x + box.width * ratio, box.y + box.height * ratio);
  }
  await page.mouse.up();

  await expect(canvas).toHaveAttribute('data-render-status', 'pending');
  const pendingRequests = await page.evaluate(workerId => window.lastGoodFrameProbe.requests.filter(
    request => request.workerId === workerId,
  ), mainWorkerId);
  expect(pendingRequests).toHaveLength(1);
  const displayedValue = await plane.locator('xpath=..').locator('.sr-only').textContent();
  const displayedNumbers = displayedValue?.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
  expect(displayedNumbers).toHaveLength(2);
  const expectedJuliaC = displayedNumbers as [number, number];

  await page.evaluate(() => window.lastGoodFrameProbe.release());
  await expect.poll(() => page.evaluate(workerId => window.lastGoodFrameProbe.requests.filter(
    request => request.workerId === workerId,
  ).length, mainWorkerId)).toBe(2);
  const latestRequest = await page.evaluate(workerId => window.lastGoodFrameProbe.requests.filter(
    request => request.workerId === workerId,
  ).at(-1), mainWorkerId);
  expect(latestRequest?.juliaC).toEqual(expectedJuliaC);
  await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 60000 });
  expect(await page.evaluate(() => window.lastGoodFrameProbe.painted)).toHaveLength(1);
  expect(await page.evaluate(() => window.lastGoodFrameProbe.mainWorkerId)).toBe(mainWorkerId);
  expect(await page.evaluate(workerId => window.lastGoodFrameProbe.terminatedWorkerIds.includes(workerId!), mainWorkerId)).toBe(false);
});

test('failed replacement retains the old frame and a later selection recovers', async ({ page }) => {
  test.setTimeout(120000);
  const before = await pixels(page);
  await page.evaluate(() => { window.lastGoodFrameProbe.hold = true; Math.random = () => 0.5; });
  await page.getByRole('button', { name: /feeling lucky/i }).click();
  await expect.poll(() => page.evaluate(() => window.lastGoodFrameProbe.requests.at(-1)?.formula)).not.toBe('perpendicularCeltic');
  await page.evaluate(() => window.lastGoodFrameProbe.release(true));
  await expect(page.getByRole('main').getByTestId('fractal-canvas')).toHaveAttribute('data-render-status', 'error');
  expect(await pixels(page)).toBe(before);
  await expect(page.getByRole('alert').filter({ hasText: /formula/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save to Gallery', exact: true })).toBeDisabled();
  await page.evaluate(() => { Math.random = () => 0.25; });
  await page.getByRole('button', { name: /feeling lucky/i }).click();
  await expect(page.getByRole('main').getByTestId('fractal-canvas')).toHaveAttribute('data-render-status', 'ready', { timeout: 60000 });
  const target = await page.getByTestId('explore-root').getAttribute('data-formula-id');
  await expect(page.getByRole('main').getByTestId('fractal-canvas')).toHaveAttribute('data-rendered-formula-id', target!);
  await expect(page.getByRole('button', { name: 'Save to Gallery', exact: true })).toBeEnabled();
});
