// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Session lifecycle state tests -- verify pre-session, active-session, and
 * post-session UI behavior.
 *
 * As of the 2027-28 biennium rollover (Sprint 4), the 2027 long session has
 * not yet convened (sessionStart: 2027-01-11). Until then the app is in the
 * PRE-SESSION state: no current-biennium bill data exists yet, and the UI
 * shows a countdown to session start instead of live bill stats.
 *
 * The app loads data from data/bills.json locally so timeouts are modest.
 */

test.describe('Session lifecycle states', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('pre-session countdown text is shown before session start', async ({ page }) => {
    const daysLeftLabel = page.locator('#daysLeftLabel');
    await expect(daysLeftLabel).toHaveText('Days Until Session', { timeout: 15_000 });
  });

  test('pre-session stat label shows "Prefiled Bills" text', async ({ page }) => {
    const hearingsLabel = page.locator('#hearingsLabel');
    await expect(hearingsLabel).toHaveText('Prefiled Bills', { timeout: 15_000 });
  });

  test('pre-session detail view shows "Upcoming" session heading', async ({ page }) => {
    // Wait for app init (event listeners are wired up after config + bill
    // data load) before clicking, so the click isn't lost to a race under load.
    await expect(page.locator('#daysLeftLabel')).toHaveText('Days Until Session', { timeout: 15_000 });

    await page.locator('#daysLeft').click();
    const heading = page.locator('#statsDetail h2');
    await expect(heading).toContainText('Upcoming', { timeout: 15_000 });
  });
});

// The following tests exercise the ACTIVE and POST-SESSION states. They are
// skipped until 2027 bill data is available (see data/archive/2026-bills.json
// for the prior biennium's fixture, and Sprint 4 rollout notes for details).
test.describe.skip('Active/post-session states (pending 2027 data)', () => {
  async function waitForBills(page) {
    await page.locator('.bill-card').first().waitFor({ state: 'visible', timeout: 30_000 });
  }

  test('active-session stat label shows "Days Remaining" text', async ({ page }) => {
    await page.goto('/');
    await waitForBills(page);
    const daysLeftLabel = page.locator('#daysLeftLabel');
    await expect(daysLeftLabel).toHaveText('Days Remaining', { timeout: 15_000 });
  });

  test('post-session stat label shows "Awaiting Governor" text', async ({ page }) => {
    await page.goto('/');
    await waitForBills(page);
    const hearingsLabel = page.locator('#hearingsLabel');
    await expect(hearingsLabel).toHaveText('Awaiting Governor', { timeout: 15_000 });
  });

  test('post-session stat label shows "Signed Into Law" text', async ({ page }) => {
    await page.goto('/');
    await waitForBills(page);
    const daysLeftLabel = page.locator('#daysLeftLabel');
    await expect(daysLeftLabel).toHaveText('Signed Into Law', { timeout: 15_000 });
  });
});
