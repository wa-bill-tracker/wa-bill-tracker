// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Filter tests -- verify search, status filters, bill type nav, and clear behavior.
 *
 * The app loads data remotely from raw.githubusercontent.com so every test
 * waits for bill cards to render before interacting with filters.
 */

/** Helper: wait for bills to finish loading */
async function waitForBills(page) {
  await page.locator('.bill-card').first().waitFor({ state: 'visible', timeout: 30_000 });
}

/** Helper: get the visible (non-hidden) bill card count */
async function visibleBillCount(page) {
  // bill-card elements that are currently in the DOM (app re-renders the grid)
  return page.locator('.bill-card').count();
}

/**
 * Helper: true when the current session (per data/session.json) has not
 * started yet. "At Governor" fixtures require real in-session bill data
 * that cannot exist before the session convenes.
 */
async function isPreSession(page) {
  const res = await page.request.get('/data/session.json');
  const session = await res.json();
  return new Date() < new Date(session.sessionStart);
}

test.describe('Filter tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForBills(page);
  });

  test('search filter works -- type "education" and verify filtered results', async ({ page }) => {
    const searchInput = page.locator('#searchInput');
    const initialCount = await visibleBillCount(page);

    await searchInput.fill('education');

    // Wait for the grid to re-render with filtered results
    // The count should decrease (or stay the same if every bill matches, unlikely)
    await expect(async () => {
      const filteredCount = await visibleBillCount(page);
      expect(filteredCount).toBeLessThan(initialCount);
      expect(filteredCount).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });

    // Verify at least one visible card contains "education" (case-insensitive)
    const firstCard = page.locator('.bill-card').first();
    const cardText = await firstCard.textContent();
    expect(cardText?.toLowerCase()).toContain('education');
  });

  test('status filter works -- click "Signed Into Law" filter tag', async ({ page }) => {
    // Open the filters panel
    await page.locator('#filterToggle').click();
    await expect(page.locator('#filtersPanel')).toBeVisible();

    // Click the "Signed Into Law" filter tag
    const enactedTag = page.locator('.filter-tag[data-value="enacted"]');
    await enactedTag.click();

    // Wait for the filter to take effect -- bill cards should update
    await expect(async () => {
      const count = await visibleBillCount(page);
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });
  });

  test('status filter works -- click "At Governor" filter tag', async ({ page }) => {
    test.skip(await isPreSession(page), 'requires 2027 in-session bill data (no governor-status bills yet)');
    // Open the filters panel
    await page.locator('#filterToggle').click();
    await expect(page.locator('#filtersPanel')).toBeVisible();

    // Click the "At Governor" filter tag
    const governorTag = page.locator('.filter-tag[data-value="governor"]');
    await governorTag.click();

    // Wait for the filter to take effect
    await expect(async () => {
      const count = await visibleBillCount(page);
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });
  });

  test('bill type nav works -- click "Senate Bills" tab', async ({ page }) => {
    const initialCount = await visibleBillCount(page);

    // Click the Senate Bills nav tab
    const senateTab = page.locator('.nav-tab[data-type="SB"]');
    await senateTab.click();

    // The tab should become active
    await expect(senateTab).toHaveClass(/active/);

    // Wait for bills to re-render -- count should change
    await expect(async () => {
      const filteredCount = await visibleBillCount(page);
      expect(filteredCount).toBeGreaterThan(0);
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    }).toPass({ timeout: 10_000 });

    // Page title should update to reflect Senate Bills
    await expect(page.locator('#pageTitle')).toHaveText(/Senate Bills/);
  });

  test('bill type nav works -- click "House Bills" tab', async ({ page }) => {
    // Click the House Bills nav tab
    const houseTab = page.locator('.nav-tab[data-type="HB"]');
    await houseTab.click();

    await expect(houseTab).toHaveClass(/active/);

    await expect(async () => {
      const filteredCount = await visibleBillCount(page);
      expect(filteredCount).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });

    await expect(page.locator('#pageTitle')).toHaveText(/House Bills/);
  });

  test('clear filters restores full list', async ({ page }) => {
    // Record the initial bill count
    const initialCount = await visibleBillCount(page);

    // Apply a search filter to reduce the list
    const searchInput = page.locator('#searchInput');
    await searchInput.fill('education');

    // Wait for filtering to take effect
    await expect(async () => {
      const filteredCount = await visibleBillCount(page);
      expect(filteredCount).toBeLessThan(initialCount);
    }).toPass({ timeout: 10_000 });

    // Clear the search input
    await searchInput.fill('');

    // Wait for the full list to restore
    await expect(async () => {
      const restoredCount = await visibleBillCount(page);
      expect(restoredCount).toEqual(initialCount);
    }).toPass({ timeout: 10_000 });
  });

  test('combining filters -- search within a bill type', async ({ page }) => {
    // Navigate to Senate Bills
    const senateTab = page.locator('.nav-tab[data-type="SB"]');
    await senateTab.click();

    await expect(async () => {
      const count = await visibleBillCount(page);
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });

    const senateBillCount = await visibleBillCount(page);

    // Apply search filter on top of bill type filter
    const searchInput = page.locator('#searchInput');
    await searchInput.fill('tax');

    await expect(async () => {
      const count = await visibleBillCount(page);
      expect(count).toBeLessThanOrEqual(senateBillCount);
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });
  });
});
