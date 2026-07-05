import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { FractalDocument } from '@/engine/document';
import { documentToExploreHref, documentToUrlState, encodeParams } from '@/lib/url-params';
import { CliCommandError, createSuccess, docFromPreset } from '@/cli/doc-commands';

const DEFAULT_BASE_URL = 'http://127.0.0.1:3001';
const DEFAULT_VIEWPORT = { width: 1440, height: 960 };
const THUMBNAIL_SIZE = 600;
const THUMBNAIL_QUALITY = 0.9;

type JsonRecord = Record<string, unknown>;

type BatchEntry = {
  id: string;
  document: FractalDocument;
};

type ArtifactSummary = {
  formulaId: string;
  isJulia: boolean;
  paletteIndex: number;
  outsideColoringId: string;
  insideColoringId: string;
  transformId: string;
  bounds: {
    centerX: number;
    centerY: number;
    zoom: number;
    rotation: number;
  };
};

type ServerHandle = {
  started: boolean;
  stop: () => Promise<void>;
};

type SpawnLogBuffer = {
  stdout: string[];
  stderr: string[];
};

const REGRESSION_SUITES: Record<string, string[]> = {
  preset: ['tests/e2e/gallery-preset.spec.ts'],
  // Gallery-open currently shares the gallery preset smoke until we split a dedicated spec.
  'gallery-open': ['tests/e2e/gallery-preset.spec.ts'],
  'phase2-smoke': [
    'tests/e2e/gallery-preset.spec.ts',
    'tests/e2e/gallery-saved-fractals.spec.ts',
    'tests/e2e/animation-url.spec.ts',
    'tests/e2e/transform.spec.ts',
  ],
  'gallery-saved': ['tests/e2e/gallery-saved-fractals.spec.ts'],
  'animation-url': ['tests/e2e/animation-url.spec.ts'],
  transform: ['tests/e2e/transform.spec.ts'],
  'custom-formula': ['tests/e2e/custom-formula.spec.ts'],
};

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function asObject(value: unknown): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected a JSON object input.');
  }
  return value as JsonRecord;
}

function normalizeDocumentInput(input: unknown): FractalDocument {
  const value = asObject(input);
  if (typeof value.schemaVersion !== 'number') {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected a FractalDocument payload for render commands.');
  }
  return value as unknown as FractalDocument;
}

function extractPort(baseUrl: string): number {
  try {
    const parsed = new URL(baseUrl);
    return parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
  } catch {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected a valid --base-url.');
  }
}

async function isServerReady(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(baseUrl, { redirect: 'manual' });
    return response.status > 0;
  } catch {
    return false;
  }
}

async function ensureServer(baseUrl: string): Promise<ServerHandle> {
  if (await isServerReady(baseUrl)) {
    return { started: false, stop: async () => {} };
  }

  const port = extractPort(baseUrl);
  const logs: SpawnLogBuffer = { stdout: [], stderr: [] };
  const server = spawn('npm', ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(port),
      NO_PROXY: '127.0.0.1,localhost',
      no_proxy: '127.0.0.1,localhost',
    },
  });

  server.stdout?.setEncoding('utf8');
  server.stderr?.setEncoding('utf8');
  server.stdout?.on('data', (chunk) => {
    logs.stdout.push(String(chunk));
    if (logs.stdout.length > 10) logs.stdout.shift();
  });
  server.stderr?.on('data', (chunk) => {
    logs.stderr.push(String(chunk));
    if (logs.stderr.length > 10) logs.stderr.shift();
  });

  try {
    const start = Date.now();
    while (Date.now() - start < 120000) {
      if (await isServerReady(baseUrl)) {
        return {
          started: true,
          stop: async () => {
            if (!server.killed) {
              server.kill('SIGTERM');
            }
          },
        };
      }

      if (server.exitCode !== null) {
        throw new CliCommandError('SERVER_START_FAILED', 3, `Failed to start local server at ${baseUrl}.`, {
          exitCode: server.exitCode,
          stdout: logs.stdout.join('').trim(),
          stderr: logs.stderr.join('').trim(),
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new CliCommandError('SERVER_TIMEOUT', 3, `Timed out waiting for local server at ${baseUrl}`, {
      stdout: logs.stdout.join('').trim(),
      stderr: logs.stderr.join('').trim(),
    });
  } catch (error) {
    server.kill('SIGTERM');
    throw error;
  }
}

async function createBrowserContext(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
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
  const context = await browser.newContext({ viewport: DEFAULT_VIEWPORT });
  const page = await context.newPage();
  return { browser, context, page };
}

async function closeBrowser(browser: Browser, context: BrowserContext, page: Page): Promise<void> {
  await page.close();
  await context.close();
  await browser.close();
}

async function waitForCanvasReady(page: Page): Promise<void> {
  const canvas = page.locator('[data-testid="fractal-canvas"]');
  await canvas.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(800);
}

function thumbnailHref(document: FractalDocument, locale: string): string {
  const params = encodeParams(documentToUrlState(document)).toString();
  return `/${locale}/thumbnail?${params}`;
}

async function saveCanvasJpeg(page: Page, outputPath: string): Promise<void> {
  ensureParentDir(outputPath);
  const canvas = page.locator('[data-testid="fractal-canvas"]');
  const dataUrl = await canvas.evaluate((element, { size, quality }) => {
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error('Fractal canvas not found');
    }
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = size;
    exportCanvas.height = size;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create 2D context');
    }
    ctx.drawImage(element, 0, 0, size, size);
    return exportCanvas.toDataURL('image/jpeg', quality);
  }, { size: THUMBNAIL_SIZE, quality: THUMBNAIL_QUALITY });

  fs.writeFileSync(outputPath, Buffer.from(dataUrl.replace(/^data:image\/jpeg;base64,/, ''), 'base64'));
}

function buildArtifactUrl(baseUrl: string, href: string): string {
  return new URL(href, baseUrl).toString();
}

export function normalizeBatchEntries(input: unknown): BatchEntry[] {
  const value = Array.isArray(input)
    ? input
    : String(input ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => {
          try {
            return JSON.parse(line);
          } catch (error) {
            throw new CliCommandError('INVALID_INPUT', 1, `Invalid JSONL entry at line ${index + 1}.`, {
              line: index + 1,
              cause: error instanceof Error ? error.message : String(error),
            });
          }
        });

  if (!Array.isArray(value) || value.length === 0) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected a non-empty JSON array or JSONL batch input.');
  }

  return value.map((entry, index) => {
    const record = asObject(entry);
    const rawDocument = 'document' in record ? record.document : record;
    const document = normalizeDocumentInput(rawDocument);
    return {
      id: typeof record.id === 'string' ? record.id : `candidate-${String(index + 1).padStart(3, '0')}`,
      document,
    };
  });
}

export function summarizeDocument(document: FractalDocument): ArtifactSummary {
  return {
    formulaId: document.formula.formulaId,
    isJulia: document.formula.isJulia,
    paletteIndex: document.coloring.paletteIndex,
    outsideColoringId: document.coloring.outsideColoringId,
    insideColoringId: document.coloring.insideColoringId,
    transformId: document.transform.transformId,
    bounds: {
      centerX: document.scene.bounds.centerX,
      centerY: document.scene.bounds.centerY,
      zoom: document.scene.bounds.zoom,
      rotation: document.scene.bounds.rotation ?? 0,
    },
  };
}

export function writeBatchReport(outputDir: string, items: Array<{ id: string; href: string; output: string; summary: ArtifactSummary }>): void {
  const lines = ['# Render Batch Report', ''];
  for (const item of items) {
    lines.push(`## ${item.id}`);
    lines.push('');
    lines.push(`- href: \`${item.href}\``);
    lines.push(`- image: \`${item.output}\``);
    lines.push(`- formula: \`${item.summary.formulaId}\`${item.summary.isJulia ? ' (Julia)' : ''}`);
    lines.push(`- coloring: outside=\`${item.summary.outsideColoringId}\`, inside=\`${item.summary.insideColoringId}\`, palette=\`${item.summary.paletteIndex}\``);
    lines.push(`- transform: \`${item.summary.transformId}\``);
    lines.push(
      `- bounds: cx=\`${item.summary.bounds.centerX.toFixed(10)}\`, cy=\`${item.summary.bounds.centerY.toFixed(10)}\`, z=\`${item.summary.bounds.zoom}\`, rot=\`${item.summary.bounds.rotation}\``,
    );
    lines.push('');
  }
  fs.writeFileSync(path.join(outputDir, 'report.md'), `${lines.join('\n')}\n`);
}

export async function renderThumbnail(args: {
  document: unknown;
  output: string;
  locale: string;
  baseUrl?: string;
}) {
  if (!args.output) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected --output for render thumbnail.');
  }
  const document = normalizeDocumentInput(args.document);
  const locale = args.locale || 'en';
  const baseUrl = args.baseUrl ?? DEFAULT_BASE_URL;
  const href = thumbnailHref(document, locale);
  const server = await ensureServer(baseUrl);
  const { browser, context, page } = await createBrowserContext();

  try {
    await page.goto(buildArtifactUrl(baseUrl, href), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForCanvasReady(page);
    await saveCanvasJpeg(page, args.output);

    return createSuccess('render thumbnail', {
      kind: 'thumbnail',
      output: path.resolve(args.output),
      href,
      url: buildArtifactUrl(baseUrl, href),
      locale,
    });
  } finally {
    await closeBrowser(browser, context, page);
    await server.stop();
  }
}

export async function renderScreenshot(args: {
  document: unknown;
  output: string;
  locale: string;
  baseUrl?: string;
}) {
  if (!args.output) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected --output for render screenshot.');
  }
  const document = normalizeDocumentInput(args.document);
  const locale = args.locale || 'en';
  const baseUrl = args.baseUrl ?? DEFAULT_BASE_URL;
  const href = documentToExploreHref(document, locale);
  const server = await ensureServer(baseUrl);
  const { browser, context, page } = await createBrowserContext();

  try {
    await page.goto(buildArtifactUrl(baseUrl, href), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForCanvasReady(page);
    ensureParentDir(args.output);
    await page.locator('[data-testid="fractal-canvas"]').screenshot({ path: args.output });

    return createSuccess('render screenshot', {
      kind: 'screenshot',
      output: path.resolve(args.output),
      href,
      url: buildArtifactUrl(baseUrl, href),
      locale,
    });
  } finally {
    await closeBrowser(browser, context, page);
    await server.stop();
  }
}

export async function renderBatch(args: {
  input: unknown;
  outputDir: string;
  mode: 'thumbnail' | 'screenshot';
  locale: string;
  baseUrl?: string;
}) {
  if (!args.outputDir) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected --output-dir for render batch.');
  }
  const entries = normalizeBatchEntries(args.input);
  const outputDir = path.resolve(args.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  const items: Array<{ id: string; output: string; href: string; url: string; summary: ArtifactSummary }> = [];
  const baseUrl = args.baseUrl ?? DEFAULT_BASE_URL;
  const server = await ensureServer(baseUrl);
  const { browser, context, page } = await createBrowserContext();

  try {
    for (const entry of entries) {
      const extension = args.mode === 'thumbnail' ? 'jpg' : 'png';
      const output = path.join(outputDir, `${entry.id}.${extension}`);
      const href = args.mode === 'thumbnail'
        ? thumbnailHref(entry.document, args.locale)
        : documentToExploreHref(entry.document, args.locale);
      const url = buildArtifactUrl(baseUrl, href);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await waitForCanvasReady(page);

      if (args.mode === 'thumbnail') {
        await saveCanvasJpeg(page, output);
      } else {
        ensureParentDir(output);
        await page.locator('[data-testid="fractal-canvas"]').screenshot({ path: output });
      }

      items.push({
        id: entry.id,
        output: path.resolve(output),
        href,
        url,
        summary: summarizeDocument(entry.document),
      });
    }
  } finally {
    await closeBrowser(browser, context, page);
    await server.stop();
  }

  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify({ mode: args.mode, locale: args.locale, items }, null, 2)}\n`);
  writeBatchReport(outputDir, items);

  return createSuccess('render batch', {
    mode: args.mode,
    outputDir,
    manifest: manifestPath,
    count: items.length,
    items,
  });
}

export async function verifyPreset(args: { id: string; locale: string; baseUrl?: string }) {
  if (!args.id) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected --id for verify preset.');
  }
  const preset = docFromPreset({ id: args.id });
  const locale = args.locale || 'en';
  const baseUrl = args.baseUrl ?? DEFAULT_BASE_URL;
  const href = documentToExploreHref(preset.data.document, locale);
  const server = await ensureServer(baseUrl);
  const { browser, context, page } = await createBrowserContext();

  try {
    await page.goto(buildArtifactUrl(baseUrl, href), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForCanvasReady(page);
    return createSuccess('verify preset', {
      id: args.id,
      href,
      url: buildArtifactUrl(baseUrl, href),
      status: 'ok',
    });
  } finally {
    await closeBrowser(browser, context, page);
    await server.stop();
  }
}

export async function verifyGalleryOpen(args: { id: string; locale: string; baseUrl?: string }) {
  if (!args.id) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected --id for verify gallery-open.');
  }
  const preset = docFromPreset({ id: args.id });
  const locale = args.locale || 'en';
  const baseUrl = args.baseUrl ?? DEFAULT_BASE_URL;
  const href = documentToExploreHref(preset.data.document, locale);
  const expectedUrl = buildArtifactUrl(baseUrl, href);
  const server = await ensureServer(baseUrl);
  const { browser, context, page } = await createBrowserContext();

  try {
    await page.goto(buildArtifactUrl(baseUrl, `/${locale}/gallery`), { waitUntil: 'domcontentloaded', timeout: 60000 });
    const link = page.locator(`a[href="${href}"]`).first();
    await link.waitFor({ state: 'visible', timeout: 15000 });
    await link.click();
    await waitForCanvasReady(page);
    const actual = new URL(page.url());
    const expected = new URL(expectedUrl);
    if (actual.pathname !== expected.pathname || actual.search !== expected.search) {
      throw new CliCommandError('VERIFY_FAILED', 3, 'Gallery open did not navigate to expected href.', {
        expectedUrl: `${expected.pathname}${expected.search}`,
        actualUrl: `${actual.pathname}${actual.search}`,
      });
    }
    return createSuccess('verify gallery-open', {
      id: args.id,
      href,
      url: expectedUrl,
      status: 'ok',
    });
  } finally {
    await closeBrowser(browser, context, page);
    await server.stop();
  }
}

async function runPlaywright(specs: string[], baseUrl: string): Promise<void> {
  const env = {
    ...process.env,
    SKIP_WEB_SERVER: '1',
    BASE_URL: baseUrl,
    NO_PROXY: '127.0.0.1,localhost',
    no_proxy: '127.0.0.1,localhost',
    http_proxy: '',
    https_proxy: '',
    HTTP_PROXY: '',
    HTTPS_PROXY: '',
    ALL_PROXY: '',
  };

  await new Promise<void>((resolve, reject) => {
    const child = spawn('npx', ['playwright', 'test', ...specs, '--reporter=line'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env,
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new CliCommandError('VERIFY_FAILED', 3, `Playwright regression failed with exit code ${code ?? 'unknown'}.`));
      }
    });
    child.on('error', (error) => reject(error));
  });
}

export async function verifyRegression(args: { suite?: string; spec?: string; baseUrl?: string }) {
  const baseUrl = args.baseUrl ?? DEFAULT_BASE_URL;
  const suite = args.suite ?? 'phase2-smoke';
  const specs = args.spec ? [args.spec] : REGRESSION_SUITES[suite];

  if (!specs || specs.length === 0) {
    throw new CliCommandError('INVALID_INPUT', 1, 'Expected --suite or --spec for verify regression.');
  }

  const server = await ensureServer(baseUrl);
  try {
    await runPlaywright(specs, baseUrl);
    return createSuccess('verify regression', {
      suite: args.spec ? 'custom-spec' : suite,
      specs,
      status: 'ok',
    });
  } finally {
    await server.stop();
  }
}
