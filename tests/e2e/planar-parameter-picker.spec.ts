import { expect, test } from '@playwright/test';

const PSEUDOLAMBDA_FORMULA_ID = '9e7250d0-f815-521a-9cf6-6c4d68598b2c';

test.describe('published complex parameter plane', () => {
  test.describe.configure({ timeout: 120_000 });

  test('keeps drag, keyboard, exact input, URL, and reload state in sync', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(
      `/en/explore?fm=${PSEUDOLAMBDA_FORMULA_ID}` +
      '&pp=frmV1_rate%3A0%7C-0.3%2CfrmV1_offset%3A1.6%7C0',
    );
    await expect(page.getByTestId('explore-root')).toHaveAttribute(
      'data-formula-id',
      PSEUDOLAMBDA_FORMULA_ID,
      { timeout: 45_000 },
    );

    const ratePlane = page.getByRole('group', { name: 'rate Parameter plane' });
    const offsetPlane = page.getByRole('group', { name: 'offset Parameter plane' });
    await expect(ratePlane).toBeVisible();
    await expect(offsetPlane).toBeVisible();

    const rateReal = page.getByRole('spinbutton', { name: 'rate Re' });
    const rateImaginary = page.getByRole('spinbutton', { name: 'rate Im' });
    const offsetReal = page.getByRole('spinbutton', { name: 'offset Re' });
    const offsetImaginary = page.getByRole('spinbutton', { name: 'offset Im' });
    await expect(rateReal).toHaveValue('0');
    await expect.poll(async () => Number(await rateImaginary.inputValue())).toBeCloseTo(-0.3, 6);
    await expect.poll(async () => Number(await offsetReal.inputValue())).toBeCloseTo(1.6, 6);
    await expect(offsetImaginary).toHaveValue('0');

    await ratePlane.focus();
    await ratePlane.press('ArrowDown');
    await expect(rateImaginary).toHaveValue('-0.31');

    await page.getByRole('button', { name: 'offset Reset to zero' }).click();
    await expect(offsetReal).toHaveValue('0');
    await expect(offsetImaginary).toHaveValue('0');

    await offsetPlane.scrollIntoViewIfNeeded();
    const planeBox = await offsetPlane.locator('svg').boundingBox();
    expect(planeBox).not.toBeNull();
    if (!planeBox) return;
    const centerX = planeBox.x + planeBox.width / 2;
    const centerY = planeBox.y + planeBox.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(planeBox.x + planeBox.width * 0.9, centerY);
    await page.mouse.up();
    await expect(offsetReal).toHaveValue('1.6');
    await expect(offsetImaginary).toHaveValue('0');

    await rateReal.fill('2.3456789');
    await rateReal.press('Enter');
    await expect(rateReal).toHaveValue('2.3456789');
    await expect.poll(() => new URL(page.url()).searchParams.get('pp')).toContain(
      'frmV1_rate:2.3456789|-0.31',
    );

    await page.reload();
    await expect(page.getByTestId('explore-root')).toHaveAttribute(
      'data-formula-id',
      PSEUDOLAMBDA_FORMULA_ID,
      { timeout: 45_000 },
    );
    await expect(page.getByRole('spinbutton', { name: 'rate Re' })).toHaveValue('2.3456789');
    await expect(page.getByRole('spinbutton', { name: 'rate Im' })).toHaveValue('-0.31');
    await expect(page.getByRole('spinbutton', { name: 'offset Re' })).toHaveValue('1.6');
    expect(pageErrors).toEqual([]);
  });

  test('adjusts a polar multiplier and restores the resulting complex value', async ({ page }) => {
    await page.goto('/en/explore?fm=6fd03e0d-2427-5967-b53d-5540ebc4be56&pp=frmV1_rate%3A1%7C0');
    await page.getByText('Magnitude and angle', { exact: true }).click();
    const angle = page.getByRole('slider', { name: 'rate Angle (°)' });
    await expect(angle).toBeVisible();
    await angle.focus();
    await angle.press('ArrowRight');
    const imaginary = page.getByRole('spinbutton', { name: 'rate Im' });
    await expect.poll(async () => Number(await imaginary.inputValue())).toBeGreaterThan(0);
    const expected = await imaginary.inputValue();
    await expect.poll(() => new URL(page.url()).searchParams.get('pp')).toContain(`|${expected}`);
    await page.reload();
    await expect(page.getByRole('spinbutton', { name: 'rate Im' })).toHaveValue(expected);
  });

  test('keeps a scalar projection’s saved imaginary component on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en/explore?fm=0109434e-e9cc-5d80-ad3f-d25ec62cbfda&pp=frmV1_parameter1%3A0%7C0.77');
    const slider = page.getByRole('slider', { name: 'parameter1 Re' });
    await expect(slider).toBeVisible();
    await slider.focus();
    await slider.press('ArrowRight');
    await expect(page.getByRole('spinbutton', { name: 'parameter1 Re' })).toHaveValue('0.02');
    await expect.poll(() => new URL(page.url()).searchParams.get('pp')).toContain('frmV1_parameter1:0.02|0.77');
    await page.getByText('Im — Only the real component affects the result.', { exact: true }).click();
    await expect(page.getByRole('spinbutton', { name: 'parameter1 Im' })).toHaveValue('0.77');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('uses integer keyboard steps for independent trigger components', async ({ page }) => {
    await page.goto('/en/explore?fm=e44558f3-a2cf-5a16-a6cb-6ac4452a6832&pp=frmV1_firstTimes%3A2%7C4');
    await page.getByText('Trigger iterations', { exact: true }).first().click();
    const first = page.getByRole('slider', { name: 'firstTimes First trigger' });
    await expect(first).toBeVisible();
    await first.focus();
    await first.press('ArrowRight');
    await expect(page.getByRole('spinbutton', { name: 'firstTimes Re' })).toHaveValue('3');
    await expect(page.getByRole('spinbutton', { name: 'firstTimes Im' })).toHaveValue('4');
  });
});
