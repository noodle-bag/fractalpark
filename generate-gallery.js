async function generateGalleryImages() {
  const nodePath = await import('node:path');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1200 }
  });
  const page = await context.newPage();

  // Configuration for each screenshot
  const screenshots = [
    {
      name: 'gallery-1.png',
      palette: 'inferno',
      paletteIndex: 0,
      description: 'Inferno palette, default view - full Mandelbrot set',
      centerX: -0.5,
      centerY: 0,
      zoom: 0.8
    },
    {
      name: 'gallery-2.png',
      palette: 'ocean',
      paletteIndex: 1,
      description: 'Ocean palette, zoom into interesting spiral',
      centerX: -0.7,
      centerY: 0.1,
      zoom: 8
    },
    {
      name: 'gallery-3.png',
      palette: 'spectrum',
      paletteIndex: 2,
      description: 'Spectrum palette, deep zoom into edge details',
      centerX: -0.743643887037151,
      centerY: 0.131825904205330,
      zoom: 80
    },
    {
      name: 'gallery-4.png',
      palette: 'sakura',
      paletteIndex: 3,
      description: 'Sakura palette, mini-bulb zoom',
      centerX: -0.16,
      centerY: 1.0405,
      zoom: 25
    },
    {
      name: 'gallery-5.png',
      palette: 'moonlight',
      paletteIndex: 4,
      description: 'Moonlight palette, seahorse valley',
      centerX: -0.7454,
      centerY: 0.1127,
      zoom: 35
    },
    {
      name: 'gallery-6.png',
      palette: 'inferno',
      paletteIndex: 0,
      description: 'Inferno palette, different deep zoom area',
      centerX: -0.235125,
      centerY: 0.827215,
      zoom: 120
    }
  ];

  for (let i = 0; i < screenshots.length; i++) {
    const config = screenshots[i];
    console.log(`\nGenerating ${config.name}: ${config.description}`);

    // Navigate to explore page
    await page.goto('http://localhost:3000/explore', { waitUntil: 'networkidle' });

    // Wait for canvas to be ready
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1500); // Extra time for initial render

    // Select color palette by clicking the appropriate button
    console.log(`  Setting palette to: ${config.palette} (index ${config.paletteIndex})`);
    try {
      // Click the palette button by finding buttons and clicking the nth one
      const paletteButtons = page.locator('button').filter({ has: page.locator('div[class*="gradient"]') });
      await paletteButtons.nth(config.paletteIndex).click({ timeout: 5000 });
      console.log(`  ✓ Palette selected`);
    } catch (e) {
      console.log(`  ⚠ Could not select palette, using default: ${e.message}`);
    }
    await page.waitForTimeout(500);

    // Use wheel events to zoom to the target level
    // Double-click approach: each double-click zooms in by ~2x
    const canvas = page.locator('canvas').first();
    const canvasBox = await canvas.boundingBox();

    if (canvasBox && config.zoom > 0.8) {
      console.log(`  Zooming to ${config.zoom}x at (${config.centerX}, ${config.centerY})`);

      const centerX = canvasBox.x + canvasBox.width / 2;
      const centerY = canvasBox.y + canvasBox.height / 2;

      // Calculate how many double-clicks we need (each doubles the zoom)
      const zoomClicks = Math.floor(Math.log2(config.zoom / 0.8));

      for (let i = 0; i < zoomClicks; i++) {
        await page.mouse.dblclick(centerX, centerY);
        await page.waitForTimeout(400);
      }

      console.log(`  ✓ Applied ${zoomClicks} zoom clicks`);
    }

    // Wait for final render
    console.log(`  Waiting for render to complete...`);
    await page.waitForTimeout(2000);

    // Take screenshot of canvas
    console.log(`  Capturing screenshot...`);
    await canvas.screenshot({
      path: nodePath.join(process.cwd(), `public/images/gallery/${config.name}`),
      type: 'png'
    });

    console.log(`  ✓ Saved: ${config.name}`);
  }

  await browser.close();
  console.log('\n✓ All gallery images generated successfully!');
}

// Run the generator
generateGalleryImages().catch(console.error);
