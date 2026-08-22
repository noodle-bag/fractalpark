import { createHash } from "node:crypto";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { dirname, join } from "node:path";

import { chromium, type Page } from "playwright";

import type { PublishedFormulaRuntimeIndexV1 } from "../src/engine/formulas/v1/published-runtime";

type JsonRecord = Record<string, unknown>;

interface GateConfig {
  readonly measurementContract: {
    readonly libraryOpenSamples: number;
    readonly libraryHeapDeltaSamples: number;
    readonly previewDecodeSamples: number;
    readonly coldSelectionSamples: number;
    readonly hotSelectionSamples: number;
    readonly facetPaintSamples: number;
  };
}

const root = process.cwd();
const sourcePaths = [
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  "resources/formula-library/v1/performance-gates.v1.json",
  "resources/formula-library/v1/publication-decisions.json",
  "public/formula-library/v1/runtime/published/index.json",
  "public/formula-library/v1/runtime/published/manifest.json",
  "public/formula-library/v1/previews/manifest.json",
  "src/components/fractal/FractalCanvas.tsx",
  "src/components/fractal/PublishedFormulaLibrary.tsx",
  "src/components/gallery/PresetThumbnail.tsx",
  "src/hooks/useFractalRenderer.ts",
  "src/lib/published-formula-library.ts",
  "src/lib/published-formula-selection.ts",
  "src/engine/formulas/v1/published-runtime.ts",
  "src/engine/fractals/renderer.ts",
  "src/test/document-v3-envelope-v2.test.ts",
  "src/test/published-formula-library.test.tsx",
  "src/test/published-formula-runtime.test.ts",
  "src/test/published-formula-selection.test.ts",
  "src/test/fractal-renderer-race.test.ts",
  "scripts/measure-standard-library-performance.ts",
  "scripts/verify-standard-library-performance.ts",
  "tests/e2e/formula-switch.spec.ts",
  "package.json",
  "package-lock.json",
] as const;
const softwareRendererPattern =
  /swiftshader|llvmpipe|softpipe|lavapipe|software rasterizer|microsoft basic render|virgl|virtualbox|vmware|paravirtual/i;
const hardwareRendererPattern =
  /nvidia|geforce|quadro|amd|ati|radeon|intel|apple|adreno|mali|powervr|qualcomm|arc\b/i;
const config = JSON.parse(
  readFileSync(
    join(root, "resources/formula-library/v1/performance-gates.v1.json"),
    "utf8",
  ),
) as GateConfig;
const index = JSON.parse(
  readFileSync(
    join(root, "public/formula-library/v1/runtime/published/index.json"),
    "utf8",
  ),
) as PublishedFormulaRuntimeIndexV1;

function argument(name: string, fallback?: string): string | undefined {
  const prefix = `${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function sha256(relativePath: string): string {
  return createHash("sha256")
    .update(readFileSync(join(root, relativePath)))
    .digest("hex");
}

function p95(values: readonly number[]): number {
  invariant(values.length > 0, "performance-measurement-samples-empty");
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

function stratifiedRows(count: number) {
  const bases = [
    "project-owned",
    "direct-adaptation",
    "separated-independent-rewrite",
  ] as const;
  const allocations = [
    Math.ceil(count / 3),
    Math.ceil((count - Math.ceil(count / 3)) / 2),
    count - Math.ceil(count / 3) - Math.ceil((count - Math.ceil(count / 3)) / 2),
  ];
  return bases.flatMap((basis, basisIndex) => {
    const rows = index.rows.filter((row) => row.implementationBasis === basis);
    const allocation = allocations[basisIndex];
    return Array.from({ length: allocation }, (_, sampleIndex) => {
      const rowIndex =
        allocation === 1
          ? 0
          : Math.round((sampleIndex * (rows.length - 1)) / (allocation - 1));
      return rows[rowIndex];
    });
  });
}

async function mark(page: Page, name: string): Promise<void> {
  await page.evaluate((markName) => performance.mark(markName), name);
}

async function duration(
  page: Page,
  name: string,
  action: () => Promise<void>,
  ready: () => Promise<void>,
): Promise<number> {
  await mark(page, `${name}:start`);
  await action();
  await ready();
  await mark(page, `${name}:end`);
  return page.evaluate(
    ({ measureName }) =>
      performance.measure(
        measureName,
        `${measureName}:start`,
        `${measureName}:end`,
      ).duration,
    { measureName: name },
  );
}

async function twoPaints(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function clickElement(page: Page, selector: string): Promise<void> {
  await page.waitForFunction(
    (candidate) => document.querySelector(candidate) !== null,
    selector,
    { polling: 100 },
  );
  await page.evaluate((candidate) => {
    document.querySelector<HTMLElement>(candidate)?.click();
  }, selector);
}

async function clickLibraryTrigger(page: Page): Promise<void> {
  const trigger = page.getByRole("button", { name: "Open Library" });
  await trigger.waitFor({ state: "visible" });
  await trigger.evaluate((element) => (element as HTMLElement).click());
}

async function openLibrary(page: Page): Promise<void> {
  await clickLibraryTrigger(page);
  await page.getByRole("dialog", { name: "Standard Formula Library" }).waitFor({
    state: "visible",
  });
  await page
    .locator('[role="dialog"] button[data-formula-id]')
    .first()
    .waitFor({ state: "visible" });
}

async function closeLibrary(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Standard Formula Library" });
  await dialog.getByRole("button", { name: "Close" }).evaluate((element) => {
    (element as HTMLElement).click();
  });
  await dialog.waitFor({ state: "hidden" });
}

async function exposeRow(page: Page, formulaId: string): Promise<string> {
  const selector = `[role="dialog"] button[data-formula-id="${formulaId}"]`;
  for (let pageNumber = 0; pageNumber < 11; pageNumber += 1) {
    if (await page.locator(selector).isVisible().catch(() => false)) return selector;
    const loadMore = page.getByRole("button", { name: "Load more" });
    invariant(await loadMore.isVisible().catch(() => false), "performance-row-unreachable");
    await loadMore.evaluate((element) => (element as HTMLElement).click());
  }
  throw new Error(`performance-row-unreachable:${formulaId}`);
}

async function waitForCorrectFrame(page: Page, formulaId: string): Promise<void> {
  await page.waitForFunction(
    (expectedId) => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        '[data-testid="fractal-canvas"]',
      );
      return (
        canvas?.dataset.renderStatus === "ready" &&
        canvas.dataset.renderedFormulaId === expectedId
      );
    },
    formulaId,
    { polling: 100, timeout: 15_000 },
  );
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="fractal-canvas"]',
    );
    canvas?.getContext("webgl")?.finish();
  });
  await twoPaints(page);
}

async function heapBytes(page: Page): Promise<number> {
  const value = await page.evaluate(() => {
    globalThis.gc?.();
    const browserPerformance = performance as Performance & {
      memory?: { usedJSHeapSize: number };
    };
    return browserPerformance.memory?.usedJSHeapSize ?? null;
  });
  invariant(typeof value === "number", "performance-memory-api-unavailable");
  return value;
}

async function main(): Promise<void> {
  const baseURL = argument("--base-url", "http://127.0.0.1:3000")!;
  const output = argument(
    "--output",
    ".artifacts/standard-library-performance.json",
  )!;
  const allowSoftware = process.argv.includes("--allow-software");
  const physicalDevice = process.argv.includes("--physical-device");
  const emulator = process.argv.includes("--emulator") || !physicalDevice;
  const deviceModel = argument("--device-model", "unattested")!;
  const osVersion = argument("--os-version", `${platform()} ${release()}`)!;
  const inputMethod = argument("--input-method", "mouse-keyboard")!;
  const browser = await chromium.launch({
    headless: !process.argv.includes("--headed"),
    args: [
      "--enable-precise-memory-info",
      "--js-flags=--expose-gc",
      "--ignore-gpu-blocklist",
      "--enable-gpu",
    ],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(`${baseURL}/en/explore`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="fractal-canvas"]').waitFor({ state: "visible" });
    await page.evaluate("globalThis.__name = (target) => target");
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLCanvasElement>('[data-testid="fractal-canvas"]')
          ?.dataset.renderStatus === "ready",
      undefined,
      { polling: 100 },
    );
    const graphics = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        '[data-testid="fractal-canvas"]',
      );
      const gl = canvas?.getContext("webgl");
      if (!gl) return null;
      const extension = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        debugRendererAvailable: extension !== null,
        vendor: extension
          ? String(gl.getParameter(extension.UNMASKED_VENDOR_WEBGL))
          : String(gl.getParameter(gl.VENDOR)),
        renderer: extension
          ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL))
          : String(gl.getParameter(gl.RENDERER)),
      };
    });
    invariant(graphics !== null, "performance-webgl-unavailable");
    const graphicsIdentity = `${graphics.vendor} ${graphics.renderer}`;
    const softwareRenderer = softwareRendererPattern.test(graphicsIdentity);
    const hardwareAttested =
      graphics.debugRendererAvailable &&
      !softwareRenderer &&
      hardwareRendererPattern.test(graphicsIdentity) &&
      physicalDevice &&
      !emulator &&
      deviceModel !== "unattested" &&
      inputMethod === "mouse-keyboard";
    invariant(
      hardwareAttested || allowSoftware,
      `performance-measurement-attested-real-gpu-required:${graphics.renderer}`,
    );

    const libraryOpenSamples: number[] = [];
    const libraryHeapDeltaSamples: number[] = [];
    let libraryDialogDescendants = 0;
    for (
      let sample = 0;
      sample < config.measurementContract.libraryOpenSamples;
      sample += 1
    ) {
      const beforeHeap = await heapBytes(page);
      const value = await duration(
        page,
        `library-open-${sample}`,
        () => clickLibraryTrigger(page),
        async () => {
          await page
            .locator('[role="dialog"] button[data-formula-id]')
            .first()
            .waitFor({ state: "visible" });
          await twoPaints(page);
        },
      );
      libraryOpenSamples.push(value);
      const afterHeap = await heapBytes(page);
      libraryHeapDeltaSamples.push(Math.max(0, afterHeap - beforeHeap));
      libraryDialogDescendants = Math.max(
        libraryDialogDescendants,
        await page.locator('[role="dialog"] *').count(),
      );
      await closeLibrary(page);
    }
    const publishedIndexTransferBytes = await page.evaluate(() => {
      const entry = performance
        .getEntriesByType("resource")
        .find((candidate) =>
          candidate.name.endsWith(
            "/formula-library/v1/runtime/published/index.json",
          ),
        ) as PerformanceResourceTiming | undefined;
      return entry?.transferSize ?? null;
    });
    invariant(
      typeof publishedIndexTransferBytes === "number",
      "performance-index-resource-missing",
    );

    await openLibrary(page);
    const facetPaintSamples: number[] = [];
    const facetNames = ["Algebraic Power", "Root Finding"];
    for (let sample = 0; sample < config.measurementContract.facetPaintSamples; sample += 1) {
      const name = facetNames[sample % facetNames.length];
      const button = page.getByRole("button", { name, exact: true });
      facetPaintSamples.push(
        await duration(
          page,
          `facet-${sample}`,
          async () => button.evaluate((element) => (element as HTMLElement).click()),
          async () => {
            await page.waitForFunction(
              (label) =>
                document
                  .querySelector<HTMLElement>(`[role="dialog"] button[aria-pressed="true"]`)
                  ?.textContent?.includes(label) === true,
              name,
              { polling: 50 },
            );
            await twoPaints(page);
          },
        ),
      );
    }
    await closeLibrary(page);

    const coldRows = stratifiedRows(
      config.measurementContract.coldSelectionSamples,
    );
    const coldSelectionSamples: number[] = [];
    if (hardwareAttested) {
      for (let sample = 0; sample < coldRows.length; sample += 1) {
        const row = coldRows[sample];
        await openLibrary(page);
        const selector = await exposeRow(page, row.formulaId);
        coldSelectionSamples.push(
          await duration(
            page,
            `cold-selection-${sample}`,
            () => clickElement(page, selector),
            () => waitForCorrectFrame(page, row.formulaId),
          ),
        );
      }
    }

    const hotSelectionSamples: number[] = [];
    if (hardwareAttested) {
      const hotRows = coldRows.slice(0, 3);
      for (let sample = 0; sample < config.measurementContract.hotSelectionSamples; sample += 1) {
        const row = hotRows[(sample + 1) % hotRows.length];
        await openLibrary(page);
        const selector = await exposeRow(page, row.formulaId);
        hotSelectionSamples.push(
          await duration(
            page,
            `hot-selection-${sample}`,
            () => clickElement(page, selector),
            () => waitForCorrectFrame(page, row.formulaId),
          ),
        );
      }
    }

    const previewPage = await context.newPage();
    const previewDecodeSamples: number[] = [];
    for (
      let sample = 0;
      sample < config.measurementContract.previewDecodeSamples;
      sample += 1
    ) {
      const row = coldRows[sample];
      await previewPage.setContent(
        `<img alt="preview" src="${baseURL}/formula-library/v1/previews/${row.formulaId}.png">`,
        { waitUntil: "domcontentloaded" },
      );
      const image = previewPage.locator('img[alt="preview"]');
      await image.waitFor({ state: "attached" });
      previewDecodeSamples.push(
        await image.evaluate(async (element) => {
          performance.mark("preview-decode:start");
          await (element as HTMLImageElement).decode();
          performance.mark("preview-decode:end");
          return performance.measure(
            "preview-decode",
            "preview-decode:start",
            "preview-decode:end",
          ).duration;
        }),
      );
    }

    const report = {
      schema: "fractalpark-standard-library-browser-measurement/v1",
      releaseQualifying: hardwareAttested,
      sourceBindings: Object.fromEntries(
        sourcePaths.map((relativePath) => [relativePath, sha256(relativePath)]),
      ),
      environment: {
        browser: "chromium",
        browserVersion: browser.version(),
        deviceModel,
        osVersion,
        cpu: cpus()[0]?.model ?? "unknown",
        viewport: "1280x720",
        inputMethod,
        cacheMode: "normal browser cache; unique formulas for cold samples",
        webgl: graphics,
        physicalDevice,
        emulator,
      },
      samples: {
        libraryOpenSamples,
        libraryHeapDeltaSamples,
        facetPaintSamples,
        coldSelectionSamples,
        hotSelectionSamples,
        previewDecodeSamples,
        libraryDialogDescendants,
        publishedIndexTransferBytes,
      },
      p95: {
        libraryOpenMs: p95(libraryOpenSamples),
        libraryHeapDeltaBytes: p95(libraryHeapDeltaSamples),
        facetPaintMs: p95(facetPaintSamples),
        coldSelectionToCorrectFrameMs:
          coldSelectionSamples.length > 0 ? p95(coldSelectionSamples) : null,
        hotSelectionToCorrectFrameMs:
          hotSelectionSamples.length > 0 ? p95(hotSelectionSamples) : null,
        previewDecodeMs: p95(previewDecodeSamples),
      },
    } satisfies JsonRecord;
    mkdirSync(dirname(join(root, output)), { recursive: true });
    writeFileSync(join(root, output), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ ok: true, output, report })}\n`);
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      code:
        error instanceof Error
          ? error.message
          : "standard-library-performance-measurement-failed",
    })}\n`,
  );
  process.exitCode = 1;
});
