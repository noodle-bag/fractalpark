import { expect, test } from '@playwright/test';
import { SITE } from '../../src/lib/site';

for (const locale of ['en', 'zh', 'es', 'fr', 'pt', 'ru', 'ko']) {
  test(`release version is consistent in server-rendered ${locale} product metadata`, async ({ browser, baseURL }, testInfo) => {
    const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      for (const route of ['explore', 'about']) {
        const response = await page.goto(`/${locale}/${route}`);
        expect(response?.status()).toBe(200);
        const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
        const applications = scripts.map(text => JSON.parse(text))
          .filter(value => value['@type'] === 'SoftwareApplication');
        expect(applications).toHaveLength(1);
        expect(applications[0].softwareVersion).toBe(SITE.version);
        await expect(page.locator('body')).not.toHaveText('');
        if (locale === 'en' && route === 'about') {
          await page.screenshot({ path: testInfo.outputPath('about.png') });
        }
      }
    } finally {
      await context.close();
    }
  });
}
