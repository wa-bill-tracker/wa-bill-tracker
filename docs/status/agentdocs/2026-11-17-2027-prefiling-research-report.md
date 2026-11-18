# 2027 WA prefiling research report

- Date: 2026-11-17 (retrievals 2026-11-18 04:55-05:04 UTC = 2026-11-17 20:55-21:04 PT)
- Agent: c6s-osint-recon, passive public-records collection only
- Brief: docs/status/agentdocs/2026-11-17-2027-prefiling-research-brief.md
- Retrieval: Playwright (Chrome 126 UA) for pages; full-header curl for the PDF, the House rules file and the WSL XML. No WebFetch used. Nothing was blocked.

## Answer in brief

1. Prefiling for the 2027 session opens Monday 2026-12-07 (primary: leg.wa.gov prefiled bills page; rule: House Rule 10). Nothing has dropped yet.
2. As of 2026-11-17 there are zero 2027-28 prefiled bills in the official feeds. Earliest possible filing date is 12/7.
3. A DRAFT 2027 cutoff calendar is published. It is tentative, pending approval by both chambers. Sine die is April 25, 2027, not April 26.
4. History: prefiling opened on the first Monday of December in 2022, 2024 and 2025. Volume is small in week one (18 House bills in 2024, 22 in 2022) and large only on day 1 of session (493 HB/SB introduced 2025-01-13).

## Q1. Prefiling start date and rule

| Claim | Source | Retrieved (UTC) | Type |
|---|---|---|---|
| "Pre-filing for the 2027 legislative session begins on Monday December 7, 2026." | https://app.leg.wa.gov/billinfo/prefiled.aspx (also `?year=2027`, same text) | 2026-11-18 05:03:51 | Primary |
| House Rule 10: "Any returning member or member-elect may prefile a bill with the chief clerk commencing the first Monday in December preceding any regular session or twenty (20) days before any special session. Prefiled bills shall be introduced on the first legislative day." | https://lawfilesext.leg.wa.gov/biennium/2025-26/Htm/Bills/House%20Resolutions/4667-House%20rules,%20permanent.htm (HR 4667, House permanent rules, 2025-26) | 2026-11-18 05:04:33 | Primary |
| KOMO: "Prefiling for legislation ahead of the 2027 session opens on December 7th" | https://komonews.com/news/politics/set-of-school-related-bills-already-in-works-for-2027-state-legislative-session-leadership-safe-learning-environment-certification-training-superintendent-transparency-abuse-neglect-misconduct | 2026-11-18 05:03:42 | Secondary, agrees |

Notes:
- First Monday of December 2026 is 12/7, since 12/1 is a Tuesday. This matches the official page.
- The rule's date is the same for odd and even years ("any regular session"). The difference is the session length: 105 days in odd years, 60 in even years.
- The rule limits prefiling to returning members and members-elect. Newly elected members can file once they are members-elect, so the rule does not give them a later date. The newly elected are covered by "member-elect"; that reading is mine and I did not find a separate notice on it.
- A secondary search snippet (a Democratic caucus page, via WebSearch, not fetched) said prefiling opens December 1, 2026. That conflicts with the official page. Treat it as wrong.
- The Senate rule was not retrieved. Senate prefiling practice historically tracks the House, but that is unverified here.
- The adopted House rules are the 2025-26 set. The 2027-28 House rules are adopted in January 2027. The rule text has been stable for years, but strictly it could change. The leg.wa.gov page date is the controlling statement for now.

## Q2. Any 2027-28 bills visible today?

None found. All negatives are "not found in source X as of the retrieval time", not "does not exist".

| Source | Result | Retrieved (UTC) |
|---|---|---|
| https://app.leg.wa.gov/billinfo/prefiled.aspx | "There are currently no prefiled bills for the upcoming legislative session." Table empty. | 2026-11-18 05:03:51 |
| https://wslwebservices.leg.wa.gov/LegislationService.asmx/GetPreFiledLegislationInfo?biennium=2027-28 | HTTP 200, empty `ArrayOfLegislationInfo` | 2026-11-18 04:55:10 |
| https://wslwebservices.leg.wa.gov/LegislationService.asmx/GetLegislationIntroducedSince?biennium=2027-28&sinceDate=2026-11-01 | HTTP 200, empty `ArrayOfLegislation` | 2026-11-18 04:55:15 |
| https://lawfilesext.leg.wa.gov/biennium/2027-28/Htm/Workroom%20Reports/House%20Prefiled%20Report/PREFILED%202027-001.htm | 404 (report not yet generated) | 2026-11-18 05:03:57 |

Caveats for the tracker:
- `GetPreFiledLegislationInfo?biennium=2025-26` also returns empty today (retrieved 2026-11-18 04:55:18). So that method appears to list only the upcoming session's prefiles, and an empty 2025-26 result tells us nothing about 2027-28.
- In `GetLegislationIntroducedSince?biennium=2025-26&sinceDate=2024-12-01` (retrieved 2026-11-18 05:04:xx, 9.3 MB XML), every HB/SB prefiled in Dec 2024 carries `IntroducedDate` 2025-01-13, the first legislative day. The prefile date is not in that field. The tracker will not see the December filing date there. Use `GetPreFiledLegislationInfo` or the prefiled.aspx page for that. I could not test whether `GetLegislationIntroducedSince` returns prefiled bills before session starts, since no prefiles exist yet. Re-test on or after 12/7.
- Public statements of intent exist (KOMO, Sen. Adrian Cortes, two school-related bills, planned for 12/7). Those are plans, not filed bills.

## Q3. Cutoff calendar and sine die

Source: https://leg.wa.gov/bills-meetings-and-session/session/ (section "Draft - Important 2027 session dates"), retrieved 2026-11-18 05:03:14 UTC. Primary. The page says: "2027 cutoff dates are tentative, and must be approved by both the House of Representatives and Senate."

| Date (2027) | Event |
|---|---|
| Mon Jan 11 | First day of session |
| Fri Feb 19 | Policy committee cutoff (house of origin) |
| Fri Feb 26 | Fiscal committee cutoff (house of origin) |
| Wed Mar 10 | House of origin cutoff, 5 p.m. |
| Wed Mar 31 | Policy committee cutoff, opposite house |
| Tue Apr 6 | Fiscal committee cutoff, opposite house |
| Wed Apr 14 | Opposite house cutoff, 5 p.m. |
| Sun Apr 25 | Sine die, last day allowed for the regular session under the state constitution |

Sine die check: Jan 11 is day 1, so day 105 is April 25 (21 days left in Jan + 28 + 31 + 25 = 105). The official draft agrees. The April 26 figure in a secondary snippet is wrong. The weekdays above are my calendar arithmetic. The page lists only the month and day.

The official page links to the historical PDF cutoff calendars (https://leg.wa.gov/bills-meetings-and-session/session/session-documents/cutoff-calendars/), which I did not open. Check there for a formal PDF once approved.

## Q4. History

Rule start: first Monday of December. 2024-12-02, 2022-12-05 and 2025-12-01 all fit.

### 2025 session (convened 2025-01-13)
- Source: House prefiled report as of Jan 6, 2025, https://lawfilesext.leg.wa.gov/biennium/2025-26/Htm/Workroom%20Reports/House%20Prefiled%20Report/PREFILED%202025-001.htm, retrieved 2026-11-18 05:03:30 UTC. Primary. I counted "Prefiled for Introduction on" lines.
- First prefile date was 12/2/2024, which was the first Monday of December.
- House prefiles by day: 12/2: 4, 12/3: 5, 12/4: 3, 12/5: 6. First 4 days (week one, Mon-Thu): 18. Whole week of 12/2-12/6, no 12/6 filings in the report: 18.
- Second week (12/9-12/13): 8+6+19+8+14 = 55. Week of 12/16-12/20: 43.
- The House prefiled total as of 1/6/2025 was 166, from HB 1000 up to HB 1161 or so (the numbering has gaps).
- Senate figures for 2025 were not obtained. The equivalent Senate report URL returned 404 on both guessed paths.
- Day-one session volume: from the WSL feed, 261 House plus 232 Senate bills (HB/SB only) show IntroducedDate 2025-01-13. That is 493, which includes the prefiled bills. After that: about 55 to 100 per day for the next week.
- Secondary: Washington State Standard, "First bills drop ahead of WA's 2025 legislative session," 2024-12-02, https://washingtonstatestandard.com/2024/12/02/first-bills-drop-ahead-of-was-2025-legislative-session/ (seen in WebSearch results only, not fetched).

### 2023 session (convened 2023-01-09)
- Source: House prefiled report as of Dec 30, 2022, https://lawfilesext.leg.wa.gov/biennium/2023-24/Pdf/Workroom%20Reports/House%20Prefiled%20Report/PREFILED%202023-001.pdf, retrieved 2026-11-18 05:04:05 UTC (curl, pdftotext). Primary.
- First prefile date was 12/5/2022, the first Monday of December.
- House prefiles by day: 12/5: 8, 12/6: 7, 12/7: 5, 12/8: 5, 12/9: 2. Week one total: 27. (My count of the first 5 days. The overall counted total by 12/30 is 102 House bills.)
- Week of 12/12-12/16: 23. Week of 12/19-12/23: 35. 12/27-12/30: 17.
- This report is a snapshot as of 12/30/2022 only, so it excludes anything filed 12/31 to 1/8. The total is a floor.
- Senate figures for 2023 were not obtained (404).
- Secondary, from WebSearch only: a 2023 report said legislators began pre-filing on December 5, 2022. That matches the primary report.

### 2026 session, for context (even year, 60 days)
- Washington State Standard, 2025-12-06, https://washingtonstatestandard.com/2025/12/06/bills-begin-streaming-in-ahead-of-was-2026-legislative-session/, retrieved 2026-11-18 05:03:34. Secondary. Confirms lawmakers pre-filed during the week of 12/1/2025, with session starting Jan 12, 2026.

## Pattern for 2027

- Expect the first filings on 2026-12-07 (a Monday), at a rate of single digits to about 10 per day per chamber in week one. Expect the House report to show roughly 20 to 30 bills by 12/11 if 2023 and 2025 are guides.
- Expect the total prefiled count to be about 100 to 170 for the House by session start. The 2025 session was a 105-day budget-year session like 2027.
- Expect about 450 to 500 or more HB/SB with IntroducedDate 2027-01-11 in WSL.
- These are projections from two data points per chamber, and they are not facts.

## Confidence

- Prefiling start 12/7/2026: High. Two primary sources (official page and House Rule 10) plus calendar arithmetic and one secondary source agree.
- No bills filed as of 11/17/2026: High for these feeds at the retrieval time (3 independent official endpoints). A bill filed with the chief clerk but not yet posted could not be seen by anyone else either.
- Cutoff calendar and 4/25 sine die: High for the draft, Medium that it will not change before adoption.
- Historical weekly counts: High for House counts from official reports. Senate counts and the 2023 post-12/30 filings are missing.

## Sources and reliability

| Source | Rating |
|---|---|
| https://app.leg.wa.gov/billinfo/prefiled.aspx | Primary, high |
| https://wslwebservices.leg.wa.gov/LegislationService.asmx (GetPreFiledLegislationInfo, GetLegislationIntroducedSince) | Primary, high |
| https://leg.wa.gov/bills-meetings-and-session/session/ | Primary, high (draft calendar) |
| https://lawfilesext.leg.wa.gov House Prefiled Reports 2023 and 2025 | Primary, high |
| https://lawfilesext.leg.wa.gov/.../4667-House rules, permanent.htm | Primary, high |
| komonews.com, washingtonstatestandard.com | Secondary |
| WebSearch snippets (a Democratic caucus page, KUOW, Herald, Chinook Observer, retail association) | Secondary, low, used only as pointers |

## Dead URLs found (not blocks)

These returned 404 (the site reorganized): https://leg.wa.gov/bills-laws-agency-rules/bills/prefiled-bills/, https://leg.wa.gov/bills-laws-agency-rules/session-cutoff-calendar/, https://leg.wa.gov/bills-meetings-and-session/session/cutoff-calendar/, https://app.leg.wa.gov/billsbynumber/ (the last one returned an IIS 404). Current paths are the ones cited above.

## Follow-ups for the user

- Re-check https://app.leg.wa.gov/billinfo/prefiled.aspx and `GetPreFiledLegislationInfo?biennium=2027-28` on 2026-12-07 to confirm the first filing. Test whether `GetLegislationIntroducedSince` shows the bills pre-session.
- Re-check the cutoff calendar page after the chambers adopt the 2027 calendar (and the House adopts 2027-28 rules in January).
- Local working files were kept in /tmp/wa-out, /tmp/wa-dl and /tmp/wa-scripts. Nothing under scripts/, data/ or .github/ was touched, and nothing was committed.
