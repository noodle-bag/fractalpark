import { chromium, expect, test, type Page } from '@playwright/test';

/**
 * Drift contract (Slice 2.1): the legacy homepage slideshow lives at
 * /[locale]/drift as an immersive, noindex playback page.
 *
 * - `noindex, follow`, own bilingual metadata and canonical/hreflang;
 * - no hero copy, no CTAs, no fullscreen mode, no Esc/background exit;
 * - the bottom bar holds exactly Play/Pause, Previous, Next;
 * - the transparent navbar with the static rainbow Drift entry stays usable.
 *
 * Every test launches its own browser: Drift runs two full-viewport WebGL
 * contexts with a crossfade, and under SwiftShader (CI/headless) the shared
 * worker browser dies on GPU-process teardown, poisoning subsequent tests.
 * Isolated browsers keep a crash from cascading; on real GPUs this is just
 * a small startup overhead.
 */

const SWIFTSHADER_ARGS = [
  '--use-angle=swiftshader',
  '--use-gl=angle',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--enable-gpu',
];

async function withIsolatedPage(
  viewport: { width: number; height: number },
  run: (page: Page) => Promise<void>
): Promise<void> {
  const browser = await chromium.launch({ args: SWIFTSHADER_ARGS });
  try {
    const context = await browser.newContext({
      baseURL: process.env.BASE_URL || 'http://localhost:3000',
      viewport,
    });
    const page = await context.newPage();
    await run(page);
  } finally {
    await browser.close();
  }
}

test.describe('Drift playback page', () => {
  test('serves noindex metadata with its own canonical and hreflang', async () => {
    await withIsolatedPage({ width: 1280, height: 720 }, async (page) => {
      await page.goto('/en/drift');

      await expect(page).toHaveTitle(/Drift/);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        'content',
        /noindex,\s*follow/
      );
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        'https://www.fractalpark.com/en/drift'
      );
      await expect(
        page.locator('link[rel="alternate"][hreflang="zh"]')
      ).toHaveAttribute('href', 'https://www.fractalpark.com/zh/drift');
      await expect(
        page.locator('link[rel="alternate"][hreflang="x-default"]')
      ).toHaveAttribute('href', 'https://www.fractalpark.com/en/drift');
    });
  });

  test('shows no hero content and exactly three playback controls', async () => {
    test.setTimeout(120000);
    await withIsolatedPage({ width: 480, height: 270 }, async (page) => {
      await page.goto('/en/drift', { waitUntil: 'domcontentloaded' });

      // No hero: no H1, no legacy homepage call-to-actions.
      await expect(page.locator('h1')).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: 'Start Exploring' })
      ).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: 'View on GitHub' })
      ).toHaveCount(0);

      // Exactly three accessible controls in the bottom bar (rendered once the
      // published-preset projection loads — slow under software rendering).
      const pauseButton = page.getByRole('button', { name: 'Pause animation' });
      const previousButton = page.getByRole('button', { name: 'Previous preset' });
      const nextButton = page.getByRole('button', { name: 'Next preset' });
      await expect(pauseButton).toBeVisible({ timeout: 60000 });
      await expect(previousButton).toBeVisible();
      await expect(nextButton).toBeVisible();

      // No fullscreen or exit affordances remain.
      await expect(
        page.getByRole('button', { name: /[Ff]ullscreen/ })
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: /Minimize/ })
      ).toHaveCount(0);

      // Previous starts disabled (no history yet); Next is available.
      await expect(previousButton).toBeDisabled();
      await expect(nextButton).toBeEnabled();

      // Wait for a live canvas before interacting: a mounted WebGL canvas
      // proves hydration completed and React listeners are attached —
      // clicking the SSR'd control bar before hydration is a dead click.
      await expect(page.locator('canvas').first()).toBeVisible({
        timeout: 90000,
      });

      // Pause toggles into Play and back. Once paused, the animation loop
      // stops producing rAF ticks, which can starve Playwright's rAF-driven
      // expect polling — so assert via waitForFunction with an interval.
      const buttonWithLabel = (label: string) =>
        page.waitForFunction(
          (text) =>
            document.querySelector(`button[aria-label="${text}"]`) !== null,
          label,
          { polling: 500, timeout: 30000 }
        );

      // DOM-level clicks with retry-until-effective: CDP mouse dispatch and
      // even individual synthetic clicks can be lost against the constantly
      // re-rendering slideshow under software rendering. A genuinely broken
      // control still fails — five real clicks on a dead handler never flip.
      const clickButtonWithLabel = (label: string) =>
        page.evaluate((text) => {
          const button = document.querySelector<HTMLElement>(
            `button[aria-label="${text}"]`
          );
          button?.click();
        }, label);
      const hasButtonWithLabel = (label: string) =>
        page
          .waitForFunction(
            (text) =>
              document.querySelector(`button[aria-label="${text}"]`) !== null,
            label,
            { polling: 250, timeout: 3000 }
          )
          .then(() => true)
          .catch(() => false);
      const clickUntilToggled = async (from: string, to: string) => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await clickButtonWithLabel(from);
          if (await hasButtonWithLabel(to)) return;
        }
        throw new Error(
          `clicking "${from}" never produced "${to}" after 5 attempts`
        );
      };

      await clickUntilToggled('Pause animation', 'Play animation');
      await clickUntilToggled('Play animation', 'Pause animation');

      // Esc does not exit anything or hide the controls.
      await page.keyboard.press('Escape');
      await buttonWithLabel('Pause animation');
    });
  });

  test('keeps the transparent navbar with the rainbow Drift entry usable', async () => {
    await withIsolatedPage({ width: 1280, height: 720 }, async (page) => {
      await page.goto('/en/drift');

      const header = page.locator('header');
      await expect(header).toHaveClass(/bg-transparent/);

      const driftLink = page.locator('header a[href="/en/drift"]').first();
      await expect(driftLink).toBeVisible();
      await expect(driftLink.locator('.nav-rainbow')).toHaveText('Drift');
      await expect(driftLink).toHaveAttribute('aria-current', 'page');

      // The navbar remains a working exit back to canonical Explore.
      await expect(
        page.locator('header a[href="/en/explore"]').first()
      ).toBeVisible();
    });
  });

  test('starts playing a published preset and survives re-navigation', async () => {
    test.setTimeout(180000);
    await withIsolatedPage({ width: 480, height: 270 }, async (page) => {
      await page.goto('/en/drift', { waitUntil: 'domcontentloaded' });

      // WebGL canvas mounts and plays the first preset.
      await expect(page.locator('canvas').first()).toBeVisible({
        timeout: 90000,
      });

      // Leaving and re-entering must not leak canvases or break controls.
      await page.goto('/en/explore');
      await page.goto('/en/drift');
      await expect(
        page.getByRole('button', { name: 'Pause animation' })
      ).toBeVisible({ timeout: 60000 });
      await expect(page.locator('canvas').first()).toBeVisible({
        timeout: 90000,
      });
    });
  });

  test('keeps the Chinese route localized', async () => {
    await withIsolatedPage({ width: 1280, height: 720 }, async (page) => {
      await page.goto('/zh/drift');

      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        'content',
        /noindex,\s*follow/
      );
      await expect(
        page.getByRole('button', { name: '暂停动画' })
      ).toBeVisible({ timeout: 60000 });
      await expect(
        page.getByRole('button', { name: '上一个预设' })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: '下一个预设' })
      ).toBeVisible();
      await expect(
        page.locator('header a[href="/zh/drift"] .nav-rainbow')
      ).toHaveText('沉浸播放');
    });
  });
});
