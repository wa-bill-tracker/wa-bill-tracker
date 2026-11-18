# 2027 fetch readiness report

- Date: 2026-11-17
- Agent: c6s-data-dataeng (assessment only; no code, data, or workflow was changed, no run dispatched)
- Brief: docs/status/agentdocs/2026-11-17-2027-fetch-readiness-brief.md

## Verdict: NOT READY (2 code blockers, 1 operational gap)

Full-mode fetch would work for prefiled bills. The incremental mode (what the
workflow runs on every non-Sunday schedule) is broken for a new biennium, and a
session-tagging bug would hide 2027 bills that reach a terminal status.
Do not rely on the workflow until B1 and B2 are fixed.

## 1. Endpoints and parameters (all derived from data/session.json)

Config load: `scripts/fetch_all_bills.py:43-52` reads `data/session.json`
(relative path `Path("data")`, line 39, so scripts must run from the repo root, as the
workflow does) and sets `BIENNIUM="2027-28"`, `YEAR=2027`. No hardcoded years found.

SOAP 1.1 POST to `https://wslwebservices.leg.wa.gov` (`fetch_all_bills.py:33-37, 85-125`):

| Method | Service | Param | Cite |
|---|---|---|---|
| GetLegislationByYear | LegislationService | year | fetch_all_bills.py:177-190 |
| GetPreFiledLegislationInfo | LegislationService | biennium | fetch_all_bills.py:225-235 |
| GetLegislation | LegislationService | biennium, billNumber | fetch_all_bills.py:269-278 |
| GetRollCalls (votes) | LegislationService | biennium, billNumber | fetch_all_bills.py:339, 743 |
| GetCommitteeMeetings | CommitteeMeetingService | begin/end date (today..+30d) | fetch_all_bills.py:756-775, 853-857 |
| GetCommitteeMeetingItems | CommitteeMeetingService | agendaId | fetch_all_bills.py:817-846 |

GetLegislationIntroducedSince is not used anywhere, so there is no "introduced since
sessionStart" cutoff that could miss December prefiles. validate_bills_json.py does not
touch the API or session.json.

`validate_bills_json.py` (lines 32-94): checks file exists, totalBills == len, required
fields, duplicate IDs, valid status set (includes `prefiled`, line 25), and a >10% drop
vs manifest `billCount` (86-90). There is NO minimum-count check, so zero or few bills
passes validation. A zero-bill full fetch is stopped earlier by `fetch_all_bills.py:1214-1217`
(logs error, `sys.exit(1)`, bills.json untouched), which fails the workflow before validate.

## 2. Would prefiled bills be discovered?

Full mode: yes in design. `fetch_all_bills()` merges GetLegislationByYear(YEAR) and
GetPreFiledLegislationInfo(BIENNIUM) (lines 920-938), skips the prior-year fetch across a
biennium boundary (942-948, correct), then pulls details per bill number with
`GetLegislation(BIENNIUM, n)` (988). `normalize_status` maps to `prefiled` (616-631).
Frontend counts `status === 'prefiled'` (js/render.js:728, 882).

Caveat I could not verify: whether WSL lists prefiled bills under GetLegislationByYear(2027),
GetPreFiledLegislationInfo(2027-28), or both. Both are queried, so either works. There is
no prior prefile data in this repo to compare (data/ was only created 2026-01-12; git log
shows nothing before that), and GetPreFiledLegislationInfo("2025-26") returns empty today,
so I cannot see its populated shape.

### Blocker B1: incremental mode breaks across a biennium boundary
`scripts/fetch_bills_incremental.py:117-121` always fetches `GetLegislationByYear(YEAR-1)`
(2026) with no biennium check. Live probe: that call returns 3,941 LegislationInfo, all
`Biennium=2025-26`. Lines 128-139 treat every one not in the manifest as "new". Line 261
then calls `GetLegislation("2027-28", bn)` for each; nearly all return nothing, `errors`
increments (274), and at 51 the run hits `return` at 275-278 BEFORE tier 2, hearings, or
save. Effects once a manifest exists (i.e. after the first full run):
- No incremental run ever saves, so new 2027 bills and status changes never land between Sunday full runs.
- It exits 0 (the abort path returns normally and only writes an "error" sync-log entry,
  line 277), so the workflow stays green and `validate` passes on stale data. Silent failure.
- The `errors > 50` guard is not "consecutive" despite its log text.
The full-mode code already has the right guard at fetch_all_bills.py:942-948; the
incremental copy omitted it. Until fixed, only full mode is trustworthy.

### Blocker B2: session tagging wrongly marks 2027 terminal bills as "2026"
`fetch_all_bills.py:703-714` decides "same biennium" with `str(YEAR - 1) == str(prior_year)`.
With YEAR=2027 and priorSession.year=2026 that is TRUE even though priorSession.biennium
(2025-26) differs from BIENNIUM (2027-28). So any 2027 bill that is enacted, vetoed, failed,
or partial_veto without "reintroduced" in its history gets `session="2026"` (706-709).
The frontend hides `session === priorSession.year` bills from active views
(js/data.js:164, 211; js/render.js:129, 288, 718, 888). Result: 2027 bills vanish from the
site as they die at cutoffs or are signed. Dormant until the first terminal 2027 bill
(first policy cutoff is typically late Jan/Feb), but certain. The existing tests
(tests/test_2027_session.py etc.) did not catch it. Fix: compare
`SESSION["priorSession"]["biennium"] == BIENNIUM`, matching fetch_all_bills.py:943.

### Gap G1: workflow has no concurrency group and pushes without rebase
`.github/workflows/fetch-data.yml:83-89`: `git push` with no `pull --rebase` and no
`concurrency:` key. A manual dispatch overlapping a schedule can fail the push. Low severity.

### Observations (non-blocking)
- `data/manifest.json` is absent (removed in switchover), so the first run of any mode does
  a full fetch (fetch_bills_incremental.py:238-241). Intended.
- `data/bills.json` is still the 2025-26 dataset (3,757 bills, sessionYear 2026; 3,307 tagged
  session "2026", 450 tagged "2025"). A successful first full run overwrites it
  (`save_bills_data`, 1060-1062); 2026 data is preserved in data/archive/2026-bills.json.
  If the first 2027 fetch returns zero bills it exits 1 and leaves the 2026 file in place (good).
- `validate_bills_json.py` drop guard: first run regenerates the manifest in the same job
  (`generate_manifest`, 1226), so the guard compares equal; no false failure expected.
- Sunday cron is `0 10 * * 0` UTC and mode detection uses `date -u +%u == 7` (workflow
  lines 8, 54): consistent.
- Hearings fetch is non-fatal and only looks 30 days ahead (853-857); fine for prefile season.

## 3. Live API probes (read-only GET, full-header curl, 2026-11-17)

Host wslwebservices.leg.wa.gov, all HTTP 200 unless noted.

| Request | Result |
|---|---|
| GetLegislationByYear?year=2027 | 200, empty ArrayOfLegislationInfo (0) |
| GetPreFiledLegislationInfo?biennium=2027-28 | 200, empty (0) |
| GetLegislation?biennium=2027-28&billNumber=1001 | 200, empty (0) |
| GetLegislationIntroducedSince biennium=2027-28, sinceDate 2026-11-17 / 2026-12-01 / 2027-01-01 | 200, empty (0) |
| GetCommitteeMeetings 2027-01-01..2027-03-01 | 200, empty |
| GetLegislationByYear?year=2026 | 200, 3,941 LegislationInfo, all Biennium 2025-26 |
| GetLegislationByYear?year=2025 | 200, 3,359 LegislationInfo |
| GetLegislationByYear?year=2028 | 400 (year not yet valid; matters for the 2028 roll-forward) |
| GetPreFiledLegislationInfo?biennium=2025-26 | 200, empty (so the list empties post-session or is not retained) |

Conclusion: as of today the API returns zero 2027-28 legislation. Nothing to fetch yet.
Side finding: GetLegislationIntroducedSince with biennium=2027-28 and sinceDate=2026-01-01
returned 2,026 bills, all `Biennium=2025-26` (introduced 2026-01-12..2026-03-12), i.e. the
service ignores the biennium parameter for dates inside the old biennium. Not used by this
repo, but do not adopt it without a biennium filter. Probe files were saved only under /tmp/wslprobe.

## 4. Proposed work items (ADO, civic-tech project, wa-bill-tracker; not filed by me)

1. B1 Bug (severity high): incremental fetch rosters prior-year bills across a biennium
   boundary and aborts silently. Fix: skip prev-year roster unless
   `SESSION.priorSession.biennium == BIENNIUM` (or filter roster by `biennium == BIENNIUM`);
   make the abort path `sys.exit(1)`; count consecutive errors only. Add a test with a
   2027-28 session and a 2025-26 roster fixture.
2. B2 Bug (severity high): `build_bill_dict` same-biennium test uses year not biennium
   (fetch_all_bills.py:704). Fix to compare biennium; add tests for first-year-of-biennium
   terminal bill returning session == str(YEAR).
3. Validation hardening: warn or fail when bills.json biennium != session.json biennium, and
   add an optional minimum-count floor after the session starts (not before; prefile counts are small).
4. Workflow: add `concurrency: group: fetch-data`, `git pull --rebase` before push, and an
   explicit failure when sync-log shows an "error" status.
5. Un-gate Playwright: `session-states.spec.js:45` is a hard `test.describe.skip` (not
   date-gated) and needs a decision on fixtures; the other 8 skips auto-un-gate by date
   (isPreSession compares today to sessionStart, e.g. filters.spec.js:27-32), so they flip
   on 2027-01-11 with no edit. Regression.spec.js:40 additionally requires the session to have ended.
6. Pre-existing doc item: switchover status doc says 11 skips; confirm the count after un-gating.

## 5. Exact re-enable checklist (do in order, after B1 and B2 are fixed and merged to main)

1. Confirm the API has data: re-run the probes above; proceed when
   `GetPreFiledLegislationInfo?biennium=2027-28` or `GetLegislationByYear?year=2027`
   is non-empty (expected from the first prefiling day, Dec 2026; official dates are covered
   by the parallel recon agent).
2. Fix B1 and B2 with tests (TDD), `pytest` green, merge to main.
3. Fill `cutoffDates` and confirm `sessionEnd` in data/session.json once the official 2027
   calendar is published (the 2026-12-01 reminder covers this).
4. Local dry run from the repo root on a throwaway branch or worktree:
   `python scripts/fetch_all_bills.py`, then `python scripts/validate_bills_json.py`.
   Expect a small bill count, `status: prefiled`, no error exit. Discard the output if not committing.
5. `gh workflow enable "Fetch Bill Data"`.
6. Immediately dispatch a manual full run:
   `gh workflow run "Fetch Bill Data" -f mode=full`, then `gh run watch`. Confirm the
   commit touches data/bills.json (biennium 2027-28, sessionYear 2027), manifest.json
   (new), stats.json, sync-log.json, and that debug-files artifact has no HTTP errors.
7. Dispatch one `mode=incremental` run and confirm it saves (log shows "Incremental fetch
   complete", sync-log status `success_incremental`), proving B1 is fixed.
8. Check the live site: Prefiled Bills count in the pre-session countdown, bill cards render,
   no 2027 bills tagged session "2026".
9. Monitor the first scheduled runs (6 AM / 6 PM Pacific = 14:00 / 02:00 UTC). On 2027-01-11
   the date-gated Playwright specs start running; run them against the live data.
10. After the session ends, disable the workflow again (the 2026 session kept auto-committing
    for months after sine die, per the switchover doc).

## Filed work items

- B1 -> ADO #3073 (civic-tech, Bug, P1), filed 2026-11-17
- B2 -> ADO #3074 (civic-tech, Bug, P1), filed 2026-11-17
