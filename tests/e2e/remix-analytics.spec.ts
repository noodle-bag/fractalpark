import { expect, test, type Page } from '@playwright/test';

const ANALYTICS_STORAGE_KEY = 'fractalpark-e2e-analytics';

type AnalyticsEvent = [
  'event',
  string,
  Record<string, string | number | boolean> | undefined,
];

async function installAnalyticsRecorder(page: Page) {
  await page.addInitScript((storageKey) => {
    window.gtag = (...args: unknown[]) => {
      const events = JSON.parse(
        window.sessionStorage.getItem(storageKey) ?? '[]'
      );
      events.push(args);
      window.sessionStorage.setItem(storageKey, JSON.stringify(events));
    };
  }, ANALYTICS_STORAGE_KEY);
}

async function readEvents(page: Page): Promise<AnalyticsEvent[]> {
  return page.evaluate((storageKey) =>
    JSON.parse(window.sessionStorage.getItem(storageKey) ?? '[]'),
    ANALYTICS_STORAGE_KEY
  );
}

async function expectEvent(
  page: Page,
  name: string,
  params: Record<string, string | number | boolean>
) {
  await expect
    .poll(async () =>
      (await readEvents(page)).filter(
        ([command, eventName, eventParams]) =>
          command === 'event' &&
          eventName === name &&
          JSON.stringify(eventParams) === JSON.stringify(params)
      ).length
    )
    .toBe(1);
}

test.describe('Remix provenance and content analytics', () => {
  test('persists formula provenance after the navigation parameter is consumed', async ({
    page,
  }) => {
    await installAnalyticsRecorder(page);
    await page.goto('/en/formulas/mandelbrot');

    await expectEvent(page, 'view_formula', {
      formula_id: 'mandelbrot',
      locale: 'en',
    });

    const remix = page.getByRole('link', { name: 'Remix in Explorer' });
    const remixHref = await remix.getAttribute('href');
    expect(new URL(remixHref!, 'https://www.fractalpark.com').searchParams.get('remix'))
      .toBe('formula:mandelbrot');

    await remix.click();
    await expect(page.locator('[data-testid="fractal-canvas"]')).toBeVisible({
      timeout: 15000,
    });
    await expect(page).not.toHaveURL(/[?&]remix=/, { timeout: 5000 });
    await expectEvent(page, 'start_remix', {
      source_type: 'formula',
      source_id: 'mandelbrot',
    });
    // v0.4.16: saving from here is a cloud-first flow (anonymous → OTP
    // intent), so no localStorage record exists to assert. Provenance is
    // carried by the in-memory document and lands on the cloud draft when
    // the user explicitly saves.
  });

  test('tracks artwork views, successful copies, and preset Remix activation', async ({
    page,
  }) => {
    await installAnalyticsRecorder(page);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/en/gallery/newton-3-deep-spiral');

    await expectEvent(page, 'view_artwork', {
      preset_id: 'preset-newton-deep-spiral',
      locale: 'en',
    });

    await page.getByRole('button', { name: 'Copy page link' }).click();
    await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();
    await expectEvent(page, 'copy_page_link', {
      preset_id: 'preset-newton-deep-spiral',
    });

    const remix = page.getByRole('link', { name: 'Remix in Explorer' });
    const remixHref = await remix.getAttribute('href');
    expect(new URL(remixHref!, 'https://www.fractalpark.com').searchParams.get('remix'))
      .toBe('preset:preset-newton-deep-spiral');
    await remix.click();
    await expect(page).not.toHaveURL(/[?&]remix=/, { timeout: 5000 });
    await expectEvent(page, 'start_remix', {
      source_type: 'preset',
      source_id: 'preset-newton-deep-spiral',
    });
  });

  test('tracks allowlisted FRM examples when opening the Editor', async ({
    page,
  }) => {
    await installAnalyticsRecorder(page);
    await page.goto('/en/formulas/frm');

    await expectEvent(page, 'view_frm_guide', { locale: 'en' });
    const editorLink = page
      .getByRole('link', { name: 'Open in FRM Editor' })
      .first();
    const href = await editorLink.getAttribute('href');
    const exampleId = new URL(href!, 'https://www.fractalpark.com').searchParams.get(
      'example'
    );
    expect(exampleId).toBeTruthy();

    await editorLink.click();
    await expect(page).toHaveURL(new RegExp(`[?&]example=${exampleId}(?:[&#]|$)`));
    await expectEvent(page, 'open_formula_editor', {
      source_page: 'frm_guide',
      example_id: exampleId!,
      locale: 'en',
    });
  });

  test('tracks Atlas and formula-page Editor entries plus artwork examples', async ({
    page,
  }) => {
    await installAnalyticsRecorder(page);
    await page.goto('/en/formulas');
    await page.getByRole('link', { name: 'Open Formula Editor' }).first().click();
    await expectEvent(page, 'open_formula_editor', {
      source_page: 'atlas',
      locale: 'en',
    });

    await page.goto('/en/formulas/mandelbrot');
    await page.getByRole('link', { name: 'Open Formula Editor' }).click();
    await expectEvent(page, 'open_formula_editor', {
      source_page: 'formula',
      locale: 'en',
    });

    await page.goto('/en/formulas/mandelbrot');
    await page.getByRole('link', { name: 'View artwork' }).first().click();
    await expectEvent(page, 'open_example', {
      formula_id: 'mandelbrot',
      preset_id: 'preset-mandelbrot-deep-escape',
    });
  });
});
