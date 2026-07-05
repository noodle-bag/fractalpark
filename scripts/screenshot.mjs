import { chromium } from 'playwright';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// Homepage - English
await page.goto('http://localhost:3000/en');
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/myfrac-home-en-v2.png', fullPage: false });

// Gallery - English
await page.goto('http://localhost:3000/en/gallery');
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/myfrac-gallery-en-v2.png', fullPage: true });

// Mobile homepage
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mpage = await mobile.newPage();
await mpage.goto('http://localhost:3000/en');
await mpage.waitForTimeout(3000);
await mpage.screenshot({ path: '/tmp/myfrac-home-mobile-v2.png', fullPage: false });

// Mobile gallery
await mpage.goto('http://localhost:3000/en/gallery');
await mpage.waitForTimeout(3000);
await mpage.screenshot({ path: '/tmp/myfrac-gallery-mobile-v2.png', fullPage: true });

await mobile.close();
await context.close();
await browser.close();
console.log('Done!');
