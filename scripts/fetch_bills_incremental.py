#!/usr/bin/env python3
"""
Incremental bill fetcher for the WA Bill Tracker.

Instead of re-fetching all 3,500+ bills on every run, this script:
  1. Loads the existing manifest (data/manifest.json) to know what we already have
  2. Fetches the bill roster from GetLegislationByYear to find new bills
  3. Re-fetches only stale/active bills (up to MAX_INCREMENTAL_BATCH)
  4. Merges updated bills into data/bills.json
  5. Updates the manifest

Falls back to a full fetch (via fetch_all_bills.main()) if no manifest exists.

Usage:
    python scripts/fetch_bills_incremental.py             # incremental
    python scripts/fetch_bills_incremental.py --full       # force full re-fetch
"""

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

# Import shared utilities from the full fetcher
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.fetch_all_bills import (
    API_BASE_URL,
    BIENNIUM,
    DATA_DIR,
    REQUEST_DELAY,
    SESSION,
    YEAR,
    build_bill_dict,
    compute_content_hash,
    create_stats_file,
    create_sync_log,
    ensure_dirs,
    extract_bill_number_from_id,
    fetch_hearings_for_bills,
    get_legislation_details,
    get_legislation_list_by_year,
    get_prefiled_legislation,
    get_roll_calls,
    parse_governor_action,
    save_bills_data,
)

# Terminal statuses — bills in these states rarely change
TERMINAL_STATUSES = {"enacted", "vetoed", "failed", "partial_veto"}

# Maximum bills to re-fetch per incremental run
MAX_INCREMENTAL_BATCH = 400

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Manifest I/O
# ---------------------------------------------------------------------------

def load_manifest() -> dict:
    """Load data/manifest.json, returning an empty manifest structure if missing."""
    manifest_path = DATA_DIR / "manifest.json"
    if not manifest_path.exists():
        return {}
    try:
        with open(manifest_path, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Could not read manifest: {e}")
        return {}


def save_manifest(manifest: dict):
    """Write manifest to data/manifest.json."""
    manifest_path = DATA_DIR / "manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    logger.info(f"Manifest saved ({len(manifest.get('bills', {}))} bills)")


def load_existing_bills() -> list:
    """Load the current data/bills.json and return the bills list."""
    bills_path = DATA_DIR / "bills.json"
    if not bills_path.exists():
        return []
    try:
        with open(bills_path, "r") as f:
            data = json.load(f)
        return data.get("bills", [])
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Could not read bills.json: {e}")
        return []


# ---------------------------------------------------------------------------
# Tier 1: Detect new bills
# ---------------------------------------------------------------------------

def find_new_bill_numbers(manifest: dict) -> list:
    """Return bill numbers present in the API roster but not in the manifest."""
    known_ids = set(manifest.get("bills", {}).keys())

    roster = []

    # GetLegislationByYear for current year
    year_bills = get_legislation_list_by_year(YEAR)
    logger.info(f"GetLegislationByYear({YEAR}): {len(year_bills)} bills")
    roster.extend(year_bills)

    # Also check previous year, but only within the same biennium. A new
    # biennium has no carryovers, and the prior year's roster would be
    # looked up under the wrong biennium and fail (ADO #3073).
    prior_biennium = SESSION.get("priorSession", {}).get("biennium")
    if prior_biennium == BIENNIUM:
        prev_year = YEAR - 1
        prev_bills = get_legislation_list_by_year(prev_year)
        logger.info(f"GetLegislationByYear({prev_year}): {len(prev_bills)} bills")
        roster.extend(prev_bills)
    else:
        logger.info(f"New biennium ({BIENNIUM}) -- skipping prior-year roster")

    # Prefiled legislation
    prefiled = get_prefiled_legislation()
    logger.info(f"GetPreFiledLegislationInfo: {len(prefiled)} bills")
    roster.extend(prefiled)

    # Deduplicate by bill_number
    seen = set()
    unique_numbers = []
    for entry in roster:
        bn = entry.get("bill_number")
        if bn and bn not in seen:
            seen.add(bn)
            # Check if any bill with this number is in the manifest
            # The manifest keys are IDs like "HB1001" (no space)
            bill_id = entry.get("bill_id", "").replace(" ", "")
            if bill_id not in known_ids:
                unique_numbers.append(bn)

    logger.info(f"Found {len(unique_numbers)} new bills not in manifest")
    return unique_numbers


# ---------------------------------------------------------------------------
# Tier 2: Select stale active bills for refresh
# ---------------------------------------------------------------------------

def select_bills_for_refresh(manifest: dict, max_batch: int = MAX_INCREMENTAL_BATCH) -> list:
    """Select active (non-terminal) bills to re-fetch, sorted by staleness.

    Returns a list of bill IDs (manifest keys) to refresh.
    """
    bills_meta = manifest.get("bills", {})
    candidates = []

    for bill_id, meta in bills_meta.items():
        status = meta.get("status", "")
        if status in TERMINAL_STATUSES:
            continue
        last_fetched = meta.get("lastFetched", "")
        candidates.append((bill_id, last_fetched))

    # Sort by lastFetched ascending (most stale first)
    candidates.sort(key=lambda x: x[1])

    selected = [bill_id for bill_id, _ in candidates[:max_batch]]
    logger.info(
        f"Selected {len(selected)} stale active bills for refresh "
        f"(of {len(candidates)} non-terminal)"
    )
    return selected


# ---------------------------------------------------------------------------
# Fetch and merge
# ---------------------------------------------------------------------------

def fetch_bill_by_id(bill_id: str) -> dict | None:
    """Fetch full details for a single bill by its manifest ID (e.g. 'HB1001')."""
    prefix, num = extract_bill_number_from_id(bill_id)
    if num == 0:
        return None
    time.sleep(REQUEST_DELAY)
    details = get_legislation_details(BIENNIUM, num)
    if not details or not details.get("bill_id"):
        return None

    # Determine agency
    if prefix.endswith(("HB", "HJR", "HJM", "HCR")):
        original_agency = "House"
    elif prefix.endswith(("SB", "SJR", "SJM", "SCR")):
        original_agency = "Senate"
    else:
        original_agency = prefix

    return build_bill_dict(details, original_agency)


def merge_bills(existing: list, updated: dict) -> list:
    """Merge updated bill dicts into the existing list, replacing by ID.

    Args:
        existing: Current list of bill dicts from bills.json
        updated: Dict of bill_id -> bill_dict for newly fetched bills

    Returns:
        Merged list (existing bills updated in-place + new bills appended)
    """
    result = []
    seen_ids = set()

    for bill in existing:
        bid = bill.get("id", "")
        if bid in updated:
            result.append(updated[bid])
        else:
            result.append(bill)
        seen_ids.add(bid)

    # Append truly new bills
    for bid, bill in updated.items():
        if bid not in seen_ids:
            result.append(bill)

    return result


# ---------------------------------------------------------------------------
# Main incremental flow
# ---------------------------------------------------------------------------

def run_incremental():
    """Execute an incremental fetch cycle."""
    ensure_dirs()

    manifest = load_manifest()
    if not manifest or not manifest.get("bills"):
        logger.info("No manifest found — falling back to full fetch")
        run_full()
        return

    existing_bills = load_existing_bills()
    if not existing_bills:
        logger.info("No existing bills.json — falling back to full fetch")
        run_full()
        return

    logger.info("=" * 60)
    logger.info(f"Incremental fetch — {datetime.now()}")
    logger.info(f"Manifest has {len(manifest.get('bills', {}))} bills")
    logger.info("=" * 60)

    updated_bills = {}
    errors = 0

    # --- Tier 1: New bills ---
    new_numbers = find_new_bill_numbers(manifest)
    for bn in new_numbers:
        time.sleep(REQUEST_DELAY)
        details = get_legislation_details(BIENNIUM, bn)
        if details and details.get("bill_id"):
            bill_id_raw = details["bill_id"]
            prefix, num = extract_bill_number_from_id(bill_id_raw)
            if prefix.endswith(("HB", "HJR", "HJM", "HCR")):
                agency = "House"
            elif prefix.endswith(("SB", "SJR", "SJM", "SCR")):
                agency = "Senate"
            else:
                agency = prefix
            bill = build_bill_dict(details, agency)
            updated_bills[bill["id"]] = bill
        else:
            errors += 1
            if errors > 50:
                logger.error("Too many consecutive errors — aborting")
                create_sync_log(len(existing_bills), "error: too many API failures")
                # Nonzero exit so the workflow fails instead of staying green
                sys.exit(1)

    logger.info(f"Tier 1 complete: {len(updated_bills)} new bills fetched")

    # --- Tier 2: Stale active bills ---
    # Reduce batch to leave room for new bills already fetched
    remaining_budget = max(0, MAX_INCREMENTAL_BATCH - len(updated_bills))
    stale_ids = select_bills_for_refresh(manifest, remaining_budget)

    stale_fetched = 0
    stale_changed = 0
    for bill_id in stale_ids:
        bill = fetch_bill_by_id(bill_id)
        if bill is None:
            errors += 1
            if errors > 50:
                logger.error("Too many errors — aborting stale refresh")
                break
            continue

        # Check if content actually changed
        new_hash = compute_content_hash(
            bill.get("status", ""),
            bill.get("historyLine", ""),
            bill.get("introducedDate", ""),
            bill.get("sponsor", ""),
        )
        old_hash = manifest.get("bills", {}).get(bill_id, {}).get("contentHash", "")
        stale_fetched += 1

        if new_hash != old_hash:
            updated_bills[bill["id"]] = bill
            stale_changed += 1
        else:
            # Still update lastFetched in manifest even if content unchanged
            if bill_id in manifest.get("bills", {}):
                manifest["bills"][bill_id]["lastFetched"] = datetime.now().isoformat()

    logger.info(
        f"Tier 2 complete: {stale_fetched} bills re-fetched, "
        f"{stale_changed} actually changed"
    )

    # --- Tier 3: Hearings refresh ---
    # Merge first so hearings attach to updated bills too
    merged = merge_bills(existing_bills, updated_bills)

    try:
        # Clear existing hearings before re-fetching
        for bill in merged:
            bill["hearings"] = []
        fetch_hearings_for_bills(merged)
    except Exception as e:
        logger.warning(f"Hearing fetch failed (non-fatal): {e}")

    # Populate committee from hearings
    committees_populated = 0
    for bill in merged:
        if not bill.get("committee") and bill.get("hearings"):
            bill["committee"] = bill["hearings"][-1]["committee"]
            committees_populated += 1
    logger.info(f"Populated committee for {committees_populated} bills from hearings")

    # --- Save ---
    save_bills_data(merged)
    create_stats_file(merged)

    # Update manifest
    now = datetime.now().isoformat()
    manifest["lastIncrementalSync"] = now
    manifest["billCount"] = len(merged)
    for bill in merged:
        bid = bill.get("id", "")
        content_hash = compute_content_hash(
            bill.get("status", ""),
            bill.get("historyLine", ""),
            bill.get("introducedDate", ""),
            bill.get("sponsor", ""),
        )
        if bid in updated_bills:
            manifest.setdefault("bills", {})[bid] = {
                "status": bill.get("status", ""),
                "contentHash": content_hash,
                "lastFetched": now,
            }
        elif bid not in manifest.get("bills", {}):
            # Bill existed in bills.json but not manifest — add it
            manifest.setdefault("bills", {})[bid] = {
                "status": bill.get("status", ""),
                "contentHash": content_hash,
                "lastFetched": now,
            }

    save_manifest(manifest)
    create_sync_log(len(merged), "success_incremental")

    logger.info("=" * 60)
    logger.info(f"Incremental fetch complete!")
    logger.info(f"  New bills:     {len(new_numbers)}")
    logger.info(f"  Stale checked: {stale_fetched}")
    logger.info(f"  Changed:       {stale_changed}")
    logger.info(f"  Total bills:   {len(merged)}")
    logger.info("=" * 60)


def run_full():
    """Run a full fetch via the existing fetch_all_bills script."""
    logger.info("Running full fetch via fetch_all_bills.main()...")
    from scripts.fetch_all_bills import main as full_main
    full_main()


def main():
    parser = argparse.ArgumentParser(description="Incremental WA bill fetcher")
    parser.add_argument(
        "--full",
        action="store_true",
        help="Force a full re-fetch of all bills (ignores manifest)",
    )
    args = parser.parse_args()

    if args.full:
        run_full()
    else:
        run_incremental()


if __name__ == "__main__":
    main()
