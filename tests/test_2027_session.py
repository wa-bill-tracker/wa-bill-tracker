#!/usr/bin/env python3
"""TDD Red Phase -- Sprint 4: 2027 Session Update.

Verifies the app has rolled forward from the 2025-26 biennium (2026 short
session, ended) to the 2027-28 biennium (2027 long session).

Run with: python -m pytest tests/test_2027_session.py -v
"""

import json
import re
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Test2027SessionRollover(unittest.TestCase):
    def setUp(self):
        session_path = PROJECT_ROOT / "data" / "session.json"
        self.session = json.loads(session_path.read_text())

    def test_session_year_is_2027(self):
        self.assertEqual(self.session["year"], 2027)

    def test_biennium_is_2027_28(self):
        self.assertEqual(self.session["biennium"], "2027-28")

    def test_data_archive_exists(self):
        archive_path = PROJECT_ROOT / "data" / "archive" / "2026-bills.json"
        self.assertTrue(
            archive_path.exists(),
            "data/archive/2026-bills.json should exist -- 2026 data archived "
            "before resetting data/bills.json for the new biennium",
        )

    def test_manifest_reset(self):
        manifest_path = PROJECT_ROOT / "data" / "manifest.json"
        self.assertFalse(
            manifest_path.exists(),
            "data/manifest.json should NOT exist -- removed to force a full "
            "initial fetch for the new biennium",
        )

    def test_no_hardcoded_2026_in_js(self):
        js_dir = PROJECT_ROOT / "js"
        offenders = []
        for js_file in sorted(js_dir.glob("*.js")):
            content = js_file.read_text()
            for i, line in enumerate(content.splitlines(), start=1):
                if "2026" in line:
                    offenders.append(f"{js_file.name}:{i}: {line.strip()}")
        self.assertEqual(
            [],
            offenders,
            "Found hardcoded '2026' literals in js/ -- session-specific "
            "years must come from data/session.json:\n" + "\n".join(offenders),
        )

    def test_no_hardcoded_2025_26_in_pipeline(self):
        source = (PROJECT_ROOT / "scripts" / "fetch_all_bills.py").read_text()
        matches = re.findall(r'"2025-26"|\'2025-26\'', source)
        self.assertEqual(
            [],
            matches,
            "scripts/fetch_all_bills.py contains hardcoded '2025-26' -- "
            "biennium value should come from data/session.json",
        )


if __name__ == "__main__":
    unittest.main()


class Test2027CutoffCalendar(unittest.TestCase):
    """2027 draft cutoff calendar (leg.wa.gov, tentative until both chambers
    adopt it). Source: docs/status/agentdocs/2026-11-17-2027-prefiling-research-report.md
    """

    EXPECTED = [
        ("2027-02-19", "Policy Committee (Origin)"),
        ("2027-02-26", "Fiscal Committee (Origin)"),
        ("2027-03-10", "House of Origin"),
        ("2027-03-31", "Policy Committee (Opposite)"),
        ("2027-04-06", "Fiscal Committee (Opposite)"),
        ("2027-04-14", "Opposite House"),
        ("2027-04-25", "Sine Die"),
    ]

    def setUp(self):
        session_path = PROJECT_ROOT / "data" / "session.json"
        self.session = json.loads(session_path.read_text())

    def test_session_end_is_sine_die_april_25(self):
        # Day 105 counting Jan 11 as day 1; official draft agrees.
        self.assertEqual(self.session["sessionEnd"], "2027-04-25")

    def test_cutoff_dates_match_draft_calendar(self):
        actual = [(c["date"], c["label"]) for c in self.session["cutoffDates"]]
        self.assertEqual(actual, self.EXPECTED)

    def test_last_cutoff_equals_session_end(self):
        self.assertEqual(
            self.session["cutoffDates"][-1]["date"], self.session["sessionEnd"]
        )

    def test_fails_before_stages_accumulate(self):
        # Each cutoff must fail at least every stage the previous one did.
        prev = set()
        for c in self.session["cutoffDates"]:
            stages = set(c["failsBefore"])
            self.assertTrue(prev <= stages, f"{c['label']} drops stages {prev - stages}")
            self.assertIn("prefiled", stages)
            prev = stages
