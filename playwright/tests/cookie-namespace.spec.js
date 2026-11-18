// @ts-check
const { test, expect } = require('../support/fixture-test');

/**
 * Data persistence tests -- verify tracked bills persist across reload and
 * that wa_tracker cookie/localStorage keys are used.
 *
 * The app loads data remotely from raw.githubusercontent.com so generous
 * timeouts are used to account for network latency.
 */

/** Helper: wait for bills to finish loading */
async function waitForBills(page) {
  await page.locator('.bill-card').first().waitFor({ state: 'visible', timeout: 30_000 });
}

test.describe('Data persistence', () => {
  test('track a bill and verify it persists across reload', async ({ page }) => {
    await page.goto('/');
    await waitForBills(page);

    // Find the first bill card's track button and click it
    const trackBtn = page.locator('.bill-card').first().locator('[data-action="track"]');
    await expect(trackBtn).toBeVisible({ timeout: 10_000 });
    await trackBtn.click();

    // Wait for the tracked count to update
    const trackedBills = page.locator('#trackedBills');
    await expect(async () => {
      const text = await trackedBills.textContent();
      expect(Number(text)).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });

    const trackedCountBefore = Number(await trackedBills.textContent());

    // Reload the page
    await page.reload();
    await waitForBills(page);

    // Verify the tracked count persists after reload
    const trackedBillsAfter = page.locator('#trackedBills');
    await expect(async () => {
      const text = await trackedBillsAfter.textContent();
      expect(Number(text)).toBeGreaterThanOrEqual(trackedCountBefore);
    }).toPass({ timeout: 30_000 });
  });

  test('localStorage or cookies contain wa_tracker keys', async ({ page }) => {
    await page.goto('/');
    await waitForBills(page);

    // Check for wa_tracker keys in localStorage or cookies
    const hasWaTrackerKeys = await page.evaluate(() => {
      // Check localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('wa_tracker')) {
          return true;
        }
      }
      // Check cookies
      if (document.cookie.includes('wa_tracker')) {
        return true;
      }
      return false;
    });

    expect(hasWaTrackerKeys).toBe(true);
  });
});
