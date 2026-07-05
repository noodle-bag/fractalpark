import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const presetsPath = resolve(projectRoot, 'public/gallery-presets.json');
const outputDir = resolve(projectRoot, 'public/images/gallery/presets');

const DEFAULT_PORT = Number(process.env.THUMBNAIL_PORT || 3001);
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${DEFAULT_PORT}`;
const THUMBNAIL_SIZE = 600;
const THUMBNAIL_QUALITY = 0.9;

function parseArgs(argv) {
  const options = {
    force: false,
    presetId: null,
  };

  for (const arg of argv) {
    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg.startsWith('--id=')) {
      options.presetId = arg.slice('--id='.length);
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      console.log(`Usage: npm run thumbnails:presets -- [--id=<preset-id>] [--force]

Options:
  --id=<preset-id>  Generate a thumbnail only for the specified preset
  --force           Regenerate thumbnails even if the output file already exists
`);
      process.exit(0);
    }
  }

  return options;
}

function loadPresets() {
  return JSON.parse(readFileSync(presetsPath, 'utf-8'));
}

function savePresets(data) {
  writeFileSync(presetsPath, `${JSON.stringify(data, null, 2)}\n`);
}

function thumbnailPublicPath(presetId) {
  return `/images/gallery/presets/${presetId}.jpg`;
}

function thumbnailFilePath(presetId) {
  return resolve(outputDir, `${presetId}.jpg`);
}

async function isServerReady(baseUrl) {
  try {
    const response = await fetch(baseUrl, { redirect: 'manual' });
    return response.status > 0;
  } catch {
    return false;
  }
}

async function waitForServer(baseUrl, timeoutMs = 120000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await isServerReady(baseUrl)) {
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }

  throw new Error(`Timed out waiting for local server at ${baseUrl}`);
}

async function ensureServer(baseUrl) {
  if (await isServerReady(baseUrl)) {
    return {
      started: false,
      stop: async () => {},
    };
  }

  console.log(`[thumbnails] Starting local Next server at ${baseUrl}`);
  const server = spawn(
    'npm',
    ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', String(DEFAULT_PORT)],
    {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        PORT: String(DEFAULT_PORT),
      },
    }
  );

  try {
    await waitForServer(baseUrl);
  } catch (error) {
    server.kill('SIGTERM');
    throw error;
  }

  return {
    started: true,
    stop: async () => {
      if (!server.killed) {
        server.kill('SIGTERM');
      }
    },
  };
}

async function waitForCanvasReady(page) {
  const canvasHandle = await page.waitForSelector('canvas', {
    state: 'attached',
    timeout: 30000,
  });

  await page.waitForFunction(
    (canvas) => {
      if (!(canvas instanceof HTMLCanvasElement)) return false;
      return canvas.width > 0 && canvas.height > 0;
    },
    canvasHandle,
    { timeout: 30000 }
  );

  return canvasHandle;
}

async function captureCanvasJpeg(canvasHandle) {
  const dataUrl = await canvasHandle.evaluate(
    (canvas, { size, quality }) => {
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('Thumbnail canvas not found');
      }
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = size;
      exportCanvas.height = size;

      const ctx = exportCanvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to create 2D context for thumbnail export');
      }

      ctx.drawImage(canvas, 0, 0, size, size);
      return exportCanvas.toDataURL('image/jpeg', quality);
    },
    { size: THUMBNAIL_SIZE, quality: THUMBNAIL_QUALITY }
  );

  return Buffer.from(dataUrl.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
}

async function renderPresetThumbnail(page, preset) {
  const renderUrl = `${BASE_URL}/en/thumbnail${preset.url}`;
  console.log(`[thumbnails] Rendering ${preset.id} -> ${renderUrl}`);

  await page.goto(renderUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  const canvasHandle = await waitForCanvasReady(page);
  await page.waitForTimeout(1500);

  return captureCanvasJpeg(canvasHandle);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const presetsFile = loadPresets();

  const presets = options.presetId
    ? presetsFile.presets.filter((preset) => preset.id === options.presetId)
    : presetsFile.presets;

  if (presets.length === 0) {
    throw new Error(
      options.presetId
        ? `Preset "${options.presetId}" not found in gallery-presets.json`
        : 'No presets found in gallery-presets.json'
    );
  }

  mkdirSync(outputDir, { recursive: true });

  const server = await ensureServer(BASE_URL);
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--enable-gpu',
      '--use-gl=angle',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') {
      console.log(`[browser error] ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    console.log(`[page error] ${error.message}`);
  });

  try {
    let changed = false;

    for (const preset of presets) {
      const outputPath = thumbnailFilePath(preset.id);
      const publicPath = thumbnailPublicPath(preset.id);
      const shouldRender =
        options.force ||
        preset.thumbnail !== publicPath ||
        !existsSync(outputPath);

      if (!shouldRender) {
        console.log(`[thumbnails] Skipping ${preset.id} (already linked)`);
        continue;
      }

      const jpeg = await renderPresetThumbnail(page, preset);
      writeFileSync(outputPath, jpeg);

      preset.thumbnail = publicPath;
      changed = true;

      console.log(`[thumbnails] Saved ${publicPath} (${(jpeg.length / 1024).toFixed(1)} KB)`);
    }

    if (changed) {
      savePresets(presetsFile);
      console.log('[thumbnails] gallery-presets.json updated');
    } else {
      console.log('[thumbnails] No preset metadata changes needed');
    }
  } finally {
    await page.close();
    await context.close();
    await browser.close();
    await server.stop();
  }
}

main().catch((error) => {
  console.error(`[thumbnails] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
