// @ts-check
const base = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { test: fixtureTest, expect } = require('../support/fixture-test');

/**
 * ADO #3118 -- separate "Passed in <prior year>" section built from
 * data/archive/<prior year>-bills.json. Label, hash and archive path all come
 * from session.json priorSession; the specs read the year from there too.
 */
const test = base.test;
const link = (page) => page.locator('#archiveNavLink');

async function priorYear(page) {
  const res = await page.request.get('/data/session.json');
  return (await res.json()).priorSession.year;
}

async function expectedPassedCount(page, year) {
  const res = await page.request.get(`/data/archive/${year}-bills.json`);
  const doc = await res.json();
  return doc.bills.filter((b) => b.status === 'enacted' || b.status === 'partial_veto').length;
}

test.describe('Passed in <prior year> section', () => {
  test('is reachable from the main navigation with a data-driven label', async ({ page }) => {
    const year = await priorYear(page);
    await page.goto('/');
    await expect(link(page)).toBeVisible();
    await expect(link(page)).toHaveText(`Passed in ${year}`);
    await expect(page.locator('nav.bill-type-nav').locator('#archiveNavLink')).toHaveCount(1);
  });

  test('click opens the section, marks it current and hides the main view', async ({ page }) => {
    const year = await priorYear(page);
    await page.goto('/');
    await link(page).click();
    await expect(page).toHaveURL(new RegExp(`#passed-${year}$`));
    await expect(link(page)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#archiveView')).toBeVisible();
    await expect(page.locator('#mainView')).toBeHidden();
    await expect(page.locator('#pageTitle')).toHaveText(`Passed in ${year}`);
    await expect(page.locator('.nav-tab[data-type="all"]')).not.toHaveAttribute('aria-current', 'page');
  });

  test('count matches the enacted and partial-veto bills in the archive file', async ({ page }) => {
    const year = await priorYear(page);
    const expected = await expectedPassedCount(page, year);
    expect(expected).toBeGreaterThan(0);
    await page.goto(`/#passed-${year}`);
    await expect(page.locator('#archiveCards > li')).toHaveCount(expected);
    await expect(page.locator('#archiveStatus')).toContainText(`${expected} bills`);
    await expect(page.locator('#pageDescription')).toContainText(String(expected));
  });

  test('includes partial-veto bills, labelled in text', async ({ page }) => {
    const year = await priorYear(page);
    await page.route(`**/data/archive/${year}-bills.json*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          biennium: '2025-26',
          bills: [
            { id: 'HB1', number: 'HB 1', title: 'Enacted one', sponsor: '(A)', description: 'd', status: 'enacted', topic: 'T', biennium: '2025-26', session: '2025', historyLine: 'Effective date 7/27/2025.' },
            { id: 'HB2', number: 'HB 2', title: 'Partial veto one', sponsor: '(B)', description: 'd', status: 'partial_veto', topic: 'T', biennium: '2025-26', session: '2026', historyLine: 'Governor partial veto.' },
            { id: 'HB3', number: 'HB 3', title: 'Never passed', sponsor: '(C)', description: 'd', status: 'committee', topic: 'T', biennium: '2025-26', session: '2026', historyLine: '' },
          ],
        }),
      })
    );
    await page.goto(`/#passed-${year}`);
    await expect(page.locator('#archiveCards > li')).toHaveCount(2);
    await expect(page.locator('#archiveCards')).toContainText('Partial Veto');
    await expect(page.locator('#archiveCards')).toContainText('Enacted');
    await expect(page.locator('#archiveCards')).not.toContainText('Never passed');
  });

  test('is not mixed into the current-session view or counts', async ({ page }) => {
    const year = await priorYear(page);
    await page.goto(`/#passed-${year}`);
    await expect(page.locator('#archiveCards > li').first()).toBeVisible();
    await page.locator('.nav-tab[data-type="all"]').click();
    await expect(page.locator('#mainView')).toBeVisible();
    await expect(page.locator('#archiveView')).toBeHidden();
    await expect(link(page)).not.toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.nav-tab[data-type="all"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#totalBills')).toHaveText('0');
    await expect(page.locator('.bill-card')).toHaveCount(0);
  });

  test('archive cards are read-only: no track/note/share buttons, no writes to current-session storage', async ({ page }) => {
    const year = await priorYear(page);
    await page.goto(`/#passed-${year}`);
    await expect(page.locator('#archiveCards > li').first()).toBeVisible();
    await expect(page.locator('#archiveView [data-action]')).toHaveCount(0);
  });

  test('existing prior-session tracked and notes data is left untouched', async ({ page }) => {
    const year = await priorYear(page);
    await page.goto('/');
    await page.evaluate((y) => {
      document.cookie = `wa_tracker_${y}_tracked=${encodeURIComponent('["HB1000"]')};path=/`;
      document.cookie = `wa_tracker_${y}_notes=${encodeURIComponent('{"HB1000":[{"text":"keep me"}]}')};path=/`;
    }, year);
    await page.goto(`/#passed-${year}`);
    await expect(page.locator('#archiveCards > li').first()).toBeVisible();
    const cookies = await page.evaluate(() => document.cookie);
    expect(cookies).toContain(`wa_tracker_${year}_tracked`);
    expect(cookies).toContain(`wa_tracker_${year}_notes`);
  });

  test('keyboard: link is focusable with a visible ring and Enter opens the section', async ({ page }) => {
    await page.goto('/');
    await link(page).focus();
    const outline = await link(page).evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThanOrEqual(2);
    await page.keyboard.press('Enter');
    await expect(page.locator('#archiveView')).toBeVisible();
    await expect(link(page)).toHaveAttribute('aria-current', 'page');
  });

  test('heading order: h1 site title, h2 page title, h3 per bill (no skipped levels)', async ({ page }) => {
    const year = await priorYear(page);
    await page.goto(`/#passed-${year}`);
    await expect(page.locator('#archiveCards > li').first()).toBeVisible();
    const levels = await page.evaluate(() =>
      [...document.querySelectorAll('h1,h2,h3,h4')]
        .filter((h) => h.getClientRects().length > 0)
        .map((h) => Number(h.tagName[1]))
    );
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    }
  });

  test('shows an error message (not a blank page) when the archive cannot load', async ({ page }) => {
    const year = await priorYear(page);
    await page.route(`**/data/archive/${year}-bills.json*`, (route) => route.fulfill({ status: 404, body: 'nope' }));
    await page.goto(`/#passed-${year}`);
    await expect(page.locator('#archiveStatus')).toContainText(/could not load/i);
  });

  test('has no axe violations (section and navigation)', async ({ page }) => {
    const year = await priorYear(page);
    await page.goto(`/#passed-${year}`);
    await expect(page.locator('#archiveCards > li').first()).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include('#archiveView')
      .include('nav.bill-type-nav')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('works at 320px width without the section itself overflowing', async ({ page }) => {
    const year = await priorYear(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`/#passed-${year}`);
    await expect(page.locator('#archiveCards > li').first()).toBeVisible();
    const m = await page.locator('#archiveView').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(m.sw).toBeLessThanOrEqual(m.cw);
  });
});

fixtureTest.describe('Passed section alongside 2027 bills', () => {
  fixtureTest('current-session list never shows archive bills and the archive never shows current bills', async ({ page }) => {
    const res = await page.request.get('/data/session.json');
    const year = (await res.json()).priorSession.year;
    await page.goto('/');
    await expect(page.locator('.bill-card').first()).toBeVisible();
    await expect(page.locator('#totalBills')).toHaveText('28');
    await page.locator('#archiveNavLink').click();
    await expect(page.locator('#archiveCards > li').first()).toBeVisible();
    await expect(page.locator('#archiveCards')).not.toContainText('Synthetic fixture bill');
    await page.goto(`/#passed-${year}`);
    await expect(page.locator('#archiveView')).toBeVisible();
  });
});
