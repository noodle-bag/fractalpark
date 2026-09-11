import { expect, test } from '@playwright/test';
import executions from '../../resources/formula-library/v1/fixed-seed-execution.v1.json';
import index from '../../public/formula-library/v1/runtime/published/index.json';

for (const name of ['frm-c1', 'flip0_man_m']) {
  const row = index.rows.find(row => row.displayName === name)!;
  test(`${name}: animation playback preserves the selected plane on stop`, async ({ page }) => {
    test.setTimeout(120_000);
    const mode = name === 'frm-c1' ? 'julia=1&jre=-0.7&jim=0.27' : 'pp=frmV1_pixelSource:1%7C0,frmV1_pixelConstant:-0.7%7C0.27';
    await page.goto(`/en/explore?fm=${row.formulaId}&iter=24&cx=-0.5&cy=0&z=0.4&${mode}&kf=-0.5,0,0.4,0%7C-0.2,0.1,0.7,0`);
    const canvas = page.getByTestId('fractal-canvas');
    await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 60_000 });
    const original = await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL());
    await page.getByRole('tab', { name: 'Animation', exact: true }).click();
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
    await expect(canvas).toHaveCount(0);
    const frames = new Set<string>();
    await expect.poll(async () => {
      frames.add(await page.locator('canvas').evaluate(node => (node as HTMLCanvasElement).toDataURL()));
      return frames.size;
    }, { timeout: 60_000 }).toBeGreaterThan(2);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 60_000 });
    await expect.poll(() => canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL())).toBe(original);
  });
}

test('Chinese mobile dynamical mode keeps out-of-window precise values', async ({ page }) => {
  const row = index.rows.find(row => row.displayName === 'flip0_man_m')!;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/zh/explore?fm=${row.formulaId}&iter=24&pp=frmV1_pixelSource:1%7C0,frmV1_pixelConstant:3.456789%7C-4.56789`);
  await expect(page.locator('#coordinate-source')).toHaveText('动力平面（固定参数）', { timeout: 45_000 });
  await expect(page.locator('#coordinate-value-re')).toHaveValue('3.456789');
  await expect(page.locator('#coordinate-value-im')).toHaveValue('-4.56789');
  await expect(page.locator('#julia-mode')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

for (const execution of executions.rows) {
  const row = index.rows.find(row => row.formulaId === execution.formulaId)!;
  const julia = execution.mode === 'julia';
  test(`${row.displayName}: explicit ${execution.mode} mode, restoration and project values`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1000, height: 720 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    // The existing Julia toggle restores the default ordinary viewport.
    // Start at that same viewport so restoration compares like with like.
    await page.goto(`/en/explore?fm=${row.formulaId}&iter=24&cx=-0.5&cy=0&z=0.4&jre=-0.7&jim=0.27`);
    const canvas = page.getByTestId('fractal-canvas');
    const pixels = () => canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL());
    await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 60_000 });
    const original = await pixels();
    const source = page.getByRole('combobox', { name: 'Coordinate source' });
    const toggle = page.locator('#julia-mode');
    const real = julia ? page.locator('#julia-re') : page.locator('#coordinate-value-re');
    const imaginary = julia ? page.locator('#julia-im') : page.locator('#coordinate-value-im');
    const activate = async () => {
      if (julia) await toggle.check();
      else {
        await source.click();
        await page.getByRole('option', { name: 'Dynamical plane (fixed parameter)', exact: true }).click();
      }
    };
    if (julia) {
      await expect(toggle).not.toBeChecked();
      await expect(source).toHaveCount(0);
      await expect(page.getByText('Parameter plane', { exact: true })).toBeVisible();
    } else {
      await expect(toggle).toHaveCount(0);
      await expect(source).toHaveText('Follow canvas coordinates');
      await expect(page.getByText(/not a classical Julia claim/)).toBeVisible();
    }
    await activate();
    await real.fill('-0.7');
    await real.press('Tab');
    await imaginary.fill('0.27');
    await imaginary.press('Tab');
    await expect.poll(pixels, { timeout: 60_000 }).not.toBe(original);
    await expect.poll(() => new URL(page.url()).searchParams.get(julia ? 'julia' : 'pp'))
      .toContain(julia ? '1' : 'frmV1_pixelSource:1|0');
    const fixed = await pixels();
    await real.fill('0.2');
    await real.press('Tab');
    await expect.poll(pixels, { timeout: 60_000 }).not.toBe(fixed);
    await expect.poll(() => new URL(page.url()).searchParams.get(julia ? 'jre' : 'pp'))
      .toContain(julia ? '0.200000' : 'frmV1_pixelConstant:0.2|0.27');
    if (julia) await toggle.uncheck();
    else {
      await source.click();
      await page.getByRole('option', { name: 'Follow canvas coordinates', exact: true }).click();
    }
    await expect.poll(pixels, { timeout: 60_000 }).toBe(original);
    await activate();
    await expect.poll(async () => Number(await real.inputValue())).toBeCloseTo(0.2, 6);
    await expect.poll(() => new URL(page.url()).searchParams.get(julia ? 'julia' : 'pp'))
      .toContain(julia ? '1' : 'frmV1_pixelSource:1|0');
    await page.reload();
    await expect(real).toHaveValue('0.2', { timeout: 45_000 });
    await expect(imaginary).toHaveValue('0.27');
    await expect(canvas).toHaveAttribute('data-render-status', 'ready', { timeout: 60_000 });
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Project', exact: true }).click();
    const download = await downloadEvent;
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
    const formula = JSON.parse(Buffer.concat(chunks).toString('utf8')).document.formula;
    expect(formula.isJulia).toBe(julia);
    if (julia) expect(formula.juliaC).toEqual([0.2, 0.27]);
    else expect(formula.params.formula.frmV1_pixelConstant).toEqual([0.2, 0.27]);
    await download.delete();
    expect(errors).toEqual([]);
  });
}
