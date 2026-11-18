#!/usr/bin/env python3
"""Contract tests for ADO #3118: prefiling config, prior-session archive, nav markup.

Browser behavior is covered by playwright/tests/passed-2026.spec.js and
empty-state.spec.js.
"""

import json
import re
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SESSION = json.loads((ROOT / "data" / "session.json").read_text())
INDEX = (ROOT / "index.html").read_text()

class TestPrefilingConfig(unittest.TestCase):
    def test_prefiling_opens_is_iso_date_before_session_start(self):
        opens = date.fromisoformat(SESSION["prefilingOpens"])
        self.assertLess(opens, date.fromisoformat(SESSION["sessionStart"]))
        self.assertEqual(opens.isoformat(), "2026-12-07")


class TestPriorSessionArchive(unittest.TestCase):
    def setUp(self):
        year = SESSION["priorSession"]["year"]
        path = ROOT / "data" / "archive" / f"{year}-bills.json"
        self.assertTrue(path.exists(), f"{path} missing")
        self.archive = json.loads(path.read_text())

    def test_archive_matches_prior_biennium(self):
        self.assertEqual(self.archive["biennium"], SESSION["priorSession"]["biennium"])
        for b in self.archive["bills"]:
            self.assertEqual(b["biennium"], SESSION["priorSession"]["biennium"])

    def test_archive_has_enacted_bills_to_show(self):
        passed = [b for b in self.archive["bills"] if b["status"] in ("enacted", "partial_veto")]
        self.assertGreater(len(passed), 0)

    def test_archive_biennium_differs_from_current(self):
        self.assertNotEqual(self.archive["biennium"], SESSION["biennium"])


class TestNavMarkup(unittest.TestCase):
    def test_archive_nav_link_present_and_data_driven(self):
        self.assertIn('id="archiveNavLink"', INDEX)
        # No hardcoded year in the link text or href: both set from session.json.
        m = re.search(r'<a[^>]*id="archiveNavLink"[^>]*>(.*?)</a>', INDEX, re.S)
        self.assertIsNotNone(m)
        self.assertNotRegex(m.group(0), r"20\d\d")

    def test_archive_view_container_present(self):
        self.assertIn('id="archiveView"', INDEX)


class TestNoHardcodedYearsInNewJs(unittest.TestCase):
    def test_archive_module_has_no_year_literals(self):
        path = ROOT / "js" / "archive.js"
        self.assertTrue(path.exists())
        self.assertNotRegex(path.read_text(), r"\b20\d\d\b")


class TestArchiveLabelUsesBiennium(unittest.TestCase):
    def test_label_and_hash_derive_from_biennium(self):
        src = (ROOT / "js" / "archive.js").read_text()
        self.assertIn("prior.biennium", src)
        self.assertIn("Passed in ${priorPeriod()}", src)
        self.assertIn("passed-${priorPeriod()}", src)

    def test_session_has_prior_biennium(self):
        self.assertRegex(SESSION["priorSession"]["biennium"], r"^\d{4}-\d{2}$")


if __name__ == "__main__":
    unittest.main()
