async function generateGalleryImages() {
  const nodePath = await import('node:path');
  const { default: puppeteer } = await import('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1200 });

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

    // Navigate to explore page (use explicit locale)
    await page.goto('http://localhost:3000/en/explore', {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // Wait for canvas to be ready and fully loaded
    console.log(`  Waiting for canvas to render...`);
    await page.waitForSelector('canvas', { timeout: 30000 });

    // Wait for canvas to have content (not blank)
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      // Check if canvas has been drawn on by checking pixel data
      try {
        const imageData = ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1);
        return imageData.data[3] !== 0; // Alpha channel should not be 0 if rendered
      } catch {
        return false;
      }
    }, { timeout: 30000 });

    await page.waitForTimeout(1500); // Extra time for full render

    // Select color palette by clicking the appropriate button
    console.log(`  Setting palette to: ${config.palette} (index ${config.paletteIndex})`);
    try {
      // Find all palette buttons (they have gradient divs inside)
      const paletteButtons = await page.$$('button');
      let clickedPalette = false;

      for (const button of paletteButtons) {
        const hasGradient = await button.$('div[class*="gradient"]');
        if (hasGradient) {
          // This is a palette button, check if it's the right one
          const paletteText = await button.evaluate(el => el.textContent || '');
          if (paletteText.toLowerCase().includes(config.palette.toLowerCase())) {
            await button.click();
            clickedPalette = true;
            console.log(`  ✓ Palette selected: ${config.palette}`);
            break;
          }
        }
      }

      if (!clickedPalette) {
        // Fallback: click the nth palette button
        const gradientParents = await page.$$('button:has(div[class*="gradient"])');
        if (gradientParents.length > config.paletteIndex) {
          await gradientParents[config.paletteIndex].click();
          console.log(`  ✓ Palette selected by index: ${config.paletteIndex}`);
        }
      }
    } catch (e) {
      console.log(`  ⚠ Could not select palette: ${e.message}`);
    }
    await page.waitForTimeout(500);

    // Zoom by double-clicking on the canvas
    const canvas = await page.$('canvas');
    const canvasBox = await canvas.boundingBox();

    if (canvasBox && config.zoom > 0.8) {
      console.log(`  Zooming to ${config.zoom}x`);

      const centerX = canvasBox.x + canvasBox.width / 2;
      const centerY = canvasBox.y + canvasBox.height / 2;

      // Calculate how many double-clicks we need (each doubles the zoom)
      const zoomClicks = Math.floor(Math.log2(config.zoom / 0.8));

      for (let z = 0; z < zoomClicks; z++) {
        await page.mouse.click(centerX, centerY, { clickCount: 2, delay: 50 });
        await page.waitForTimeout(400);
      }

      console.log(`  ✓ Applied ${zoomClicks} zoom clicks`);
    }

    // Wait for final render
    console.log(`  Waiting for render to complete...`);
    await page.waitForTimeout(2000);

    // Take screenshot of canvas only
    console.log(`  Capturing screenshot...`);
    const canvasElement = await page.$('canvas');
    await canvasElement.screenshot({
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
