# Brief: #3118 relabel to the biennium, plus QA findings on branch feature/ado-3117-3118-banner-2026-section

- **Date:** 2026-11-18
- **Agent:** c6s-appdev-fstack
- **Branch:** `feature/ado-3117-3118-banner-2026-section` (currently at `7d5aa65`; continue on it, don't create a new one)
- **QA report:** `docs/status/agentdocs/2026-11-17-verify-3117-3118-report.md`

## Owner decision (D2)
The archive (`data/archive/2026-bills.json`) tags all 450 enacted bills `session:"2025"`, because of the old
year-comparison bug (#3074). Roughly 264 of them are 2025-session laws and about 186 are 2026-session laws. The owner chose
**relabel to the biennium**. The tab/section becomes **"Passed in 2025-26"** and keeps all 450. Derive the label from
`session.json` `priorSession.biennium`, with no hardcoded years. Update the heading, the nav link text, the page description,
the hash/route if it embeds the year, the README, and all tests and specs (including QA's
`playwright/tests/verify-3117-3118-independent.spec.js`, where only label/route expectations may change and
assertions must not be weakened). Do NOT change archive data.

## Also fix (QA findings in this feature)
- **D1, webkit:** 2 banner specs fail in webkit. (a) WebKit excludes buttons from Tab order by default, so use
  `Alt+Tab` on webkit or focus the button directly where Tab order isn't the thing under test. (b) `CookieManager.set`
  writes `Secure` cookies, which WebKit rejects on http://localhost, so banner dismissal never persists in tests.
  Fix the dismissal persistence robustly: e.g. also store the flag in localStorage under the same session-year key,
  read either. Do not remove `Secure` from CookieManager.
- **D3:** the "Passed in 2025-26" tab is off-screen in the horizontally scrolling nav at 1280 and 320, and its
  active state isn't visible. Make it visible, e.g. scroll the active tab into view and/or reorder. Keep keyboard
  order logical.
- **D4:** the "450 bills became law..." sentence renders twice (`#pageDescription` and the role=status line). Show it once
  and keep a single accessible announcement.
- **Weak test:** strengthen the "existing prior-session tracked and notes data is left untouched" spec to assert exact
  values, not just existence.

## Process
- TDD: red first for each fix. Run Python (`uv run --no-project --with requests --with pytest pytest tests -q`)
  and Playwright in **chromium, firefox and webkit**. All green, no new skips. Baseline: Python 205/12; Playwright
  chromium 70/11, firefox 70/11, webkit 68/11 with 2 failures (the D1 failures).
- Commit locally on the branch, one commit referencing `ADO #3118` (D2/D3/D4) and one for the D1 banner fix
  referencing `ADO #3117`. No push, no PR, no GitHub issues, no workflow changes.
- Restore tracked `scripts/__pycache__` afterward. Leave untracked `docs/status/` files alone.

## Deliverable
Return: commit SHAs, what changed, per-browser and Python results, and any deviations.
