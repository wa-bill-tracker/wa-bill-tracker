#!/usr/bin/env python3
"""Regression tests for ADO #3073 (incremental fetch across a biennium boundary).

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


class TestIncrementalPriorYearRoster(unittest.TestCase):
    """ADO #3073: prior-year roster only within the same biennium."""

    def _run(self, session, year, biennium):
        calls = []

        def by_year(y):
            calls.append(y)
            return [_entry(y)]

        with patch.object(inc, "SESSION", session, create=True), \
             patch.object(inc, "YEAR", year), \
             patch.object(inc, "BIENNIUM", biennium), \
             patch.object(inc, "get_legislation_list_by_year", side_effect=by_year), \
             patch.object(inc, "get_prefiled_legislation", return_value=[]):
            result = inc.find_new_bill_numbers({"bills": {}})
        return calls, result

    def test_new_biennium_skips_prior_year(self):
        calls, result = self._run(LONG_SESSION, 2027, "2027-28")
        self.assertEqual(calls, [2027])
        self.assertEqual(result, [2027])

    def test_short_session_includes_prior_year(self):
        calls, result = self._run(SHORT_SESSION, 2026, "2025-26")
        self.assertEqual(calls, [2026, 2025])
        self.assertEqual(sorted(result), [2025, 2026])


class TestIncrementalAbortExit(unittest.TestCase):
    """ADO #3073: an aborted run must exit nonzero."""

    def test_abort_on_too_many_errors_exits_nonzero(self):
        manifest = {"bills": {"HB1": {"status": "committee"}}}
        with patch.object(inc, "load_manifest", return_value=manifest), \
             patch.object(inc, "load_existing_bills", return_value=[{"id": "HB1"}]), \
             patch.object(inc, "ensure_dirs"), \
             patch.object(inc, "REQUEST_DELAY", 0), \
             patch.object(inc, "find_new_bill_numbers", return_value=list(range(60))), \
             patch.object(inc, "get_legislation_details", return_value=None), \
             patch.object(inc, "create_sync_log") as sync_log, \
             patch.object(inc, "save_bills_data") as save:
            with self.assertRaises(SystemExit) as cm:
                inc.run_incremental()
        self.assertNotEqual(cm.exception.code, 0)
        save.assert_not_called()
        self.assertIn("error", sync_log.call_args[0][1])


if __name__ == "__main__":
    unittest.main()
