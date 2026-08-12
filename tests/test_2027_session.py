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
