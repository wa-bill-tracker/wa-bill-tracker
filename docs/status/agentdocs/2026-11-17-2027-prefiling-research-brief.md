# Brief: When does 2027 WA legislation start dropping? (primary-source research)

- **Date:** 2026-11-17
- **Agent:** c6s-osint-recon (public-records collection, passive only)
- **Repo:** ~/Local/github/wa-bill-tracker (read-only for this agent, except this report)

## Objective
Establish from primary sources when bills for the 2027 Washington State legislative
session (2027-28 biennium, convenes 2027-01-11) begin to be introduced/prefiled and become
publicly visible, and whether any have already dropped as of today.

## Questions to answer
1. Prefiling start date for the 2027 session (cite the rule: RCW / joint rules / House & Senate
   rules / leg.wa.gov prefiling notice). Is there a different date for odd-year vs even-year
   sessions, or for returning vs newly elected members?
2. Are any 2027-28 biennium bills already filed/visible today? Check
   app.leg.wa.gov/billsbynumber, leg.wa.gov "prefiled bills" page, and the WSL Web Services
   (wslwebservices.leg.wa.gov, e.g. LegislationService GetPrefiledLegislationInfo /
   GetLegislationIntroducedSince with biennium 2027-28). Report counts and earliest dates.
3. Has the 2027 session cutoff calendar been published? If yes, list the cutoff dates and
   the sine die date (confirm 2027-04-25 vs 04-26).
4. Historical pattern: prefile start and first-week volume for the 2025 and 2023 long sessions.

## Constraints
- Follow the user's retrieval rule: Playwright with a real Chrome UA first
  (python: /Users/jeffrecords/.local/share/uv/tools/playwright/bin/python), full-header curl
  second, WebFetch last. A 403 from WebFetch is not evidence of a block.
- Cite every claim with URL + retrieval time. Label search snippets as secondary.
- Do not modify repo code or data. Do not push, commit, or open GitHub issues.

## Deliverable
Write findings to `docs/status/agentdocs/2026-11-17-2027-prefiling-research-report.md`
and return a short summary: dates, confidence, sources.

## No-collision
A parallel c6s-data-dataeng agent is assessing the repo's fetch pipeline readiness. Do not
touch `scripts/`, `data/`, or `.github/`.
