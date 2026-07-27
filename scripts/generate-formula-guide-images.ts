import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium, type Page } from 'playwright';
import {
  PUBLISHED_FORMULA_GUIDES,
  formulaGuideImagePath,
  formulaGuideOpenGraphImagePath,
} from '@/content/formula-guides';
import { FORMULA_CONTENT_MANIFEST } from '@/content/formula-manifest';
import { getFormulaMetadata } from '@/engine/plugins/formula-catalog';
import { buildFormulaDefaultDocument } from '@/lib/formula-documents';
import { documentToExploreHref } from '@/lib/url-params';

const projectRoot = process.cwd();
const port = Number(process.env.FORMULA_IMAGE_PORT ?? 3001);
const baseUrl =
  process.env.BASE_URL ?? `http://127.0.0.1:${String(port)}`;
const quality = 0.92;
const imageVariants = [
  {
    width: 1200,
    height: 750,
    path: formulaGuideImagePath,
  },
  {
    width: 1200,
    height: 630,
    path: formulaGuideOpenGraphImagePath,
  },
] as const;

function hasArg(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

function getArgValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

async function isServerReady(): Promise<boolean> {
  try {
    const response = await fetch(baseUrl, { redirect: 'manual' });
    return response.status > 0;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await isServerReady()) {
    return async () => {};
  }

  const server = spawn(
    'npm',
    ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        PORT: String(port),
      },
    }
  );
  const start = Date.now();

  while (Date.now() - start < 120_000) {
    if (await isServerReady()) {
      return async () => {
        if (!server.killed) {
          server.kill('SIGTERM');
        }
      };
    }
    if (server.exitCode !== null) {
      throw new Error(`Local server exited with code ${server.exitCode}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  server.kill('SIGTERM');
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

async function renderJpeg(
  page: Page,
  formulaId: string,
  output: { width: number; height: number }
): Promise<Buffer> {
  const canonicalDocument = buildFormulaDefaultDocument(formulaId);
  const exploreHref = documentToExploreHref(canonicalDocument, 'en');
  const dimensions = {
    width: output.width,
    height: output.height,
  };
  const thumbnailUrl = new URL(
    exploreHref.replace('/explore?', '/thumbnail?'),
    baseUrl
  );
  thumbnailUrl.searchParams.set('renderWidth', String(output.width));
  thumbnailUrl.searchParams.set('renderHeight', String(output.height));

  await page.goto(thumbnailUrl.toString(), {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  const canvas = page.locator('[data-testid="fractal-canvas"]');
  await canvas.waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(
    ({ width, height }) => {
      const element = document.querySelector(
        '[data-testid="fractal-canvas"]'
      );

      return (
        element instanceof HTMLCanvasElement &&
        element.width === width &&
        element.height === height
      );
    },
    dimensions,
    { timeout: 30_000 }
  );
  await page.waitForTimeout(1_200);

  const dataUrl = await canvas.evaluate(
    (element, output) => {
      if (!(element instanceof HTMLCanvasElement)) {
        throw new Error('Fractal canvas not found');
      }

      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = output.width;
      exportCanvas.height = output.height;
      const context = exportCanvas.getContext('2d');

      if (!context) {
        throw new Error('Failed to create image export context');
      }

      context.drawImage(
        element,
        0,
        0,
        output.width,
        output.height
      );
      return exportCanvas.toDataURL('image/jpeg', output.quality);
    },
    { ...dimensions, quality }
  );

  return Buffer.from(
    dataUrl.replace(/^data:image\/jpeg;base64,/, ''),
    'base64'
  );
}

async function main(): Promise<void> {
  if (!hasArg('--confirm-profiles')) {
    throw new Error(
      'Generation requires explicit confirmation that all 21 canonical visual profiles are tuned. Re-run with --confirm-profiles only after the user confirms.'
    );
  }

  for (const entry of FORMULA_CONTENT_MANIFEST) {
    if (!getFormulaMetadata(entry.formulaId)?.defaultProfile) {
      throw new Error(
        `Canonical visual profile is missing: ${entry.formulaId}`
      );
    }
  }

  const force = hasArg('--force');
  const missingOnly = hasArg('--missing-only');
  const selectedSlug = getArgValue('--slug');

  if (force && missingOnly) {
    throw new Error('Use either --force or --missing-only, not both.');
  }

  const selectedGuides = selectedSlug
    ? PUBLISHED_FORMULA_GUIDES.filter(({ slug }) => slug === selectedSlug)
    : PUBLISHED_FORMULA_GUIDES;

  if (selectedGuides.length === 0) {
    throw new Error(`Unknown formula guide slug: ${selectedSlug}`);
  }

  const allOutputs = selectedGuides.flatMap((entry) =>
    imageVariants.map((variant) => ({
      entry,
      variant,
      publicPath: variant.path(entry),
      outputPath: path.join(projectRoot, 'public', variant.path(entry)),
    }))
  );
  const existing = allOutputs.filter(({ outputPath }) =>
    fs.existsSync(outputPath)
  );

  if (existing.length > 0 && !force) {
    if (!missingOnly) {
      throw new Error(
        `Refusing to overwrite ${existing.length} existing image(s). Use --missing-only to preserve them, or --force after review.`
      );
    }
  }

  const outputs = missingOnly
    ? allOutputs.filter(({ outputPath }) => !fs.existsSync(outputPath))
    : allOutputs;

  if (outputs.length === 0) {
    console.log('[formula-images] No missing formula guide images.');
    return;
  }

  const stopServer = await ensureServer();
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-angle=swiftshader',
      '--use-gl=angle',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--enable-gpu',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 814 },
  });
  const page = await context.newPage();

  try {
    for (const { entry, outputPath, publicPath, variant } of outputs) {
      const jpeg = await renderJpeg(page, entry.formulaId, variant);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, jpeg);
      console.log(
        `[formula-images] Saved ${publicPath} (${variant.width}x${variant.height}, ${(
          jpeg.length / 1024
        ).toFixed(1)} KB)`
      );
    }
  } finally {
    await page.close();
    await context.close();
    await browser.close();
    await stopServer();
  }
}

main().catch((error) => {
  console.error(
    `[formula-images] ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  process.exitCode = 1;
});
