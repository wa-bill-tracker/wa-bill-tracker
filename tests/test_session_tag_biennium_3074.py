#!/usr/bin/env python3
"""Regression tests for ADO #3074 (session tag across a biennium boundary).

All WSL network calls are mocked. Session values are patched in, so these
tests do not depend on the current contents of data/session.json.
"""

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

import scripts.fetch_all_bills as fab
import scripts.fetch_bills_incremental as inc

LONG_SESSION = {"year": 2027, "biennium": "2027-28",
                "priorSession": {"year": 2026, "biennium": "2025-26"}}
SHORT_SESSION = {"year": 2026, "biennium": "2025-26",
                 "priorSession": {"year": 2025, "biennium": "2025-26"}}


def _entry(n):
    return {"bill_number": n, "bill_id": f"HB {n}"}


class TestSessionTagAcrossBiennium(unittest.TestCase):
    """ADO #3074: session tag compares biennium labels, not years."""

    DETAILS = {"bill_id": "HB 1001", "status": "x", "history_line": "Governor signed"}

    def _build(self, session, year, biennium, status):
        with patch.object(fab, "SESSION", session), \
             patch.object(fab, "YEAR", year), \
             patch.object(fab, "BIENNIUM", biennium), \
             patch.object(fab, "normalize_status", return_value=status):
            return fab.build_bill_dict(dict(self.DETAILS), "House")

    def test_new_biennium_terminal_bills_tagged_current_year(self):
        for status in ("enacted", "vetoed", "failed", "partial_veto"):
            with self.subTest(status=status):
                bill = self._build(LONG_SESSION, 2027, "2027-28", status)
                self.assertEqual(bill["session"], "2027")

    def test_short_session_terminal_bill_tagged_prior_year(self):
        bill = self._build(SHORT_SESSION, 2026, "2025-26", "enacted")
        self.assertEqual(bill["session"], "2025")

    def test_short_session_active_bill_tagged_current_year(self):
        bill = self._build(SHORT_SESSION, 2026, "2025-26", "committee")
        self.assertEqual(bill["session"], "2026")


if __name__ == "__main__":
    unittest.main()
