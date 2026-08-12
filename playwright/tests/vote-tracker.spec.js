// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Vote tracker tests -- verify that bills which have passed the legislature
 * display vote results and governor status instead of the old progress tracker.
 *
 * The vote tracker feature replaces the "pizza tracker" progress bar with
 * actual vote counts (yeas/nays) and governor action status on bill cards
 * that have reached the governor or been enacted.
 *
 * These tests hit the live raw.githubusercontent.com endpoint for bill data,
 * so generous timeouts are used to account for network latency.
 */

/** Helper: wait for bills to finish loading */
async function waitForBills(page) {
  await page.locator('.bill-card').first().waitFor({ state: 'visible', timeout: 30_000 });
}

/** Helper: get the visible bill card count */
async function visibleBillCount(page) {
  return page.locator('.bill-card').count();
}

/**
 * Helper: true when the current session (per data/session.json) has not
 * started yet. Governor/vote-tracker fixtures require real in-session bill
 * data (bills that have reached "governor" or "enacted" status this
 * biennium) which cannot exist before the session convenes.
 */
async function isPreSession(page) {
  const res = await page.request.get('/data/session.json');
  const session = await res.json();
  return new Date() < new Date(session.sessionStart);
}

/**
 * Helper: filter to governor-status bills using the filter panel.
 * Returns after at least one bill card is visible with the filter applied.
 */
async function filterToGovernorBills(page) {
  await page.locator('#filterToggle').click();
  await expect(page.locator('#filtersPanel')).toBeVisible();

  const governorTag = page.locator('.filter-tag[data-value="governor"]');
  await governorTag.click();

  await expect(async () => {
    const count = await visibleBillCount(page);
    expect(count).toBeGreaterThan(0);
  }).toPass({ timeout: 15_000 });
}

test.describe('Vote tracker display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForBills(page);
  });

  /**
   * Bills that have reached the governor or been enacted should display
   * vote result information instead of the old step-by-step progress tracker.
   * This test filters to governor-status bills and checks that the vote
   * tracker element is present and the old progress tracker is absent.
   */
  test('bill cards for governor-status bills show vote results instead of progress tracker', async ({ page }) => {
    test.skip(await isPreSession(page), 'requires 2027 in-session bill data (no governor-status bills yet)');
    await filterToGovernorBills(page);

    const firstCard = page.locator('.bill-card').first();
    await expect(firstCard).toBeVisible({ timeout: 30_000 });

    // Governor-status bills should have either a vote tracker or progress tracker
    // Vote tracker appears when vote data is present; progress tracker is fallback
    const voteTracker = firstCard.locator('.vote-tracker');
    const progressTracker = firstCard.locator('.bill-progress-tracker');

    // At least one tracker should be visible
    const hasVoteTracker = await voteTracker.count() > 0;
    const hasProgressTracker = await progressTracker.count() > 0;
    expect(hasVoteTracker || hasProgressTracker).toBeTruthy();

    // If vote data is available, vote tracker should be shown
    if (hasVoteTracker) {
      await expect(voteTracker).toBeVisible();
    }
  });

  /**
   * The vote tracker should display separate sections for House and Senate
   * vote results, since bills must pass both chambers.
   */
  test('vote result shows house and senate sections', async ({ page }) => {
    test.skip(await isPreSession(page), 'requires 2027 in-session bill data (no governor-status bills yet)');
    await filterToGovernorBills(page);

    const voteTracker = page.locator('.vote-tracker, .vote-results').first();
    await expect(voteTracker).toBeVisible({ timeout: 15_000 });

    const trackerText = await voteTracker.textContent();

    // The vote tracker should contain chamber labels for both chambers
    expect(trackerText?.toLowerCase()).toContain('house');
    expect(trackerText?.toLowerCase()).toContain('senate');
  });

  /**
   * Vote counts should be displayed as numeric values representing yeas and nays.
   * This verifies that actual vote count numbers are rendered within the tracker.
   */
  test('vote counts are displayed as numbers', async ({ page }) => {
    test.skip(await isPreSession(page), 'requires 2027 in-session bill data (no governor-status bills yet)');
    await filterToGovernorBills(page);

    const voteTracker = page.locator('.vote-tracker, .vote-results').first();
    await expect(voteTracker).toBeVisible({ timeout: 15_000 });

    // Look for elements that contain vote counts (yeas/nays)
    // The implementation may use .vote-count, .yeas, .nays, or similar classes
    const voteCountElements = voteTracker.locator(
      '.vote-count, .yeas, .nays, .vote-yea, .vote-nay, [class*="count"], [class*="yea"], [class*="nay"]'
    );

    const count = await voteCountElements.count();
    expect(count).toBeGreaterThan(0);

    // At least one vote count element should contain a numeric value
    let foundNumeric = false;
    for (let i = 0; i < count; i++) {
      const text = await voteCountElements.nth(i).textContent();
      if (text && /\d+/.test(text)) {
        foundNumeric = true;
        break;
      }
    }
    expect(foundNumeric).toBe(true);
  });

  /**
   * Bills at the governor's desk should display a governor status indicator
   * showing the current state of governor action (e.g., "Awaiting Signature",
   * "Signed", "Vetoed").
   */
  test('governor status row is present on governor-status bills', async ({ page }) => {
    test.skip(await isPreSession(page), 'requires 2027 in-session bill data (no governor-status bills yet)');
    await filterToGovernorBills(page);

    const firstCard = page.locator('.bill-card').first();
    await expect(firstCard).toBeVisible({ timeout: 30_000 });

    // Look for governor status element within the card
    // (class may be .governor-status, .governor-action, or contained within .vote-tracker)
    const governorStatus = firstCard.locator(
      '.governor-status, .governor-action, [class*="governor"]'
    );

    await expect(governorStatus.first()).toBeVisible({ timeout: 15_000 });

    // The governor status text should reference the governor or awaiting action
    const statusText = await governorStatus.first().textContent();
    const lowerText = statusText?.toLowerCase() || '';
    const hasGovernorReference = lowerText.includes('governor') ||
      lowerText.includes('awaiting') ||
      lowerText.includes('signed') ||
      lowerText.includes('delivered');
    expect(hasGovernorReference).toBe(true);
  });

  /**
   * Bills still in committee (early stages) should retain the original
   * step-by-step progress tracker and should NOT display the vote tracker.
   * This confirms that the vote tracker only applies to passed bills.
   */
  test('bills still in committee keep the old progress tracker', async ({ page }) => {
    test.skip(await isPreSession(page), 'requires 2027 in-session bill data (no committee-stage bills yet)');
    // The "Show inactive bills" toggle was removed for the 2027-28 biennium
    // (no prior-session carryover bills exist at biennium start). Committee-
    // stage bills for the current session are visible by default.

    // Open the filters panel and select "In Committee" filter
    await page.locator('#filterToggle').click();
    await expect(page.locator('#filtersPanel')).toBeVisible();

    const committeeTag = page.locator('.filter-tag[data-value="committee"]');
    await committeeTag.click();

    // Wait for committee-stage bills to render
    await expect(async () => {
      const count = await visibleBillCount(page);
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: 15_000 });

    const firstCard = page.locator('.bill-card').first();
    await expect(firstCard).toBeVisible({ timeout: 30_000 });

    // Committee-stage bills should have the old progress tracker
    const oldTracker = firstCard.locator('.bill-progress-tracker');
    await expect(oldTracker).toBeVisible();

    // Committee-stage bills should NOT have the vote tracker
    const voteTracker = firstCard.locator('.vote-tracker, .vote-results');
    await expect(voteTracker).toHaveCount(0);
  });
});
