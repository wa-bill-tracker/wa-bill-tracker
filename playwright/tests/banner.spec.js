// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

/**
 * ADO #3117 -- development banner.
 * Off-switch: "developmentBanner" in data/session.json.
 */

const COPY =
  "We're upgrading WA Bill Tracker. A new version with deeper bill, legislator and law (RCW) " +
  'context launches before the 2027 session begins January 11. This site stays fully available until then.';

const banner = (page) => page.locator('#devBanner');
const dismiss = (page) => page.locator('#devBannerDismiss');

test.describe('Development banner (ADO #3117)', () => {
  test('shows the owner-approved copy, verbatim', async ({ page }) => {
    await page.goto('/');
    await expect(banner(page)).toBeVisible();
    const text = (await banner(page).locator('.dev-banner-text').innerText()).replace(/\s+/g, ' ').trim();
    expect(text).toBe(COPY);
  });

  test('is a named region placed before the header, and is not an alert', async ({ page }) => {
    await page.goto('/');
    await expect(banner(page)).toHaveAttribute('aria-label', /.+/);
    await expect(banner(page)).not.toHaveAttribute('role', 'alert');
    const before = await page.evaluate(() => {
      const b = document.getElementById('devBanner');
      const h = document.querySelector('header');
      return !!(b && h && (b.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    expect(before).toBe(true);
  });

  test('has no axe violations', async ({ page }) => {
    await page.goto('/');
    await expect(banner(page)).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include('#devBanner')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('stays at the top of every view (main, stats detail, passed section)', async ({ page }) => {
    await page.goto('/');
    await expect(banner(page)).toBeVisible();
    await page.locator('#daysLeft').click();
    await expect(page.locator('#statsView')).toHaveClass(/active/);
    await expect(banner(page)).toBeVisible();
    await page.goto('/#passed-2026');
    await expect(banner(page)).toBeVisible();
  });

  test('dismiss button is labelled, at least 24x24 and has a visible focus ring', async ({ page }) => {
    await page.goto('/');
    const btn = dismiss(page);
    await expect(btn).toHaveAttribute('aria-label', /dismiss/i);
    expect(await btn.evaluate((el) => el.tagName)).toBe('BUTTON');
    const box = await btn.boundingBox();
    expect(box && box.width).toBeGreaterThanOrEqual(24);
    expect(box && box.height).toBeGreaterThanOrEqual(24);
    await btn.focus();
    const outline = await btn.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  test('keyboard: Tab reaches dismiss first, Enter dismisses, focus moves to the page title', async ({ page }) => {
    await page.goto('/');
    await expect(banner(page)).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(dismiss(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(banner(page)).toBeHidden();
    await expect(page.locator('#siteTitle')).toBeFocused();
  });

  test('mouse dismiss persists across reload under a session-year key', async ({ page }) => {
    await page.goto('/');
    await dismiss(page).click();
    await expect(banner(page)).toBeHidden();
    await page.reload();
    await expect(page.locator('#siteTitle')).toBeVisible();
    await expect(banner(page)).toBeHidden();
    const cookie = await page.evaluate(() => document.cookie);
    expect(cookie).toMatch(/wa_tracker_\d{4}_dev_banner_dismissed/);
  });

  test('off-switch: developmentBanner=false in session.json hides it', async ({ page }) => {
    await page.route('**/data/session.json*', async (route) => {
      const res = await route.fetch();
      const json = await res.json();
      json.developmentBanner = false;
      await route.fulfill({ response: res, json });
    });
    await page.goto('/');
    // The banner is hidden by default, so wait for app init to finish (stat
    // label is set after config and data load) before asserting it stayed hidden.
    await expect(page.locator('#daysLeftLabel')).toHaveText('Days Until Session');
    await expect(banner(page)).toBeHidden();
  });

  test('no animation when prefers-reduced-motion is set', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const anim = await banner(page).evaluate((el) => {
      const s = getComputedStyle(el);
      return { name: s.animationName, transition: s.transitionDuration };
    });
    expect(anim.name).toBe('none');
    expect(anim.transition.split(',').every((d) => parseFloat(d) === 0)).toBe(true);
  });

  // Scoped to the banner: the search box (min-width 300px) already overflows
  // the 320px document independently of this change (filed as a follow-up).
  for (const width of [320, 1280]) {
    test(`banner does not overflow horizontally at ${width}px width`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      await expect(banner(page)).toBeVisible();
      const m = await banner(page).evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
      expect(m.sw).toBeLessThanOrEqual(m.cw);
      const box = await banner(page).boundingBox();
      expect(box && box.x + box.width).toBeLessThanOrEqual(width);
    });
  }
});
