import { expect, test, type Page } from '@playwright/test';

const STORAGE_KEY = 'fractalpark-e2e-creator-analytics';

type AnalyticsEvent = [
  'event',
  string,
  Record<string, string | number | boolean> | undefined,
];

test.setTimeout(90_000);

async function installRecorder(page: Page) {
  await page.addInitScript((storageKey) => {
    localStorage.setItem('fractalpark.analytics.consent.v1', 'granted');
    window.gtag = (...args: unknown[]) => {
      const events = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]');
      events.push(args);
      sessionStorage.setItem(storageKey, JSON.stringify(events));
    };
  }, STORAGE_KEY);
}

async function eventsNamed(page: Page, eventName: string): Promise<AnalyticsEvent[]> {
  return page.evaluate(({ storageKey, name }) => {
    const events = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]');
    return events.filter((event: unknown[]) => event[0] === 'event' && event[1] === name);
  }, { storageKey: STORAGE_KEY, name: eventName });
}

test('measures one ordered creator loop and excludes non-user renders', async ({ page }) => {
  await installRecorder(page);
  await page.goto('/en/explore?fm=m&remix=formula:mandelbrot');

  const canvas = page.getByTestId('fractal-canvas');
  await expect(canvas).toHaveAttribute('data-render-status', 'ready', {
    timeout: 30_000,
  });
  await expect.poll(() => eventsNamed(page, 'first_render_complete')).toHaveLength(1);
  await expect.poll(() => eventsNamed(page, 'creator_render_complete')).toHaveLength(1);
  await expect.poll(() => eventsNamed(page, 'remix_complete')).toHaveLength(1);
  expect((await eventsNamed(page, 'remix_complete'))[0][2]).toMatchObject({
    source_type: 'formula',
    source_id: 'mandelbrot',
    completion_surface: 'explore_render',
  });
  expect(await eventsNamed(page, 'creator_change')).toHaveLength(0);
  expect(await eventsNamed(page, 'creator_loop_complete')).toHaveLength(0);

  await page.setViewportSize({ width: 1200, height: 720 });
  await expect(canvas).toHaveAttribute('data-render-status', 'ready', {
    timeout: 30_000,
  });
  expect(await eventsNamed(page, 'creator_change')).toHaveLength(0);
  expect(await eventsNamed(page, 'creator_loop_complete')).toHaveLength(0);

  await canvas.hover();
  await page.mouse.wheel(0, -300);
  await expect.poll(() => eventsNamed(page, 'creator_change')).toHaveLength(1);
  await expect.poll(() => eventsNamed(page, 'creator_loop_complete'), {
    timeout: 30_000,
  }).toHaveLength(1);

  const [completion] = await eventsNamed(page, 'creator_loop_complete');
  expect(completion[2]).toMatchObject({
    surface: 'explore',
    change_id: 1,
    change_type: 'viewport',
    traffic_class: 'automation',
    traffic_type: 'internal',
  });

  await page.getByRole('button', { name: 'Reset Artwork' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect.poll(() => eventsNamed(page, 'creator_change')).toHaveLength(2);
  expect((await eventsNamed(page, 'creator_change'))[1][2]).toMatchObject({
    change_type: 'reset',
  });

  await page.getByRole('button', { name: 'Reset Artwork' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-render-status', 'ready', {
    timeout: 30_000,
  });
  expect(await eventsNamed(page, 'creator_change')).toHaveLength(2);

  await canvas.hover();
  await page.mouse.wheel(0, -300);
  await expect.poll(() => eventsNamed(page, 'creator_change')).toHaveLength(3);
  await expect(canvas).toHaveAttribute('data-render-status', 'ready', {
    timeout: 30_000,
  });
  expect(await eventsNamed(page, 'creator_loop_complete')).toHaveLength(1);

  await page.reload();
  await expect(canvas).toHaveAttribute('data-render-status', 'ready', {
    timeout: 30_000,
  });
  expect(await eventsNamed(page, 'creator_loop_complete')).toHaveLength(1);
});
