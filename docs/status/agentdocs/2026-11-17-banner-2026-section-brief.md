# Brief: ADO #3117 (dev banner) and ADO #3118 (2026 bills out of 2027 views + "Passed in 2026" section)

- **Date:** 2026-11-17
- **Agent:** c6s-appdev-fstack
- **Repo:** ~/Local/github/wa-bill-tracker (public, GitHub Pages; work items in ADO civic-tech, parent Feature #3076)

## Context
- The live site is configured for 2027 (`data/session.json`: year 2027, biennium 2027-28, priorSession
  {year 2026, biennium 2025-26}). But `data/bills.json` still holds the **2025-26 dataset (3,757 bills)**,
  so the 2027 site lists 2026 bills as if they were current. The 2026 archive is at
  `data/archive/2026-bills.json`.
- The "Fetch Bill Data" workflow is paused. 2027 prefiling opens 2026-12-07. The first full fetch
  (`scripts/fetch_all_bills.py`) will replace `data/bills.json` with 2027-28 data.
- Existing prior-session logic in the UI keys off `bill.session === priorSession.year`
  (`js/data.js:164,208`; `js/render.js:129,241,288,492-540,718,888`).
- The future plan (ADR-005) has pro serve this same classic UI from a pro-generated `data/` feed. Keep the
  design data-driven (session.json and the feed files), with no hardcoded years.

## ADO #3117: development banner
Exact copy (owner-approved, do not alter wording):
> **We're upgrading WA Bill Tracker.** A new version with deeper bill, legislator and law (RCW) context launches before the 2027 session begins January 11. This site stays fully available until then.

Acceptance:
- Shows at the top of every view and is placed in the DOM before the main content. Use semantic markup (a `<section>`/`<aside>` with an
  accessible name, or `role="region"` + `aria-label`). Do NOT use `role="alert"`. Do not rely on color alone.
- Dismissible by keyboard and mouse with a real `<button>` that has an accessible label, a visible focus ring, and a 24x24 minimum target.
  Dismissal persists via the existing CookieManager/storage pattern under a session-year key (see the
  `cutoff_banner_dismissed` handling in `js/app.js:381-400` for the pattern). Focus moves sensibly after dismissing.
- WCAG AA contrast in light and dark/high-contrast. Respect `prefers-reduced-motion` (no animation if set).
  It works at 200% zoom and narrow widths without horizontal scroll.
- Easy to remove at cutover: one flag or config value (e.g. in `session.json` or a constant). Document where.

## ADO #3118: no 2025-26 bills in 2027 views; separate "Passed in 2026" section
Acceptance:
- The 2027 views (lists, filters, counts, stats, cutoff/"failed" logic, vote tracker, tracked counts) contain
  **zero 2025-26 bills**, both now with the stale bills.json and after the 2027 fetch replaces it. Prefer a robust
  filter by bill biennium vs `session.json` biennium over hand-editing data. If you change `data/bills.json`,
  explain why and make sure `scripts/validate_bills_json.py` and the fetch pipeline still work.
- Until 2027-28 bills exist, the 2027 view shows a clear empty state that says prefiling opens Monday, December 7, 2026 and
  the session convenes January 11, 2027. Derive the text from session.json where reasonable.
- A separate, clearly labeled **"Passed in 2026"** section, reachable from the main navigation, built from
  `data/archive/2026-bills.json`. It shows the enacted bills (including partial veto) with a correct count. It is not mixed into
  2027 filters, counts or cutoff logic. Users' existing tracked/notes data for 2026 bills must not be deleted.
- Accessibility: semantic headings in order, keyboard operable, visible focus, the active section announced
  (e.g. `aria-current`), and no color-only status.

## Process
- `git fetch origin`. Create branch `feature/ado-3117-3118-banner-2026-section` from `origin/main` (PRs #83/#84
  are merged there). Do not touch other branches.
- TDD: Python tests under `tests/` where it fits (e.g. data/session config assertions), and Playwright
  specs under `playwright/tests/` for the UI (run from `playwright/`; config `cwd: '..'`, baseURL
  localhost:4200). Add axe-core checks (`@axe-core/playwright` is already a devDependency) for the banner and
  the new section. Red first, then green.
- Full Python suite: `uv run --no-project --with requests --with pytest pytest tests -q` (main baseline
  after the #83/#84 merges: expect about 189 passed / 13 skipped. Record the actual baseline first). Run the Playwright suite too.
  No suppressed or skipped tests to get green. Afterward restore tracked bytecode with `git checkout -- scripts/__pycache__`.
- One commit per work item, with messages referencing `ADO #3117` / `ADO #3118`. **Commit locally only: no push, no PR,
  no GitHub issues, no workflow changes, no live fetches.**

## Deliverable
Return: the branch, commit SHAs, files changed, the tests added (Python and Playwright, including axe), the suite results
(before and after), screenshots or descriptions of the banner and the new section, where the banner off-switch lives, and any deviations
or follow-ups. Leave the working tree clean.

## No-collision
No other agent is working in this repo. Untracked files in `docs/status/agentdocs/` belong to the main session. Leave them.
