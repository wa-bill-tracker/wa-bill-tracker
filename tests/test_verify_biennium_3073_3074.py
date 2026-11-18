#!/usr/bin/env python3
"""Independent verification tests for ADO #3073 and #3074.

These add coverage the developer tests lack: missing or partial priorSession,
the even-year short session in a new biennium, the abort path's effect on
disk, and the full-mode roster guard. No network, no dependence on the
contents of data/. Session values are patched in; disk writes go to a
temporary directory.
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

import scripts.fetch_all_bills as fab
import scripts.fetch_bills_incremental as inc

# Derived from one base year so nothing here is a pinned calendar year.
BASE = 2031  # odd year: first (long) year of a biennium
BIEN_NEW = f"{BASE}-{str(BASE + 1)[-2:]}"
BIEN_OLD = f"{BASE - 2}-{str(BASE - 1)[-2:]}"

NEW_LONG = {"year": BASE, "biennium": BIEN_NEW,
            "priorSession": {"year": BASE - 1, "biennium": BIEN_OLD}}
NEW_SHORT = {"year": BASE + 1, "biennium": BIEN_NEW,
             "priorSession": {"year": BASE, "biennium": BIEN_NEW}}


def _entry(n):
    return {"bill_number": n, "bill_id": f"HB {n}"}


def _find(session):
    """Run find_new_bill_numbers under a patched session; return by-year calls."""
    calls = []

    def by_year(y):
        calls.append(y)
        return [_entry(y)]

    with patch.object(inc, "SESSION", session), \
         patch.object(inc, "YEAR", session["year"]), \
         patch.object(inc, "BIENNIUM", session["biennium"]), \
         patch.object(inc, "get_legislation_list_by_year", side_effect=by_year), \
         patch.object(inc, "get_prefiled_legislation", return_value=[]):
        inc.find_new_bill_numbers({"bills": {}})
    return calls


def _build(session, status, history="Governor signed"):
    details = {"bill_id": "HB 1001", "status": "x", "history_line": history}
    with patch.object(fab, "SESSION", session), \
         patch.object(fab, "YEAR", session["year"]), \
         patch.object(fab, "BIENNIUM", session["biennium"]), \
         patch.object(fab, "normalize_status", return_value=status):
        return fab.build_bill_dict(details, "House")


class TestMissingPriorSession(unittest.TestCase):
    """A missing or incomplete priorSession must not crash and must not
    pull in a prior-year roster or tag bills with a prior year."""

    def _sessions(self):
        base = {"year": BASE, "biennium": BIEN_NEW}
        return {
            "key absent": dict(base),
            "empty dict": {**base, "priorSession": {}},
            "year only, no biennium": {**base, "priorSession": {"year": BASE - 1}},
        }

    def test_incremental_skips_prior_year_without_crashing(self):
        for label, session in self._sessions().items():
            with self.subTest(case=label):
                self.assertEqual(_find(session), [BASE])

    def test_terminal_bill_tagged_current_year_without_crashing(self):
        for label, session in self._sessions().items():
            with self.subTest(case=label):
                self.assertEqual(_build(session, "enacted")["session"], str(BASE))


class TestEvenYearShortSessionInNewBiennium(unittest.TestCase):
    """The even year of a biennium that began at a boundary (e.g. 2028 in
    2027-28) must keep the prior-year roster and carryover tagging."""

    def test_incremental_includes_prior_year_roster(self):
        self.assertEqual(_find(NEW_SHORT), [BASE + 1, BASE])

    def test_terminal_bills_tagged_with_first_year(self):
        for status in ("enacted", "vetoed", "failed", "partial_veto"):
            with self.subTest(status=status):
                self.assertEqual(_build(NEW_SHORT, status)["session"], str(BASE))

    def test_active_bill_tagged_current_year(self):
        self.assertEqual(_build(NEW_SHORT, "committee")["session"], str(BASE + 1))

    def test_reintroduced_terminal_bill_tagged_current_year(self):
        bill = _build(NEW_SHORT, "failed", history="Reintroduced and retained")
        self.assertEqual(bill["session"], str(BASE + 1))

    def test_long_session_terminal_bill_is_not_hidden_as_prior(self):
        bill = _build(NEW_LONG, "enacted")
        self.assertNotEqual(bill["session"], str(NEW_LONG["priorSession"]["year"]))


class TestAbortLeavesDataUntouched(unittest.TestCase):
    """The abort path writes the sync log, exits nonzero, and leaves
    bills.json and the manifest byte-identical. Uses a real temp directory."""

    def test_abort_preserves_bills_json_and_writes_error_sync_log(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp) / "data"
            data.mkdir()
            bills = data / "bills.json"
            original = json.dumps({"bills": [{"id": "HB1"}]}).encode()
            bills.write_bytes(original)
            manifest = {"bills": {"HB1": {"status": "committee"}}}

            with patch.object(fab, "DATA_DIR", data), \
                 patch.object(fab, "DEBUG_DIR", Path(tmp) / "debug"), \
                 patch.object(inc, "DATA_DIR", data), \
                 patch.object(inc, "REQUEST_DELAY", 0), \
                 patch.object(inc, "load_manifest", return_value=manifest), \
                 patch.object(inc, "load_existing_bills", return_value=[{"id": "HB1"}]), \
                 patch.object(inc, "find_new_bill_numbers", return_value=list(range(60))), \
                 patch.object(inc, "get_legislation_details", return_value=None), \
                 patch.object(inc, "save_manifest") as save_manifest:
                with self.assertRaises(SystemExit) as cm:
                    inc.run_incremental()

            self.assertEqual(cm.exception.code, 1)
            self.assertEqual(bills.read_bytes(), original)
            save_manifest.assert_not_called()
            self.assertFalse((data / "stats.json").exists())
            log = json.loads((data / "sync-log.json").read_text())
            self.assertTrue(log["logs"][-1]["status"].startswith("error"))

    def test_exactly_fifty_errors_do_not_abort(self):
        """Boundary: the abort fires on the 51st error, not the 50th."""
        manifest = {"bills": {"HB1": {"status": "committee"}}}
        with patch.object(inc, "REQUEST_DELAY", 0), \
             patch.object(inc, "ensure_dirs"), \
             patch.object(inc, "load_manifest", return_value=manifest), \
             patch.object(inc, "load_existing_bills", return_value=[{"id": "HB1"}]), \
             patch.object(inc, "find_new_bill_numbers", return_value=list(range(50))), \
             patch.object(inc, "get_legislation_details", return_value=None), \
             patch.object(inc, "select_bills_for_refresh", return_value=[]), \
             patch.object(inc, "merge_bills", return_value=[]), \
             patch.object(inc, "fetch_hearings_for_bills"), \
             patch.object(inc, "save_bills_data") as save, \
             patch.object(inc, "create_stats_file"), \
             patch.object(inc, "save_manifest"), \
             patch.object(inc, "create_sync_log"):
            inc.run_incremental()  # must not raise SystemExit
        save.assert_called_once()


class TestFullModeRosterGuard(unittest.TestCase):
    """fetch_all_bills() applies the same prior-year guard as incremental."""

    def _years_requested(self, session):
        calls = []

        def by_year(y):
            calls.append(y)
            return []

        with patch.object(fab, "SESSION", session), \
             patch.object(fab, "YEAR", session["year"]), \
             patch.object(fab, "BIENNIUM", session["biennium"]), \
             patch.object(fab, "ensure_dirs"), \
             patch.object(fab, "get_legislation_list_by_year", side_effect=by_year), \
             patch.object(fab, "get_prefiled_legislation", return_value=[]):
            fab.fetch_all_bills()
        return calls

    def test_new_biennium_requests_only_current_year(self):
        self.assertEqual(self._years_requested(NEW_LONG), [BASE])

    def test_same_biennium_requests_prior_year(self):
        self.assertEqual(self._years_requested(NEW_SHORT), [BASE + 1, BASE])


if __name__ == "__main__":
    unittest.main()
