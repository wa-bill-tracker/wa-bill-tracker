// @ts-check
const { test, expect } = require('../support/fixture-test');

/**
 * Smoke tests -- verify the page loads, renders bill data, and has no errors.
 *
 * These tests hit the live raw.githubusercontent.com endpoint for bill data,
 * so generous timeouts are used to account for network latency.
 */

test.describe('Smoke tests', () => {
  test('page loads and title contains "WA Legislative Tracker"', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/WA Legislative Tracker/);
  });

  test('bills render -- at least one .bill-card element appears', async ({ page }) => {
    await page.goto('/');

    // Wait for the first bill card to appear (data is fetched remotely)
    const firstCard = page.locator('.bill-card').first();
    await expect(firstCard).toBeVisible({ timeout: 30_000 });

    // Verify there is more than one bill card
    const count = await page.locator('.bill-card').count();
    expect(count).toBeGreaterThan(0);
  });

  test('stat cards populate with numbers greater than zero', async ({ page }) => {
    await page.goto('/');

    // Wait for bill data to load by waiting for totalBills to update from "0"
    const totalBills = page.locator('#totalBills');
    await expect(totalBills).not.toHaveText('0', { timeout: 30_000 });

    // totalBills should be a positive number
    const totalText = await totalBills.textContent();
    expect(Number(totalText)).toBeGreaterThan(0);

    // trackedBills element should exist (value may be 0 for a fresh session)
    const trackedBills = page.locator('#trackedBills');
    await expect(trackedBills).toBeVisible();
  });

  test('no console errors on page load', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');

    // Wait for data to load before checking
    await page.locator('.bill-card').first().waitFor({ state: 'visible', timeout: 30_000 });

    // Allow a brief settling period for any async callbacks
    await page.waitForTimeout(1000);

    expect(errors).toEqual([]);
  });
});
