#!/usr/bin/env python3
"""Contract tests for ADO #3117 (development banner): data and markup.

Browser behavior is covered by playwright/tests/banner.spec.js.
"""

import json
import re
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SESSION = json.loads((ROOT / "data" / "session.json").read_text())
INDEX = (ROOT / "index.html").read_text()

BANNER_COPY = (
    "We're upgrading WA Bill Tracker. A new version with deeper bill, "
    "legislator and law (RCW) context launches before the 2027 session "
    "begins January 11. This site stays fully available until then."
)


def _text(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html)).strip()


class TestBannerOffSwitch(unittest.TestCase):
    def test_single_boolean_flag_in_session_json(self):
        self.assertIn("developmentBanner", SESSION)
        self.assertIsInstance(SESSION["developmentBanner"], bool)

    def test_flag_is_enabled_for_launch(self):
        self.assertTrue(SESSION["developmentBanner"])


class TestBannerMarkup(unittest.TestCase):
    def setUp(self):
        m = re.search(r'<(section|aside)[^>]*id="devBanner"[^>]*>(.*?)</\1>', INDEX, re.S)
        self.assertIsNotNone(m, "banner element #devBanner not found")
        self.block = m.group(0)

    def test_exact_owner_approved_copy(self):
        self.assertIn(BANNER_COPY, _text(self.block).replace(" x", "").replace("Dismiss", ""))

    def test_precedes_header_and_main_content(self):
        self.assertLess(INDEX.index('id="devBanner"'), INDEX.index("<header"))

    def test_not_an_alert(self):
        self.assertNotIn('role="alert"', self.block)

    def test_has_accessible_name(self):
        self.assertRegex(self.block, r'aria-label(ledby)?="')

    def test_dismiss_is_a_real_button_with_label(self):
        self.assertRegex(self.block, r'<button[^>]*id="devBannerDismiss"[^>]*aria-label="[^"]+"')

    def test_hidden_until_script_enables_it(self):
        self.assertRegex(self.block.split(">", 1)[0], r"\bhidden\b")




if __name__ == "__main__":
    unittest.main()
