import { expect, test, type Page } from '@playwright/test';

const REPRESENTATIVES = [
  {
    basis: 'project-owned',
    formulaId: 'd541fbeb-4dcc-5fc9-9b88-116bb28bf327',
    displayName: 'tanJulia',
    definitionPath:
      'definitions/f892ebc14d4ae2437f5858f1c79d466b2c320024c6318e53dff1baabbfbd78d4.frm',
  },
  {
    basis: 'direct-adaptation',
    formulaId: 'cc489215-c7d7-5f2c-b11a-1be049b167bd',
    displayName: 'richard7',
    definitionPath:
      'definitions/773efa8273598ca70432c3e628ee1e6f22d176b0fb2d680a613c5d6921f899cb.frm',
  },
  {
    basis: 'separated-independent-rewrite',
    formulaId: 'b8b69fda-a887-58b0-995a-8343f768477e',
    displayName: 'juliaconj',
    definitionPath:
      'definitions/907f245aabcd6b1d53822b2c78c8468a58eb2c6ef5af26b06fba6fcbd55d5529.frm',
  },
] as const;

const HARD_DOMAIN_REPRESENTATIVE = {
  formulaId: '0f49d971-917e-50a5-ae83-20e11fd4854c',
  displayName: 'phoenixMulti',
  uniformName: 'frmV1_phoenixMultiP',
  definitionPath:
    'definitions/a9fa9931913aeafac8b527f31cae7b519db79c8d54829ffcea20bcb6fc9dce4d.frm',
} as const;

const LUCKY_REPRESENTATIVE = {
  formulaId: '00e14aa8-b766-54ea-a359-3f5d20d329b7',
  definitionPath:
    'definitions/e4d2259a5dd3fe7b3af646514a4313e83efcc80e887e04c07b7469bb27a66b90.frm',
} as const;

const ROLLBACK_REPRESENTATIVE = {
  displayName: 'jm_18',
  definitionPath:
    'definitions/41794347e36147808476dcb16e41d7bdbf24b94327ce2f0bf13fd67a1cf1901f.frm',
} as const;

async function waitForFractalCanvasReady(page: Page) {
  await expect(page.locator('[data-testid="fractal-canvas"]')).toBeVisible({
    timeout: 20_000,
  });
}

async function openLibrary(page: Page) {
  const trigger = page.getByRole('button', { name: 'Open Library' });
  await expect(trigger).toBeVisible({ timeout: 45_000 });
  await trigger.click();
  await expect(
    page.getByRole('dialog', { name: 'Standard Formula Library' }),
  ).toBeVisible({ timeout: 15_000 });
}

async function selectDirectoryRow(page: Page, displayName: string) {
  const row = page.getByRole('button', { name: displayName, exact: true }).first();
  for (let pageNumber = 0; pageNumber < 11; pageNumber += 1) {
    if (await row.isVisible().catch(() => false)) {
      await row.click();
      return;
    }
    const loadMore = page.getByRole('button', { name: 'Load more' });
    await expect(loadMore).toBeVisible();
    await loadMore.click();
  }
  throw new Error(`Published formula row not reachable: ${displayName}`);
}

test.describe('Published Formula Library', () => {
  test.describe.configure({ timeout: 420_000 });

  test('keeps the last-known-good canvas when a published definition is unavailable', async ({
    page,
  }) => {
    await page.route(`**/${ROLLBACK_REPRESENTATIVE.definitionPath}`, async (route) => {
      await route.fulfill({ status: 503, contentType: 'text/plain', body: 'unavailable' });
    });
    await page.goto('/en/explore');
    await waitForFractalCanvasReady(page);
    const canvas = page.locator('[data-testid="fractal-canvas"]');
    await expect(canvas).toHaveAttribute('data-render-status', 'ready', {
      timeout: 45_000,
    });
    await expect(canvas).toHaveAttribute('data-rendered-formula-id', 'mandelbrot');

    await openLibrary(page);
    await selectDirectoryRow(page, ROLLBACK_REPRESENTATIVE.displayName);

    await expect(page.getByRole('alert')).toContainText(
      'This formula could not be loaded. Your current formula was kept.',
    );
    await expect(
      page.getByRole('dialog', { name: 'Standard Formula Library' }),
    ).toBeVisible();
    await expect(page.locator('[data-testid="explore-root"]')).toHaveAttribute(
      'data-formula-id',
      'mandelbrot',
    );
    await expect(canvas).toHaveAttribute('data-render-status', 'ready');
    await expect(canvas).toHaveAttribute('data-rendered-formula-id', 'mandelbrot');
    await expect(page).not.toHaveURL(/[?&]fm=/);
  });

  test('keeps built-in formulas usable when the published runtime is removed', async ({
    page,
  }) => {
    await page.route('**/formula-library/v1/runtime/published/index.json', async (route) => {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'removed' });
    });
    await page.goto('/en/explore?fm=bs');
    await waitForFractalCanvasReady(page);
    await expect(page.locator('[data-testid="explore-root"]')).toHaveAttribute(
      'data-formula-id',
      'burningShip',
    );
    await expect(page.locator('[data-testid="fractal-canvas"]')).toHaveAttribute(
      'data-rendered-formula-id',
      'burningShip',
    );

    await page.getByRole('button', { name: 'Open Library' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();

    await expect(page).toHaveURL(/[?&]fm=bs(?:[&#]|$)/);
    await expect(page.locator('[data-testid="fractal-canvas"]')).toHaveAttribute(
      'data-rendered-formula-id',
      'burningShip',
    );
  });

  test('lazily loads and renders all three implementation bases', async ({ page }) => {
    test.setTimeout(420_000);
    const definitionRequests: string[] = [];
    const shaderErrors: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/formula-library/v1/runtime/published/definitions/')) {
        definitionRequests.push(request.url());
      }
    });
    page.on('console', (message) => {
      if (message.type() === 'error' && /shader|compile|webgl/i.test(message.text())) {
        shaderErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => {
      if (/shader|compile|webgl/i.test(error.message)) shaderErrors.push(error.message);
    });

    await page.goto('/en/explore');
    await waitForFractalCanvasReady(page);
    await openLibrary(page);

    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Algebraic Power' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Root Finding' })).toBeVisible();
    expect(definitionRequests).toEqual([]);

    for (const representative of REPRESENTATIVES) {
      await selectDirectoryRow(page, representative.displayName);
      await expect(
        page.getByRole('dialog', { name: 'Standard Formula Library' }),
      ).toBeHidden({ timeout: 45_000 });
      await expect(
        page.getByText(representative.displayName, { exact: true }),
      ).toBeVisible({ timeout: 45_000 });
      await waitForFractalCanvasReady(page);
      if (representative.displayName !== 'juliaconj') await openLibrary(page);
    }

    const realPart = page.getByLabel('offset Re');
    const imaginaryPart = page.getByLabel('offset Im');
    await expect(realPart).toHaveValue('0', { timeout: 45_000 });
    await expect(imaginaryPart).toHaveValue('0');
    await realPart.fill('0.25');
    await expect(realPart).toHaveValue('0.25');

    expect(definitionRequests).toHaveLength(REPRESENTATIVES.length);
    for (const representative of REPRESENTATIVES) {
      expect(
        definitionRequests.some((url) => url.endsWith(representative.definitionPath)),
        `${representative.basis} Definition was requested`,
      ).toBe(true);
    }
    expect(shaderErrors).toEqual([]);

    await expect.poll(
      () => {
        const url = new URL(page.url());
        return {
          formula: url.searchParams.get('fm'),
          params: url.searchParams.get('pp'),
        };
      },
      { timeout: 60_000 },
    ).toEqual({
      formula: REPRESENTATIVES[2].formulaId,
      params: 'frmV1_offset:0.25|0',
    });

    await page.reload();
    await waitForFractalCanvasReady(page);
    await expect(
      page.getByText(REPRESENTATIVES[2].displayName, { exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByLabel('offset Re')).toHaveValue('0.25');
    await expect(page.getByLabel('offset Im')).toHaveValue('0');
    expect(definitionRequests).toHaveLength(REPRESENTATIVES.length + 1);
    expect(definitionRequests.at(-1)).toContain(REPRESENTATIVES[2].definitionPath);

    await page.reload();
    await waitForFractalCanvasReady(page);
    await expect(
      page.getByText(REPRESENTATIVES[2].displayName, { exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByLabel('offset Re')).toHaveValue('0.25');
    await expect(page.getByLabel('offset Im')).toHaveValue('0');
    expect(definitionRequests).toHaveLength(REPRESENTATIVES.length + 2);
    expect(definitionRequests.at(-1)).toContain(REPRESENTATIVES[2].definitionPath);
    expect(shaderErrors).toEqual([]);
  });

  test('fails crafted Standard URL parameters closed in cold and warm sessions', async ({ page }) => {
    test.setTimeout(180_000);
    const definitionRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/formula-library/v1/runtime/published/definitions/')) {
        definitionRequests.push(request.url());
      }
    });

    const craftedHref = (angleScale: number) => {
      const query = new URLSearchParams({
        fm: HARD_DOMAIN_REPRESENTATIVE.formulaId,
        tr: 'polar',
        pp: [
          `${HARD_DOMAIN_REPRESENTATIVE.uniformName}:999`,
          `u_polarAngleScale:${angleScale}`,
          'hostile_unknown:1',
        ].join(','),
      });
      return `/en/explore?${query.toString()}`;
    };

    await page.goto(craftedHref(1.5));
    await waitForFractalCanvasReady(page);
    await expect(
      page.getByText(HARD_DOMAIN_REPRESENTATIVE.displayName, { exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByLabel('phoenixMultiP')).toHaveValue('0.5');
    await expect.poll(
      () => {
        const url = new URL(page.url());
        return {
          transform: url.searchParams.get('tr'),
          params: url.searchParams.get('pp'),
        };
      },
      { timeout: 60_000 },
    ).toEqual({
      transform: 'polar',
      params: 'u_polarAngleScale:1.5',
    });
    expect(definitionRequests).toEqual([
      expect.stringContaining(HARD_DOMAIN_REPRESENTATIVE.definitionPath),
    ]);

    // Keep the loaded plugin in the module registry. Build a normal Next.js
    // forward entry first, then replace only the Explore entry's URL while
    // preserving its router state. The final browser back is a real
    // client-side remount with a warm registry and hostile params.
    await page.getByRole('link', { name: 'Formulas', exact: true }).first().click();
    await expect(page).toHaveURL(/\/en\/formulas$/, { timeout: 60_000 });
    await page.goBack();
    await expect(page).toHaveURL(/\/en\/explore\?/, { timeout: 60_000 });
    await page.evaluate((href) => {
      window.history.replaceState(window.history.state, '', href);
    }, craftedHref(1.75));
    await page.goForward();
    await expect(page).toHaveURL(/\/en\/formulas$/, { timeout: 60_000 });
    await page.goBack();
    await expect(page).toHaveURL(/\/en\/explore\?/, { timeout: 60_000 });
    await waitForFractalCanvasReady(page);
    await expect(
      page.getByText(HARD_DOMAIN_REPRESENTATIVE.displayName, { exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByLabel('phoenixMultiP')).toHaveValue('0.5');
    await expect.poll(
      () => new URL(page.url()).searchParams.get('pp'),
      { timeout: 60_000 },
    ).toBe('u_polarAngleScale:1.75');
    expect(definitionRequests).toHaveLength(3);
    expect(
      definitionRequests.every((url) =>
        url.endsWith(HARD_DOMAIN_REPRESENTATIVE.definitionPath),
      ),
    ).toBe(true);
  });

  test('applies a verified Lucky profile atomically and restores it in one Undo', async ({ page }) => {
    const definitionRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/formula-library/v1/runtime/published/definitions/')) {
        definitionRequests.push(request.url());
      }
    });

    await page.goto(
      '/en/explore?fm=ph&cx=1&cy=-2&z=8&iter=640&julia=1&jre=0.4&jim=-0.6&oc=st&tr=polar&ssaa=1&ait=1&pp=u_phoenixP:-0.2',
    );
    await waitForFractalCanvasReady(page);
    await expect(page).toHaveURL(/(?:\?|&)pal=0(?:&|$)/, { timeout: 60_000 });
    await waitForFractalCanvasReady(page);

    await page.getByRole('tab', { name: 'Transform', exact: true }).click();
    const angleScale = page.locator(
      '[role="slider"][aria-valuemin="0.25"][aria-valuemax="3"]',
    );
    await expect(angleScale).toHaveAttribute('aria-valuenow', '1');
    await angleScale.focus();
    for (let step = 0; step < 10; step += 1) {
      await angleScale.press('ArrowRight');
    }
    await expect(angleScale).toHaveAttribute('aria-valuenow', '1.5');
    await page.getByRole('tab', { name: 'Formula', exact: true }).click();
    await expect.poll(
      () => new URL(page.url()).searchParams.get('pp'),
      { timeout: 60_000 },
    ).toBe('u_phoenixP:-0.2,u_polarAngleScale:1.5');

    await page.evaluate(() => {
      Math.random = () => 0;
    });

    const lucky = page.getByRole('button', { name: 'Feeling Lucky?' });
    await lucky.click();
    await waitForFractalCanvasReady(page);

    await expect.poll(
      () => {
        const params = new URL(page.url()).searchParams;
        return {
          formula: params.get('fm'),
          centerX: Number(params.get('cx')),
          centerY: Number(params.get('cy')),
          zoom: Number(params.get('z')),
          iterations: Number(params.get('iter')),
          julia: params.get('julia'),
          coloring: params.get('oc'),
          transform: params.get('tr'),
          ssaa: params.get('ssaa'),
          adaptive: params.get('ait'),
          pluginParams: (params.get('pp') ?? '').split(',').filter(Boolean).sort(),
        };
      },
      { timeout: 60_000 },
    ).toEqual({
      formula: LUCKY_REPRESENTATIVE.formulaId,
      centerX: -0.5,
      centerY: 0,
      zoom: 0.4,
      iterations: 96,
      julia: '0',
      coloring: 'st',
      transform: 'polar',
      ssaa: '1',
      adaptive: '1',
      pluginParams: ['u_polarAngleScale:1.5'],
    });
    expect(definitionRequests).toEqual([
      expect.stringContaining(LUCKY_REPRESENTATIVE.definitionPath),
    ]);

    const undo = page.getByRole('button', { name: 'Undo Formula Change' });
    await expect(undo).toBeEnabled();
    await undo.click();
    await waitForFractalCanvasReady(page);
    await expect.poll(
      () => {
        const params = new URL(page.url()).searchParams;
        return {
          formula: params.get('fm'),
          centerX: Number(params.get('cx')),
          centerY: Number(params.get('cy')),
          zoom: Number(params.get('z')),
          iterations: Number(params.get('iter')),
          julia: params.get('julia'),
          pluginParams: (params.get('pp') ?? '').split(',').filter(Boolean).sort(),
        };
      },
      { timeout: 60_000 },
    ).toEqual({
      formula: 'ph',
      centerX: 1,
      centerY: -2,
      zoom: 8,
      iterations: 640,
      julia: '1',
      pluginParams: [
        'u_phoenixP:-0.2',
        'u_polarAngleScale:1.5',
      ],
    });
    await expect(undo).toBeDisabled();
    expect(definitionRequests).toHaveLength(1);
  });

  for (const width of [320, 390] as const) {
    test(`is a full-width keyboard-operable layer at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 720 : 844 });
      await page.goto('/en/explore');
      await waitForFractalCanvasReady(page);

      const trigger = page.getByRole('button', { name: 'Open Library' });
      await trigger.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Standard Formula Library' });
      await expect(dialog).toBeVisible();
      await dialog.evaluate(async (element) => {
        await Promise.all(
          element.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
        );
      });
      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.x).toBe(0);
      expect(box?.width).toBe(width);

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }
});
