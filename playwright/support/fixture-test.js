// @ts-check
/**
 * Playwright test base that serves a synthetic 2027-28 bills dataset in place
 * of data/bills.json (ADO #3118).
 *
 * Why: data/bills.json still holds the 2025-26 dataset until the first 2027
 * fetch. The app now (correctly) shows zero bills for it, so specs that need
 * bill cards to interact with run against this fixture instead. The fixture
 * also contains three stale 2025-26 bills (HB9901, SB9902, HB9903) so every
 * spec using it additionally proves they are never rendered.
 */
const base = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BILLS_FIXTURE = fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'bills-2027-28-mixed.json'),
  'utf8'
);

const STALE_IDS = ['HB9901', 'SB9902', 'HB9903'];

const test = base.test.extend({
  page: async ({ page }, use) => {
    await page.route('**/data/bills.json*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: BILLS_FIXTURE })
    );
    await use(page);
  },
});

module.exports = { test, expect: base.expect, BILLS_FIXTURE, STALE_IDS };
