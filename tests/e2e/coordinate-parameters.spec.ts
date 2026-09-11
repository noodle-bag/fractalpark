import { expect, test } from '@playwright/test';
import index from '../../public/formula-library/v1/runtime/published/index.json';

const formulas = [
  { name: 'bailout-a', id: '9e4246cb-bc41-57ba-9903-5c3dcc366cac' },
  { name: 'tobeyrichard2', id: 'dff2d794-c48f-5555-af0d-e7fe77a80099' },
  { name: 'bailout-b', id: 'a8ec7595-53a9-52cc-994c-e4a09fe63d83' },
  { name: 'bailout-c', id: '6409d7e7-7652-5222-865c-5367ff372d7d' },
  { name: 'tjerent', id: '68dbf03a-d943-55ae-ba14-8a597d4c8477' },
  { name: 'tjerfzppfnre', id: '9c92a2b0-a3a8-55ca-b89c-941099319d6e' },
  { name: 'ok-34', id: '0e1b1705-ae4c-5685-b0fc-b82586ff144e' },
];
formulas.push(...index.rows
  .filter(row => ['ghost', 'leemandel3', 'ent', 'jm_18', 'frm-a'].includes(row.displayName))
  .map(row => ({ name: row.displayName, id: row.formulaId })));

test.describe('coordinate parameters, separate from Julia', () => {
  test.describe.configure({ timeout: 120_000 });

  for (const formula of formulas) {
    test(`${formula.name}: fixed input, canvas restoration, and reload`, async ({ page }) => {
      await page.setViewportSize({ width: 1000, height: 720 });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const active = index.rows.find(row => row.formulaId === formula.id)!.parameters
        .filter(slot => slot.type === 'complex' && slot.slotName !== 'shift')
        .map(slot => `${slot.uniformName}:0.3|0.1`).join(',');
      await page.goto(`/en/explore?fm=${formula.id}&iter=24&pp=${encodeURIComponent(active)}`);
      const canvas = page.getByTestId('fractal-canvas');
      const pixels = () => canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL());
      const source = page.getByRole('combobox', { name: 'Coordinate source' });
      await expect(source).toHaveText('Follow canvas coordinates', { timeout: 45_000 });
      await expect(page.locator('#julia-mode')).toHaveCount(0);
      await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 60_000 });
      const original = await pixels();
      await source.click();
      await page.getByRole('option', { name: 'Fixed parameter', exact: true }).click();
      const real = page.getByRole('spinbutton', { name: 'Coordinate parameter Re' });
      const imaginary = page.getByRole('spinbutton', { name: 'Coordinate parameter Im' });
      await real.fill('-0.7');
      await real.press('Enter');
      await imaginary.fill('0.27');
      await imaginary.press('Enter');
      await expect.poll(() => new URL(page.url()).searchParams.get('pp')).toContain('frmV1_pixelConstant:-0.7|0.27');
      await expect.poll(pixels, { timeout: 60_000 }).not.toBe(original);

      // The same control supports keyboard movement on its complex plane.
      const plane = page.getByRole('group', { name: 'Coordinate parameter Parameter plane' });
      await plane.focus();
      // A 0.01 step may retain the same quantized escape color. Verify that a
      // fresh worker frame arrives; CPU/GPU state tests check map sensitivity.
      await canvas.evaluate(node => {
        const element = node as HTMLCanvasElement;
        const context = element.getContext('2d');
        if (!context) throw new Error('worker-presentation-context-missing');
        const draw = context.drawImage;
        element.dataset.testPaintCount = '0';
        context.drawImage = (...args: unknown[]) => {
          Reflect.apply(draw, context, args);
          element.dataset.testPaintCount = String(Number(element.dataset.testPaintCount) + 1);
        };
      });
      await plane.press('ArrowRight');
      await expect.poll(async () => Number(await real.inputValue())).toBeCloseTo(-0.69, 6);
      await expect.poll(() => canvas.evaluate(node => Number((node as HTMLCanvasElement).dataset.testPaintCount))).toBeGreaterThan(0);
      await source.click();
      await page.getByRole('option', { name: 'Follow canvas coordinates', exact: true }).click();
      await expect(real).toHaveCount(0);
      await expect.poll(pixels, { timeout: 60_000 }).toBe(original);
      await source.click();
      await page.getByRole('option', { name: 'Fixed parameter', exact: true }).click();
      await expect.poll(async () => Number(await real.inputValue())).toBeCloseTo(-0.69, 6);
      await expect.poll(() => new URL(page.url()).searchParams.get('pp')).toContain('frmV1_pixelConstant:-0.69|0.27');
      await expect.poll(() => new URL(page.url()).searchParams.get('pp')).toContain('frmV1_pixelSource:1|0');
      await page.reload();
      await expect(source).toHaveText('Fixed parameter', { timeout: 45_000 });
      await expect.poll(async () => Number(await real.inputValue())).toBeCloseTo(-0.69, 6);
      await expect(imaginary).toHaveValue('0.27');
      await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 60_000 });

      if (formula.name === 'bailout-a') {
        const beforeShift = await pixels();
        const shift = page.getByRole('spinbutton', { name: 'shift Re' });
        await shift.fill('0.3');
        await shift.press('Enter');
        await expect.poll(pixels, { timeout: 60_000 }).not.toBe(beforeShift);
        await expect.poll(async () => Number(await real.inputValue())).toBeCloseTo(-0.69, 6);
        await expect(imaginary).toHaveValue('0.27');
      }
      const downloaded = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download Project', exact: true }).click();
      const download = await downloaded;
      const chunks: Buffer[] = [];
      for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
      const saved = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      expect(saved.document.formula.params.formula.frmV1_pixelSource).toEqual([1, 0]);
      expect(saved.document.formula.params.formula.frmV1_pixelConstant).toEqual([-0.69, 0.27]);
      await download.delete();
      expect(errors).toEqual([]);
    });
  }

  test('does not reinterpret a legacy Julia link as a fixed coordinate', async ({ page }) => {
    await page.goto(`/en/explore?fm=${formulas[0].id}&julia=1&jre=-0.7&jim=0.27&iter=24`);
    await expect(page.getByRole('combobox', { name: 'Coordinate source' }))
      .toHaveText('Follow canvas coordinates', { timeout: 45_000 });
    await expect(page.locator('#julia-mode')).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get('julia')).toBe('1');
    await expect(page.getByTestId('fractal-canvas')).toHaveAttribute('data-render-status', 'ready', { timeout: 60_000 });
  });

  test('keeps fixed coordinates through animation preview and stop', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/en/explore?fm=${formulas[0].id}&iter=24&cx=-0.5&cy=0&z=0.4&pp=frmV1_pixelSource:1%7C0,frmV1_pixelConstant:-0.7%7C0.27&kf=-0.5,0,0.4,0%7C-0.2,0.1,0.7,0`);
    const staticCanvas = page.getByTestId('fractal-canvas');
    await expect(staticCanvas).toHaveAttribute('data-render-status', 'ready', { timeout: 60_000 });
    const original = await staticCanvas.evaluate(node => (node as HTMLCanvasElement).toDataURL());
    await page.getByRole('tab', { name: 'Animation', exact: true }).click();
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
    await expect(staticCanvas).toHaveCount(0);
    const frames = new Set<string>();
    await expect.poll(async () => {
      frames.add(await page.locator('canvas').evaluate(node => (node as HTMLCanvasElement).toDataURL()));
      return frames.size;
    }, { timeout: 60_000 }).toBeGreaterThan(2);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(staticCanvas).toHaveAttribute('data-render-status', 'ready', { timeout: 60_000 });
    await expect.poll(() => staticCanvas.evaluate(node => (node as HTMLCanvasElement).toDataURL())).toBe(original);
    expect(new URL(page.url()).searchParams.get('pp')).toContain('frmV1_pixelConstant:-0.7|0.27');
    expect(errors).toEqual([]);
  });

  test('supports exact out-of-window values and Chinese controls on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/zh/explore?fm=${formulas[0].id}&iter=24&pp=frmV1_pixelSource:1%7C0,frmV1_pixelConstant:3.456789%7C-4.56789`);
    await expect(page.getByRole('combobox', { name: '坐标来源' })).toHaveText('固定参数', { timeout: 45_000 });
    await expect(page.getByRole('spinbutton', { name: '坐标参数 实部' })).toHaveValue('3.456789');
    await expect(page.getByRole('spinbutton', { name: '坐标参数 虚部' })).toHaveValue('-4.56789');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByTestId('fractal-canvas')).toHaveAttribute('data-render-status', 'ready', { timeout: 60_000 });
  });
});
