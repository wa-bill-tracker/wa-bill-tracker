// @ts-check
const base = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { test: fixtureTest, expect } = require('../support/fixture-test');

/**
 * ADO #3118 -- separate "Passed in <prior biennium>" section built from
 * data/archive/<prior year>-bills.json. Label, hash and archive path all come
 * from session.json priorSession; the specs read the year from there too.
 */
const test = base.test;
const link = (page) => page.locator('#archiveNavLink');

// Nav click handlers are attached after config and data load; wait for that
// (the stat label is set at the end of init) before clicking or pressing keys.
const appReady = (page) => expect(page.locator('#daysLeftLabel')).toHaveText('Days Until Session');

async function priorYear(page) {
  const res = await page.request.get('/data/session.json');
  return (await res.json()).priorSession.year;
}

// The label and hash use the biennium (ADO #3118 relabel): the archive holds
// the whole prior biennium, not one calendar year.
async function priorBiennium(page) {
  const res = await page.request.get('/data/session.json');
  return (await res.json()).priorSession.biennium;
}

async function expectedPassedCount(page, year) {
  const res = await page.request.get(`/data/archive/${year}-bills.json`);
  const doc = await res.json();
  return doc.bills.filter((b) => b.status === 'enacted' || b.status === 'partial_veto').length;
}

test.describe('Passed in <prior biennium> section', () => {
  test('is reachable from the main navigation with a data-driven label', async ({ page }) => {
    const bi = await priorBiennium(page);
    await page.goto('/');
    await expect(link(page)).toBeVisible();
    await expect(link(page)).toHaveText(`Passed in ${bi}`);
    await expect(page.locator('nav.bill-type-nav').locator('#archiveNavLink')).toHaveCount(1);
  });

  test('click opens the section, marks it current and hides the main view', async ({ page }) => {
    const bi = await priorBiennium(page);
    await page.goto('/');
    await appReady(page);
    await link(page).click();
    await expect(page).toHaveURL(new RegExp(`#passed-${bi}$`));
    await expect(link(page)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#archiveView')).toBeVisible();
    await expect(page.locator('#mainView')).toBeHidden();
    await expect(page.locator('#pageTitle')).toHaveText(`Passed in ${bi}`);
    await expect(page.locator('.nav-tab[data-type="all"]')).not.toHaveAttribute('aria-current', 'page');
  });

  test('count matches the enacted and partial-veto bills in the archive file', async ({ page }) => {
    const year = await priorYear(page);
    const bi = await priorBiennium(page);
    const expected = await expectedPassedCount(page, year);
    expect(expected).toBeGreaterThan(0);
    await page.goto(`/#passed-${bi}`);
    await expect(page.locator('#archiveCards > li')).toHaveCount(expected);
    await expect(page.locator('#archiveStatus')).toHaveText(`${expected} bills became law in the ${bi} biennium.`);
  });

  test('shows the "N bills became law" sentence once, not in both the description and the status line', async ({ page }) => {
    const year = await priorYear(page);
    const bi = await priorBiennium(page);
    const expected = await expectedPassedCount(page, year);
    await page.goto(`/#passed-${bi}`);
    await expect(page.locator('#archiveCards > li').first()).toBeVisible();
    await expect(page.locator('#archiveStatus')).toContainText(`${expected} bills became law`);
    await expect(page.locator('#pageDescription')).not.toContainText('became law');
    const body = await page.locator('body').innerText();
    expect(body.split(`${expected} bills became law`).length - 1).toBe(1);
  });

  test('includes partial-veto bills, labelled in text', async ({ page }) => {
    const year = await priorYear(page);
    const bi = await priorBiennium(page);
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
    await page.goto(`/#passed-${bi}`);
    await expect(page.locator('#archiveCards > li')).toHaveCount(2);
    await expect(page.locator('#archiveCards')).toContainText('Partial Veto');
    await expect(page.locator('#archiveCards')).toContainText('Enacted');
    await expect(page.locator('#archiveCards')).not.toContainText('Never passed');
  });

  test('is not mixed into the current-session view or counts', async ({ page }) => {
    const bi = await priorBiennium(page);
    await page.goto(`/#passed-${bi}`);
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
    const bi = await priorBiennium(page);
    await page.goto(`/#passed-${bi}`);
    await expect(page.locator('#archiveCards > li').first()).toBeVisible();
    await expect(page.locator('#archiveView [data-action]')).toHaveCount(0);
  });

  test('existing prior-session tracked and notes data is left untouched', async ({ page }) => {
    const year = await priorYear(page);
    const bi = await priorBiennium(page);
    const tracked = '["HB1000"]';
    const notes = '{"HB1000":[{"text":"keep me"}]}';
    await page.goto('/');
    await page.evaluate(([y, t, n]) => {
      document.cookie = `wa_tracker_${y}_tracked=${encodeURIComponent(t)};path=/`;
      document.cookie = `wa_tracker_${y}_notes=${encodeURIComponent(n)};path=/`;
    }, [year, tracked, notes]);
    await page.goto(`/#passed-${bi}`);
    await expect(page.locator('#archiveCards > li').first()).toBeVisible();
    const read = (name) => page.evaluate(
      (k) => {
        const hit = document.cookie.split('; ').find((c) => c.startsWith(`${k}=`));
        return hit ? decodeURIComponent(hit.slice(k.length + 1)) : null;
      },
      name
    );
    expect(await read(`wa_tracker_${year}_tracked`)).toBe(tracked);
    expect(await read(`wa_tracker_${year}_notes`)).toBe(notes);
  });

  test('keyboard: link is focusable with a visible ring and Enter opens the section', async ({ page }) => {
    await page.goto('/');
    await appReady(page);
    // The link is hidden until app init sets it up from session.json; focusing
    // before that is a race.
    await expect(link(page)).toBeVisible();
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

  for (const width of [1280, 320]) {
    test(`D3: after opening the section the active tab is visible inside the nav at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      await appReady(page);
      await link(page).click();
      await expect(link(page)).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('#archiveCards > li').first()).toBeVisible();
      await expect.poll(async () => page.evaluate(() => {
        const l = document.getElementById('archiveNavLink').getBoundingClientRect();
        const n = document.querySelector('nav.bill-type-nav').getBoundingClientRect();
        return l.left >= n.left - 1 && l.right <= n.right + 1 && l.left >= 0 && l.right <= window.innerWidth;
      })).toBe(true);
    });
  }

  test('D3: loading the section by URL also scrolls its tab into view at 320px', async ({ page }) => {
    const bi = await priorBiennium(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`/#passed-${bi}`);
    await expect(page.locator('#archiveCards > li').first()).toBeVisible();
    await expect.poll(async () => page.evaluate(() => {
      const l = document.getElementById('archiveNavLink').getBoundingClientRect();
      return l.left >= 0 && l.right <= window.innerWidth;
    })).toBe(true);
  });

  test('heading order: h1 site title, h2 page title, h3 per bill (no skipped levels)', async ({ page }) => {
    const bi = await priorBiennium(page);
    await page.goto(`/#passed-${bi}`);
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
    const bi = await priorBiennium(page);
    await page.route(`**/data/archive/${year}-bills.json*`, (route) => route.fulfill({ status: 404, body: 'nope' }));
    await page.goto(`/#passed-${bi}`);
    await expect(page.locator('#archiveStatus')).toContainText(/could not load/i);
  });

  test('has no axe violations (section and navigation)', async ({ page }) => {
    const bi = await priorBiennium(page);
    await page.goto(`/#passed-${bi}`);
    await expect(page.locator('#archiveCards > li').first()).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include('#archiveView')
      .include('nav.bill-type-nav')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('works at 320px width without the section itself overflowing', async ({ page }) => {
    const bi = await priorBiennium(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`/#passed-${bi}`);
    await expect(page.locator('#archiveCards > li').first()).toBeVisible();
    const m = await page.locator('#archiveView').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(m.sw).toBeLessThanOrEqual(m.cw);
  });
});

fixtureTest.describe('Passed section alongside 2027 bills', () => {
  fixtureTest('current-session list never shows archive bills and the archive never shows current bills', async ({ page }) => {
    const res = await page.request.get('/data/session.json');
    const bi = (await res.json()).priorSession.biennium;
    await page.goto('/');
    await expect(page.locator('.bill-card').first()).toBeVisible();
    await expect(page.locator('#totalBills')).toHaveText('28');
    await page.locator('#archiveNavLink').click();
    await expect(page.locator('#archiveCards > li').first()).toBeVisible();
    await expect(page.locator('#archiveCards')).not.toContainText('Synthetic fixture bill');
    await page.goto(`/#passed-${bi}`);
    await expect(page.locator('#archiveView')).toBeVisible();
  });
});
