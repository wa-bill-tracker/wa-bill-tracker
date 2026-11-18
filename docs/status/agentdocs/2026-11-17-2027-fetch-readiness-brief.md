# Brief: Is the fetch pipeline ready for 2027 prefiled bills? (readiness assessment)

- **Date:** 2026-11-17
- **Agent:** c6s-data-dataeng (assessment only this round, no code changes)
- **Repo:** ~/Local/github/wa-bill-tracker

## Context
The site rolled forward to the 2027-28 biennium on 2026-08-11 (see
`docs/status/2026-08-11-2027-switchover.md`). The "Fetch Bill Data" GitHub workflow
(`.github/workflows/fetch-data.yml`) is paused (`disabled_manually`) so it would not run
empty 2027 fetches. `data/session.json` has `cutoffDates: []`, provisional sessionEnd
2027-04-25. 11 Playwright specs are skip-gated until real 2027 data exists.

## Objective
Determine what has to be true for the tracker to pick up 2027 bills the moment they start
dropping (prefiling), and whether the existing pipeline would handle prefiled bills correctly.

## Questions to answer
1. Read `scripts/fetch_bills_incremental.py`, `fetch_all_bills.py`, `validate_bills_json.py`.
   Which WSL Web Services endpoints and biennium/year parameters do they use? Do they derive
   them from `data/session.json`?
2. Would they discover **prefiled** bills (before the session convenes 2027-01-11)? E.g. does
   the incremental mode use an "introduced since" date that starts at sessionStart and would
   miss December prefiles? Does validation fail on zero or few bills?
3. Live probe (read-only GETs only) of wslwebservices.leg.wa.gov for biennium 2027-28: does
   the API currently return any 2027 legislation? Report counts. Use full-header curl or
   Playwright per the user's retrieval rule.
4. Exact re-enable checklist: `gh workflow enable "Fetch Bill Data"`, a first manual
   `--full` dispatch, which skipped specs to un-gate, and any code fixes needed (list them
   as proposed work items; do not implement).

## Constraints
- Do not edit code, data, or workflows. Do not enable the workflow, dispatch runs, commit,
  or push. Do not open GitHub issues (work items go to ADO).
- Cite file:line for code claims.

## Deliverable
Write findings to `docs/status/agentdocs/2026-11-17-2027-fetch-readiness-report.md` and
return a short summary: ready / not ready, blockers, re-enable checklist.

## No-collision
A parallel c6s-osint-recon agent is researching the official prefiling/calendar dates on
leg.wa.gov. Do not duplicate that; focus on the pipeline and API behavior.
