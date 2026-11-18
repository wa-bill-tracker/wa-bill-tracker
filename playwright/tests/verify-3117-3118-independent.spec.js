// @ts-check
/**
 * QTEST independent verification of ADO #3117 / #3118.
 * Not written by the developer. Covers: stale vs simulated-2027 bills.json,
 * 2026 user data preservation, viewport screenshots, keyboard/contrast checks.
 * Screenshots go to /tmp/qtest-shots/.
 */
const base = require('@playwright/test');
const { test: fixtureTest, expect, BILLS_FIXTURE, STALE_IDS } = require('../support/fixture-test');
const fs = require('fs');
const path = require('path');

const SHOTS = '/tmp/qtest-shots';
fs.mkdirSync(SHOTS, { recursive: true });

const test = base.test;
const ready = (page) => expect(page.locator('#daysLeftLabel')).toHaveText('Days Until Session');

// Pure 2027-28 dataset (what bills.json looks like after the Dec 7 fetch), no stale bills.
const pure2027 = JSON.stringify({
  ...JSON.parse(BILLS_FIXTURE),
  bills: JSON.parse(BILLS_FIXTURE).bills.filter((b) => b.biennium === '2027-28'),
});
const onlyStale = JSON.stringify({
  ...JSON.parse(BILLS_FIXTURE),
  bills: JSON.parse(BILLS_FIXTURE).bills.filter((b) => b.biennium !== '2027-28'),
});

test.describe('zero 2025-26 bills in 2027 views', () => {
  test('real stale bills.json (3757 bills, all 2025-26): zero cards, zero counts, all nav types', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await expect(page.locator('.bill-card')).toHaveCount(0);
    for (const hash of ['all', 'hb', 'sb', 'hjm', 'scr']) {
      await page.goto(`/#${hash}`);
      await ready(page);
      await expect(page.locator('.bill-card')).toHaveCount(0);
    }
    await expect(page.locator('#totalBills')).toHaveText('0');
    // Stale cache in localStorage too (fetch fails -> cache path), using the real data file.
    const real = await (await page.request.get('/data/bills.json')).text();
    await page.route('**/data/bills.json*', (r) => r.abort());
    await page.addInitScript((c) => localStorage.setItem('billsData', c), real);
    await page.goto('/');
    await ready(page);
    await expect(page.locator('.bill-card')).toHaveCount(0);
    await expect(page.locator('#totalBills')).toHaveText('0');
  });

  test('simulated post-fetch 2027-28 bills.json: 28 cards, none stale', async ({ page }) => {
    await page.route('**/data/bills.json*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: pure2027 })
    );
    await page.goto('/');
    await expect(page.locator('.bill-card').first()).toBeVisible();
    await expect(page.locator('#totalBills')).toHaveText('28');
    await expect(page.locator('#emptyState')).toHaveCount(0);
    const text = await page.locator('#billsGrid').innerText();
    expect(text).not.toMatch(/2025-26|2025 Session|2026 Session/);
  });

  test('bills.json containing ONLY stale bills behaves as the empty state', async ({ page }) => {
    await page.route('**/data/bills.json*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: onlyStale })
    );
    await page.goto('/');
    await ready(page);
    await expect(page.locator('#emptyState')).toBeVisible();
    await expect(page.locator('.bill-card')).toHaveCount(0);
  });
});

test.describe('users 2026 data preserved', () => {
  test('2026 cookies/localStorage and stale-bill notes in 2027 namespace survive load, archive visit and banner dismiss', async ({ page, browserName }) => {
    await page.goto('/');
    await ready(page);
    const seed = await page.evaluate(() => {
      const tracked = encodeURIComponent('["HB1003"]');
      const notes = encodeURIComponent('{"HB1003":[{"text":"my 2026 note"}]}');
      document.cookie = `wa_tracker_2026_tracked=${tracked};path=/`;
      document.cookie = `wa_tracker_2026_notes=${notes};path=/`;
      localStorage.setItem('wa_tracker_2026_state', JSON.stringify({ tracked: ['HB1003'], notes: { HB1003: [{ text: 'my 2026 note' }] } }));
      document.cookie = `wa_tracker_2027_tracked=${encodeURIComponent('["HB9901"]')};path=/`;
      document.cookie = `wa_tracker_2027_notes=${encodeURIComponent('{"HB9901":[{"text":"stale note"}]}')};path=/`;
      return localStorage.getItem('wa_tracker_2026_state');
    });
    await page.goto('/#passed-2026');
    await expect(page.locator('#archiveCards > li').first()).toBeVisible();
    await page.locator('#devBannerDismiss').click();
    await page.goto('/');
    await ready(page);
    const after = await page.evaluate(() => ({
      c: document.cookie,
      ls: localStorage.getItem('wa_tracker_2026_state'),
    }));
    expect(after.c).toContain('wa_tracker_2026_tracked=' + encodeURIComponent('["HB1003"]'));
    expect(after.c).toContain('wa_tracker_2026_notes=' + encodeURIComponent('{"HB1003":[{"text":"my 2026 note"}]}'));
    expect(after.ls).toBe(seed);
    // A note on a bill that is no longer displayed must not be deleted from the 2027 namespace.
    // WebKit drops 2027-namespace cookies over http://localhost (Secure cookies, pre-existing
    // CookieManager), so this line is skipped there only.
    if (browserName !== 'webkit') expect(decodeURIComponent(after.c)).toContain('stale note');
  });
});

test.describe('no hardcoded years in JS', () => {
  test('no year literals in js/ code (comments excluded)', async () => {
    const dir = path.join(__dirname, '..', '..', 'js');
    const hits = [];
    for (const f of fs.readdirSync(dir)) {
      fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
        if (/\b20[0-9]{2}\b/.test(code) && !/maxLength = 2000/.test(code)) hits.push(`${f}:${i + 1}:${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });
});

test.describe('screenshots and keyboard/a11y spot checks', () => {
  const sizes = [[1280, 900], [320, 800]];
  // The site has no dark theme (no prefers-color-scheme or data-theme rules); both
  // schemes are captured so a regression would show.
  for (const [w, h] of sizes) {
    for (const scheme of ['light', 'dark']) {
      test(`shots ${w}px ${scheme}`, async ({ page, browserName }) => {
        await page.setViewportSize({ width: w, height: h });
        await page.emulateMedia({ colorScheme: /** @type {any} */ (scheme) });
        await page.goto('/');
        await ready(page);
        await page.screenshot({ path: `${SHOTS}/${browserName}-${w}-${scheme}-banner-empty.png` });
        await page.goto('/#passed-2026');
        await expect(page.locator('#archiveCards > li').first()).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/${browserName}-${w}-${scheme}-passed2026.png` });
      });
    }
  }

  test('tab order: banner dismiss is first focusable; active nav-tab contrast >= 4.5', async ({ page, browserName }) => {
    await page.goto('/');
    await ready(page);
    // Default Safari/WebKit leaves buttons out of the Tab order (needs Alt+Tab).
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    await expect(page.locator('#devBannerDismiss')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.locator('#devBanner')).toBeHidden();
    const ratio = await page.evaluate(() => {
      const el = document.querySelector('.nav-tab.active');
      const s = getComputedStyle(el);
      const p = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
      const L = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const a = L(p(s.color)), b = L(p(s.backgroundColor));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('archive view: exactly one aria-current, banner stays dismissed', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await page.locator('#devBannerDismiss').click();
    await page.goto('/#passed-2026');
    await expect(page.locator('#archiveNavLink')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[aria-current="page"]')).toHaveCount(1);
  });

  test('developmentBanner:false removes banner and nothing else changes', async ({ page }) => {
    await page.route('**/data/session.json*', async (route) => {
      const res = await route.fetch();
      const json = await res.json();
      json.developmentBanner = false;
      await route.fulfill({ response: res, json });
    });
    await page.goto('/');
    await ready(page);
    await expect(page.locator('#devBanner')).toBeHidden();
    await expect(page.locator('#emptyState')).toBeVisible();
    await expect(page.locator('#archiveNavLink')).toBeVisible();
  });
});

fixtureTest('fixture-backed list screenshot (stale bills never rendered)', async ({ page, browserName }) => {
  await page.goto('/');
  await expect(page.locator('.bill-card').first()).toBeVisible();
  for (const id of STALE_IDS) await expect(page.locator(`[data-bill-id="${id}"]`)).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/${browserName}-fixture-list.png` });
});
