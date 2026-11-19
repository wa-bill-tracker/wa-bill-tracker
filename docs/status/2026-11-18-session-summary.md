# Session summary: 2026-11-18

This continues `2026-11-17-session-summary.md`, which has the full background: the prefiling research,
fixes #3073 and #3074, the 2027 cutoff calendar, the Dec 7 routine, and the VPS plan.

## Done this session

| Item | Result |
|---|---|
| PR #85: dev banner (#3117) and 2025-26 separation (#3118) | **Merged** at `e3e7293`. GitHub Pages built at 2026-11-19 04:24 UTC |
| Live-site check (Playwright, Chromium, https://wa-bill-tracker.org) | PASS. Details below |
| QA follow-ups filed in ADO civic-tech | **#3119-#3133** (15 items). List below |

### Live-site check results (2026-11-18)

- **Banner:** the approved text shows. It is a `<section>` named "Site upgrade notice", and the dismiss button
  is labeled "Dismiss site upgrade notice". After dismissing and reloading, it stays hidden.
- **2027 views:** all show 0 bills and "No 2027 bills yet", with the prefiling date (Dec 7), the convening
  date (Jan 11), and a link to the archive.
- **"Passed in 2025-26" tab:** opens at `#passed-2025-26`, has `aria-current="page"`, and shows all 450 bills.
- **Cutoff strip:** "Policy Committee (Origin) -- Feb 19". The page shows 53 days until the session.
- **Console:** 3 Content Security Policy (CSP) errors. Cloudflare injects an inline challenge script, and the
  site's `script-src 'self'` policy blocks it. This was already happening and is not app code (#3133).
- **"Last sync: 99 days ago":** accurate. `bills.json` was last updated 2026-08-11, and fetching is paused
  until #3098.

## Follow-ups filed (civic-tech)

| ID | Type | Item |
|---|---|---|
| #3119 | Bug P2 | The Tier 2 stale-refresh error limit exits 0 (Related: #3098) |
| #3120 | Bug P3 | The error counter keeps a running total but is logged as "consecutive" (Related: #3098) |
| #3121 | Bug P3 | `"priorSession": null` crashes the fetch scripts (Related: #3098) |
| #3122 | Bug P2 | `fetch-data.yml` has no concurrency group and does not rebase before push (Related: #3098) |
| #3123 | Bug P2 | `sessionStart` is parsed as UTC, so the session counts as "started" at 4 PM PT on Jan 10 |
| #3124 | Bug P3 | The cutoff explainer dismissal never persists (number compared to string) |
| #3125 | Bug, a11y (Critical) | The search label overlaps its placeholder |
| #3126 | Bug, a11y (Critical) | The search box overflows at 320px (WCAG 1.4.10) |
| #3127 | Bug, a11y (Critical) | The Guest panel obscures the empty state |
| #3128 | Story P3 | The "Passed in 2025-26" tab is off-screen on first load (Related: #3118) |
| #3129 | Task P2 | **Owner:** real-Safari banner dismissal and a VoiceOver check (Related: #3117) |
| #3130 | Task P3 | Investigate possible Firefox Playwright flakes |
| #3131 | Task P2 | Re-verify the governor/enacted/vote specs against real 2027 data |
| #3132 | Bug P2 | Archive statuses are unreliable: 2,260 "prefiled", and session tags are wrong (Related: #3076) |
| #3133 | Task P4 | **Owner:** Cloudflare-injected inline scripts are blocked by the CSP |

## Open items / next steps

1. **Before re-enabling "Fetch Bill Data" (#3098), land #3119 and #3122.** Otherwise a Tier 2 outage stays
   green, and two overlapping runs can collide on push. #3120 and #3121 are cheap to include in the same change.
2. **Dec 7, 2026, 3 PM PT:** routine `trig_01A7mNaPPa3Thehmu3JM6RTY` emails the probe and dry-run result.
   Then follow the #3098 checklist in `agentdocs/2026-11-17-2027-fetch-readiness-report.md`.
3. **Owner:**
   - #3129: Safari and VoiceOver check.
   - #3133: Cloudflare setting.
   - #3077 / #3078: VPS critical path.
   - Confirm the DNS provider.
4. wa-bill-tracker-pro PR **!535** (plan docs and ADRs) is still **active**. The owner completes it.
5. Accessibility bugs #3125-#3127 are severity-critical. Schedule them ahead of cosmetic work.
6. The carried-over items from the 2026-11-17 summary still stand:
   - `/c6s-grill` on ADR-005 and ADR-002.
   - The `005_roles` typo in the pro report.
   - `npx gitnexus analyze`.
   - Re-check the cutoffs once both chambers adopt the calendar.

## Repo state at session end

- `main` is at `e3e7293` (PR #85 merged). The feature branch `feature/ado-3117-3118-banner-2026-section` is
  merged and can be deleted.
- This file is committed on `docs/2026-11-18-status`. The owner pushes and opens the PR.
- Memory updated: `wa-tracker-2027-switchover-state` (follow-up IDs, and the order to land fixes before re-enabling the fetch).
