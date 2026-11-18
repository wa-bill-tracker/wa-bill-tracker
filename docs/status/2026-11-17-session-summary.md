# Session summary: 2026-11-17

Topic: when 2027 legislation starts dropping, fetch pipeline readiness, the 2027 cutoff calendar,
and the plan to move wa-bill-tracker.org onto wa-bill-tracker-pro on a VPS.

## Key facts established (primary sources; see agentdocs reports)

- **2027 prefiling opens Monday 2026-12-07** (House Rule 10: the first Monday in December). As of
  2026-11-17 no 2027-28 bills were filed. The prefiled page, `GetPreFiledLegislationInfo`, and
  `GetLegislationIntroducedSince` all returned empty.
- The session convenes 2027-01-11. **Sine die is 2027-04-25** (confirmed. The "Apr 26" figure was wrong).
- A draft 2027 cutoff calendar is published on leg.wa.gov. It is **tentative** until both chambers adopt it.
- Historical House prefile counts: 2025 had 18 in week 1 and 166 by Jan 6. 2023 had 27 in week 1.
  Day 1 of 2025 saw 493 bills introduced.
- Prefiled bills carry the first session day as `IntroducedDate` in WSL, not the December filing date.

## Done this session

| Item | Result |
|---|---|
| Prefiling research (c6s-osint-recon) | `agentdocs/2026-11-17-2027-prefiling-research-report.md` |
| Fetch readiness assessment (c6s-data-dataeng) | `agentdocs/2026-11-17-2027-fetch-readiness-report.md`. Found 2 P1 bugs |
| Filed ADO #3073, #3074 (civic-tech, Bug P1) | Incremental fetch pulled prior-biennium bills and aborted with exit 0. Same-biennium check compared years |
| Fixed #3073/#3074 (c6s-appdev-fstack), verified (c6s-appdev-qtest: SHIP WITH FOLLOW-UPS) | **PR #83 merged.** Suite 185 passed / 13 skipped. The mutation check confirmed the tests are load-bearing |
| 2027 draft cutoffs in `data/session.json` + `Test2027CutoffCalendar` | **PR #84 merged** (deploys the tentative dates to the live site) |
| Cloud routine `trig_01A7mNaPPa3Thehmu3JM6RTY` | One-time 2026-12-07 23:00 UTC (3 PM PT). Probes the API, dry-runs the full fetch in a scratch copy, and emails the owner. Read-only, no pushes |
| Old Dec 1 routine `trig_01Fn5iru2mCDGcUmxVUFzKwW` | **Disabled.** Its work was done, and it opened GitHub issues (against org rules) |
| Pro/VPS architecture (c6s-appdev-sol-arch), revised per owner | See wa-bill-tracker-pro below |
| Filed 43 new ADO items + linked #2698, #2759 | Parent Feature **#3076**. Map in wa-bill-tracker-pro `docs/status/agentdocs/2026-11-17-vps-cutover-ado-map.md` |

## Owner decisions

- **wa-bill-tracker-pro becomes wa-bill-tracker.org**, hosted on a VPS. "Deeper data context" covers all four
  areas: RCW and semantic search, legislators and votes, PDC money and lobbying, and bill text and fiscal notes.
- **Build and test before the 2027 session.** The GitHub Pages site stays up, unchanged, until pro passes
  readiness gates C1-C12. Cutover is gate-based, not calendar-based, with no freeze. (The architect's first draft proposed
  a June 2027 cutover. The owner rejected it.)
- The architect recommends a **separate Linode** (about 8 GB), not the recordsfamily/picpeak box. Proposed, in ADR-001.
- Owner requests added to the plan: **#3117** dev banner (approved copy below) and **#3118** remove
  2025-26 bills from 2027 views, plus a separate "Passed in 2026" section.

Banner copy (approved):
> **We're upgrading WA Bill Tracker.** A new version with deeper bill, legislator and law (RCW) context
> launches before the 2027 session begins January 11. This site stays fully available until then.

## #3117 / #3118 (finished 2026-11-18, on branch `feature/ado-3117-3118-banner-2026-section`)

- Built by fstack (`577ecf9` banner, `e2b2d59` 2026 separation). QA verdict: SHIP WITH FOLLOW-UPS
  (`agentdocs/2026-11-17-verify-3117-3118-report.md`). QA's spec was committed by the main session with owner approval (`7d5aa65`).
- **Owner decision D2:** the archive tags all 450 enacted bills `session:"2025"` (old #3074 bug). They are about
  264 laws from 2025 and 186 from 2026. Relabeled to **"Passed in 2025-26"**, derived from `priorSession.biennium`. All 450 kept.
- Round 2 fixes (`d9ac3f0` #3118, `a304192` #3117):
  - D2 relabel.
  - D3: the archive tab scrolls into view when active.
  - D4: the summary sentence appears once.
  - D1: banner dismissal is also stored in localStorage (WebKit rejects Secure cookies on http://localhost), and the
    webkit specs use Alt+Tab.
  - The preservation spec now asserts exact values.
- Results: Python 207 passed / 12 skipped (re-run by the main session). Playwright 74 passed / 11 skipped in
  chromium, firefox and webkit, three runs each (fstack-reported).
- Banner off-switch: `"developmentBanner": true` in `data/session.json`. Set it to `false` at cutover (#3108).
- Remaining follow-ups (not filed):
  - The archive tab still starts off-screen in the nav on first load.
  - Banner dismissal is unverified in real Safari over https.
  - Possible Firefox timing flakes in other specs.
  - The search box overflows about 21px at 320px.
  - The `sessionStart` UTC parse shows a date a day early in the pre-session view.
  - The `cutoff_banner_dismissed` check compares a number to a string.
  - The floating Guest panel overlaps the empty state.
  - The governor/enacted/vote specs stay skipped until the session opens (re-check against real 2027 data).
  - **The archive status data is unreliable:** 2,260 bills are marked "prefiled" and 1 "passed_legislature",
    probably from the old status mapping. It matters if pro imports the archive as history.

## Open items / next steps

1. **Owner, week 1 (critical path):** #3077 off-box `pg_dump` of the homelab DB. #3078 provision the Linode
   (verify pricing). Confirm the DNS provider.
2. Pro week 1 dev: #2698 Node 24, #3079 Dockerfile `public/`, #3080 exposed Postgres and default password,
   #3081 `/api/sync`, #3082 `/api/health`, #3083 tests and ADO CI, #3084 migrations, #3085 session config,
   #3086 secrets script, #3087 axe specs (public repo).
3. **#3098:** re-enable "Fetch Bill Data" after prefiling opens. Follow the checklist in the fetch-readiness report.
   The code is unblocked (PR #83 merged). Watch for the Dec 7 routine email first.
4. Re-check the cutoff dates when both chambers adopt the 2027 calendar.
5. Follow-ups from QA (not filed yet):
   - `"priorSession": null` crashes both fetch scripts (fix: `SESSION.get("priorSession") or {}`).
   - The tier-2 stale-refresh path still exits 0 on its error limit.
   - The error counter is cumulative, not consecutive.
   - `fetch-data.yml` has no concurrency group and no rebase before push.
6. Owner decisions pending:
   - Throwaway public Pages repo for the rollback rehearsal (#3106), or a quiet-hour live flip.
   - Run `/c6s-grill` on ADR-005 and ADR-002 before accepting the ADRs.
   - Pro stays private (recommended).
7. A typo in the pro architecture report, section 4: "the 008 roles" should be `005_roles`. The read-only role could not fix it.
8. Run `npx gitnexus analyze` sometime. The index has never been built for this repo.

## Repo state at session end

- `main` includes PRs #83 and #84. `fix/ado-3073-3074-biennium` and `2027-session` are pushed and merged.
- wa-bill-tracker-pro: PR !535 is open (plan docs; the owner completes it). !442 was abandoned at owner request; its branch
  is kept and #2759 is still open.
- This file and all of the session's agentdocs briefs and reports are committed on the feature branch. The owner pushes and opens the PR.
- Memory updated: `wa-tracker-2027-switchover-state`, `wa-tracker-pro-vps-direction`.
