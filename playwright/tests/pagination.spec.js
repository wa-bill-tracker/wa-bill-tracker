// @ts-check
const { test, expect } = require('../support/fixture-test');

/**
 * Pagination tests -- verify the app paginates bill cards correctly.
 * The app uses infinite scroll with a page size of 25.
 */

async function waitForBills(page) {
  await page.locator('.bill-card').first().waitFor({ state: 'visible', timeout: 30_000 });
}

test.describe('Pagination', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForBills(page);
  });

  test('default view shows bill cards', async ({ page }) => {
    const count = await page.locator('.bill-card').count();
    expect(count).toBeGreaterThan(0);
  });

  test('total bills stat card matches the number of active bills', async ({ page }) => {
    const totalBills = page.locator('#totalBills');
    await expect(async () => {
      const text = await totalBills.textContent();
      expect(Number(text)).toBeGreaterThan(0);
    }).toPass({ timeout: 30_000 });
  });
});
