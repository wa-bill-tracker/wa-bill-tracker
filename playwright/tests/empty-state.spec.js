// @ts-check
const base = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { test: fixtureTest, expect, BILLS_FIXTURE, STALE_IDS } = require('../support/fixture-test');

/**
 * ADO #3118 -- the 2027 views must contain zero 2025-26 bills, and show a
 * prefiling empty state until 2027-28 bills exist.
 *
 * The first describe block runs against the REAL data/bills.json, which still
 * holds the 2025-26 dataset until the first 2027 fetch replaces it.
 */
const test = base.test;
const emptyState = (page) => page.locator('#emptyState');

async function appReady(page) {
  await expect(page.locator('#daysLeftLabel')).toHaveText('Days Until Session');
}

test.describe('Empty state with stale 2025-26 bills.json', () => {
  test('shows no bill cards and zero counts', async ({ page }) => {
    await page.goto('/');
    await appReady(page);
    await expect(page.locator('.bill-card')).toHaveCount(0);
    await expect(page.locator('#totalBills')).toHaveText('0');
    await expect(page.locator('#trackedBills')).toHaveText('0');
    await expect(page.locator('#hearingsWeek')).toHaveText('0'); // Prefiled Bills
    await expect(page.locator('#cutoffFailedSection')).toBeHidden();
  });

  test('says prefiling opens Monday, December 7, 2026 and the session convenes January 11, 2027', async ({ page }) => {
    await page.goto('/');
    await appReady(page);
    await expect(emptyState(page)).toBeVisible();
    await expect(emptyState(page)).toContainText('Prefiling opens Monday, December 7, 2026');
    await expect(emptyState(page)).toContainText('January 11, 2027');
  });

  test('empty-state text is derived from session.json, not hardcoded', async ({ page }) => {
    await page.route('**/data/session.json*', async (route) => {
      const res = await route.fetch();
      const json = await res.json();
      json.prefilingOpens = '2026-12-14';
      await route.fulfill({ response: res, json });
    });
    await page.goto('/');
    await appReady(page);
    await expect(emptyState(page)).toContainText('Prefiling opens Monday, December 14, 2026');
  });

  test('semantics: heading under the page h2, not an alert, links to the prior-session section', async ({ page }) => {
    await page.goto('/');
    await appReady(page);
    await expect(emptyState(page).getByRole('heading', { level: 3 })).toBeVisible();
    await expect(emptyState(page)).not.toHaveAttribute('role', 'alert');
    const link = emptyState(page).getByRole('link', { name: /passed in 2026/i });
    await expect(link).toHaveAttribute('href', '#passed-2026');
  });

  test('has no axe violations in the empty state', async ({ page }) => {
    await page.goto('/');
    await appReady(page);
    await expect(emptyState(page)).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include('#emptyState')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('stale bills in the localStorage cache are also excluded when the fetch fails', async ({ page }) => {
    await page.route('**/data/bills.json*', (route) => route.abort());
    await page.addInitScript((cached) => {
      localStorage.setItem('billsData', cached);
    }, BILLS_FIXTURE);
    await page.goto('/');
    await appReady(page);
    // Cache holds 28 current + 3 stale bills: only the 28 may show.
    await expect(page.locator('#totalBills')).toHaveText('28');
    for (const id of STALE_IDS) {
      await expect(page.locator(`[data-bill-id="${id}"]`)).toHaveCount(0);
    }
  });
});

fixtureTest.describe('Mixed fixture (2027-28 bills plus three stale 2025-26 bills)', () => {
  fixtureTest('no stale bill is rendered, searchable, counted or tracked', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.bill-card').first()).toBeVisible();
    await expect(emptyState(page)).toHaveCount(0);
    await expect(page.locator('#totalBills')).toHaveText('28');
    for (const id of STALE_IDS) {
      await expect(page.locator(`[data-bill-id="${id}"]`)).toHaveCount(0);
    }
    await page.locator('#searchInput').fill('STALE');
    await expect(page.locator('#totalBills')).toHaveText('0');
    await expect(page.locator('.bill-card')).toHaveCount(0);
  });

  fixtureTest('pre-session prefiled stat and stats detail exclude stale bills', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.bill-card').first()).toBeVisible();
    // 8 of the 24 filler bills are prefiled (statuses cycle prefiled x2 of 6, twice per prefix);
    // the stale prefiled bill HB9903 must not be counted.
    await expect(page.locator('#hearingsWeek')).toHaveText('8');
    await page.locator('#daysLeft').click();
    await expect(page.locator('#statsDetail')).toContainText('Prefiled Bills');
    await expect(page.locator('#statsDetail .stats-item', { hasText: 'Prefiled Bills' })).toContainText('8');
  });

  fixtureTest('stale bills do not hide a failed-bills section or inflate the status filters', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.bill-card').first()).toBeVisible();
    await page.locator('#filterToggle').click();
    await page.locator('.filter-tag[data-value="enacted"]').click();
    await expect(page.locator('.bill-card')).toHaveCount(2); // SB + HB fixture enacted, not stale HB9901
    await expect(page.locator('[data-bill-id="HB9901"]')).toHaveCount(0);
  });
});
