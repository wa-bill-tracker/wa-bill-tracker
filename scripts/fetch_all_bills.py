#!/usr/bin/env python3
"""
Washington State Legislature Bill Fetcher
Properly interfaces with the official WA Legislature SOAP API at wslwebservices.leg.wa.gov.
The active biennium is loaded at runtime from data/session.json.

This script uses a two-step process:
1. GetLegislationByYear to get the list of all bill IDs
2. GetLegislation for each bill to get full details (title, sponsor, description)
"""

import hashlib
import json
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
import os
from pathlib import Path
import re
from typing import Dict, List, Optional, Tuple
import time
import sys
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
API_BASE_URL = "https://wslwebservices.leg.wa.gov"
LEGISLATION_SERVICE = f"{API_BASE_URL}/LegislationService.asmx"
SPONSOR_SERVICE = f"{API_BASE_URL}/SponsorService.asmx"
COMMITTEE_SERVICE = f"{API_BASE_URL}/CommitteeService.asmx"
COMMITTEE_MEETING_SERVICE = f"{API_BASE_URL}/CommitteeMeetingService.asmx"

DATA_DIR = Path("data")
DEBUG_DIR = Path("debug")


def load_session_config():
    """Load session configuration from data/session.json."""
    config_path = DATA_DIR / "session.json"
    with open(config_path, "r") as f:
        return json.load(f)


SESSION = load_session_config()
BIENNIUM = SESSION["biennium"]
YEAR = SESSION["year"]

# XML Namespace
NS = "http://WSLWebServices.leg.wa.gov/"

# Rate limiting
REQUEST_DELAY = 0.1  # seconds between API calls
BATCH_SIZE = 50  # Number of bills to fetch details for before saving progress


def ensure_dirs():
    """Ensure required directories exist"""
    DATA_DIR.mkdir(exist_ok=True)
    DEBUG_DIR.mkdir(exist_ok=True)


def build_soap_envelope(method: str, params: Dict[str, str]) -> str:
    """Build a SOAP 1.1 envelope for the given method and parameters"""
    param_xml = "\n".join([f"      <{k}>{v}</{k}>" for k, v in params.items()])
    
    envelope = f'''<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
               xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <{method} xmlns="{NS}">
{param_xml}
    </{method}>
  </soap:Body>
</soap:Envelope>'''
    return envelope


def make_soap_request(service_url: str, method: str, params: Dict[str, str], 
                      save_debug: bool = False, debug_name: str = "") -> Optional[ET.Element]:
    """Make a SOAP request and return the parsed XML response"""
    envelope = build_soap_envelope(method, params)
    
    headers = {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": f'"{NS}{method}"'
    }
    
    try:
        response = requests.post(
            service_url,
            data=envelope.encode('utf-8'),
            headers=headers,
            timeout=60
        )
        
        if save_debug:
            debug_file = DEBUG_DIR / f"{debug_name}_request.xml"
            with open(debug_file, 'w') as f:
                f.write(envelope)
            debug_file = DEBUG_DIR / f"{debug_name}_response.xml"
            with open(debug_file, 'w') as f:
                f.write(response.text)
        
        if response.status_code != 200:
            logger.error(f"HTTP {response.status_code} for {method}")
            return None
        
        # Parse the response
        root = ET.fromstring(response.content)
        return root
        
    except requests.RequestException as e:
        logger.error(f"Request error for {method}: {e}")
        return None
    except ET.ParseError as e:
        logger.error(f"XML parse error for {method}: {e}")
        return None


def strip_namespace(tag: str) -> str:
    """Remove namespace prefix from XML tag"""
    if '}' in tag:
        return tag.split('}')[1]
    return tag


def find_element_text(element: ET.Element, path: str, default: str = "") -> str:
    """Find element text, handling namespaces"""
    # Try with namespace
    ns_path = path.replace("/", f"/{{{NS}}}").lstrip("/")
    if not ns_path.startswith("{"):
        ns_path = f"{{{NS}}}{ns_path}"
    
    elem = element.find(f".//{ns_path}")
    if elem is not None and elem.text:
        return elem.text.strip()
    
    # Try without namespace by iterating
    parts = path.split("/")
    current = element
    for part in parts:
        found = False
        for child in current:
            if strip_namespace(child.tag) == part:
                current = child
                found = True
                break
        if not found:
            return default
    
    return current.text.strip() if current.text else default


def find_all_elements(root: ET.Element, tag_name: str) -> List[ET.Element]:
    """Find all elements with the given tag name, handling namespaces"""
    results = []
    
    # Try with namespace
    results = root.findall(f".//{{{NS}}}{tag_name}")
    
    # If not found, try iterating through all elements
    if not results:
        for elem in root.iter():
            if strip_namespace(elem.tag) == tag_name:
                results.append(elem)
    
    return results


def get_legislation_list_by_year(year: int) -> List[Dict]:
    """
    Get list of all legislation for a given year.
    This returns LegislationInfo objects with basic info (BillId, BillNumber, etc.)
    """
    logger.info(f"Fetching legislation list for year {year}...")
    
    root = make_soap_request(
        LEGISLATION_SERVICE,
        "GetLegislationByYear",
        {"year": str(year)},
        save_debug=True,
        debug_name="get_legislation_by_year"
    )
    
    if root is None:
        return []
    
    bills = []
    legislation_infos = find_all_elements(root, "LegislationInfo")
    
    logger.info(f"Found {len(legislation_infos)} LegislationInfo elements")
    
    for leg_info in legislation_infos:
        bill_id = find_element_text(leg_info, "BillId")
        bill_number = find_element_text(leg_info, "BillNumber")
        biennium = find_element_text(leg_info, "Biennium")
        short_leg_type = find_element_text(leg_info, "ShortLegislationType")
        original_agency = find_element_text(leg_info, "OriginalAgency")
        active_str = find_element_text(leg_info, "Active")
        display_number = find_element_text(leg_info, "DisplayNumber")
        
        active = active_str.lower() == "true" if active_str else True
        
        if bill_id:
            bills.append({
                "bill_id": bill_id,
                "bill_number": bill_number,
                "biennium": biennium or BIENNIUM,
                "short_leg_type": short_leg_type,
                "original_agency": original_agency,
                "active": active,
                "display_number": display_number
            })
    
    return bills


def get_prefiled_legislation() -> List[Dict]:
    """Get prefiled legislation for the biennium"""
    logger.info(f"Fetching prefiled legislation for biennium {BIENNIUM}...")
    
    root = make_soap_request(
        LEGISLATION_SERVICE,
        "GetPreFiledLegislationInfo",
        {"biennium": BIENNIUM},
        save_debug=True,
        debug_name="get_prefiled"
    )
    
    if root is None:
        return []
    
    bills = []
    legislation_infos = find_all_elements(root, "LegislationInfo")
    
    logger.info(f"Found {len(legislation_infos)} prefiled LegislationInfo elements")
    
    for leg_info in legislation_infos:
        bill_id = find_element_text(leg_info, "BillId")
        bill_number = find_element_text(leg_info, "BillNumber")
        biennium = find_element_text(leg_info, "Biennium")
        short_leg_type = find_element_text(leg_info, "ShortLegislationType")
        original_agency = find_element_text(leg_info, "OriginalAgency")
        active_str = find_element_text(leg_info, "Active")
        
        active = active_str.lower() == "true" if active_str else True
        
        if bill_id:
            bills.append({
                "bill_id": bill_id,
                "bill_number": bill_number,
                "biennium": biennium or BIENNIUM,
                "short_leg_type": short_leg_type,
                "original_agency": original_agency,
                "active": active,
                "prefiled": True
            })
    
    return bills


def get_legislation_details(biennium: str, bill_number: int) -> Optional[Dict]:
    """
    Get full legislation details for a specific bill.
    This returns Legislation objects with ShortDescription, Sponsor, LongDescription, etc.
    """
    root = make_soap_request(
        LEGISLATION_SERVICE,
        "GetLegislation",
        {"biennium": biennium, "billNumber": str(bill_number)}
    )
    
    if root is None:
        return None
    
    # Find all Legislation elements (there may be multiple versions/substitutes)
    legislation_elements = find_all_elements(root, "Legislation")
    
    if not legislation_elements:
        return None
    
    # Get the first (or active) legislation element
    # The API returns multiple versions if substitutes exist
    best_leg = None
    for leg in legislation_elements:
        current_status = leg.find(f".//{{{NS}}}CurrentStatus")
        if current_status is None:
            # Try without namespace
            for child in leg:
                if strip_namespace(child.tag) == "CurrentStatus":
                    current_status = child
                    break
        
        if current_status is not None:
            bill_id = find_element_text(current_status, "BillId")
            status = find_element_text(current_status, "Status")
            history_line = find_element_text(current_status, "HistoryLine")
            action_date = find_element_text(current_status, "ActionDate")
            
            # Get the details from this legislation element
            short_desc = find_element_text(leg, "ShortDescription")
            long_desc = find_element_text(leg, "LongDescription")
            sponsor = find_element_text(leg, "Sponsor")
            legal_title = find_element_text(leg, "LegalTitle")
            introduced_date = find_element_text(leg, "IntroducedDate")
            prime_sponsor_id = find_element_text(leg, "PrimeSponsorID")
            requested_by_governor = find_element_text(leg, "RequestedByGovernor")
            
            result = {
                "bill_id": bill_id,
                "short_description": short_desc,
                "long_description": long_desc,
                "sponsor": sponsor,
                "legal_title": legal_title,
                "introduced_date": introduced_date,
                "prime_sponsor_id": prime_sponsor_id,
                "status": status,
                "history_line": history_line,
                "action_date": action_date,
                "requested_by_governor": requested_by_governor.lower() == "true" if requested_by_governor else False
            }
            
            # Prefer active versions
            if best_leg is None:
                best_leg = result
            elif bill_id and not bill_id.startswith("O"):  # Original/engrossed versions preferred
                best_leg = result
    
    return best_leg


def get_roll_calls(biennium: str, bill_number: int) -> List[Dict]:
    """Fetch roll call votes for a bill from the LegislationService."""
    root = make_soap_request(
        LEGISLATION_SERVICE,
        "GetRollCalls",
        {"biennium": biennium, "billNumber": str(bill_number)}
    )

    time.sleep(REQUEST_DELAY)

    if root is None:
        return []

    roll_calls = []
    try:
        rc_elements = find_all_elements(root, "RollCall")

        for rc in rc_elements:
            agency_text = find_element_text(rc, "Agency")
            motion_text = find_element_text(rc, "Motion")
            vote_date = find_element_text(rc, "VoteDate")
            yea_count = find_element_text(rc, "YeaVotes/Count", "0")
            nay_count = find_element_text(rc, "NayVotes/Count", "0")
            absent_count = find_element_text(rc, "AbsentVotes/Count", "0")
            excused_count = find_element_text(rc, "ExcusedVotes/Count", "0")

            roll_calls.append({
                "chamber": agency_text,
                "date": vote_date[:10] if vote_date else "",
                "motion": motion_text,
                "yeas": int(yea_count),
                "nays": int(nay_count),
                "absent": int(absent_count),
                "excused": int(excused_count),
                "passed": int(yea_count) > int(nay_count)
            })
    except Exception as e:
        logger.warning(f"Failed to parse roll calls for bill {bill_number}: {e}")
        return []

    return roll_calls


def parse_governor_action(history_line: str) -> Optional[dict]:
    """Parse governor action details from bill history line."""
    if not history_line:
        return None

    history_lower = history_line.lower()

    if "partial veto" in history_lower:
        status = "partial_veto"
    elif "veto" in history_lower:
        status = "vetoed"
    elif "governor signed" in history_lower or "signed by governor" in history_lower:
        status = "signed"
    elif "delivered to governor" in history_lower:
        status = "awaiting"
    else:
        return None

    # Try to extract a date from the history line (common format: MM/DD/YYYY or YYYY-MM-DD)
    delivered_date = ""
    signed_date = ""
    date_match = re.search(r'(\d{1,2}/\d{1,2}/\d{4}|\d{4}-\d{2}-\d{2})', history_line)
    date_str = date_match.group(1) if date_match else ""

    if status == "awaiting" and date_str:
        delivered_date = date_str
    elif status in ("signed", "partial_veto") and date_str:
        signed_date = date_str

    return {
        "status": status,
        "deliveredDate": delivered_date,
        "signedDate": signed_date,
    }


def extract_bill_number_from_id(bill_id: str) -> Tuple[str, int]:
    """
    Extract the bill type prefix and numeric bill number from a bill ID.
    Examples: 
        'HB 1001' -> ('HB', 1001)
        '2SHB 1037' -> ('2SHB', 1037)
        'ESHB 1234' -> ('ESHB', 1234)
        'HB1001' -> ('HB', 1001)
    """
    bill_id = bill_id.strip()
    
    # Try splitting on space first
    parts = bill_id.split()
    if len(parts) >= 2:
        try:
            return parts[0], int(parts[-1])
        except ValueError:
            pass
    
    # Handle no space - find where letters end and numbers begin
    # Pattern: letters/digits prefix followed by pure digits
    match = re.match(r'^([A-Z0-9]*[A-Z])(\d+)$', bill_id)
    if match:
        return match.group(1), int(match.group(2))
    
    # Handle format like "2SHB1037" - prefix can have leading digit
    match = re.match(r'^(\d*[A-Z]+)(\d+)$', bill_id)
    if match:
        return match.group(1), int(match.group(2))
    
    # Last resort - find number at end
    match = re.search(r'(\d+)$', bill_id)
    if match:
        prefix = bill_id[:match.start()].strip()
        return prefix, int(match.group(1))
    
    return bill_id, 0


def determine_topic(title: str) -> str:
    """Determine bill topic from title keywords"""
    if not title:
        return "General Government"
    
    title_lower = title.lower()
    
    # Order matters - check more specific topics first
    topic_keywords = {
        "Technology": ["technology", "internet", "data", "privacy", "cyber", "artificial intelligence", "broadband", "digital"],
        "Education": ["education", "school", "student", "teacher", "college", "university", "learning", "eceap"],
        "Tax & Revenue": ["tax", "revenue", "budget", "fiscal", "levy", "assessment"],
        "Housing": ["housing", "rent", "tenant", "landlord", "zoning", "homeless", "dwelling"],
        "Healthcare": ["health", "medical", "hospital", "mental", "behavioral", "insurance", "pharmacy", "drug"],
        "Environment": ["environment", "climate", "energy", "pollution", "water", "salmon", "forest", "wildlife"],
        "Transportation": ["transport", "road", "highway", "transit", "ferry", "vehicle", "driver", "traffic"],
        "Public Safety": ["crime", "police", "safety", "justice", "court", "prison", "emergency", "fire"],
        "Business": ["business", "commerce", "trade", "economy", "license", "employment", "worker", "labor"],
        "Agriculture": ["farm", "agriculture", "livestock", "crop", "food"],
        "Social Services": ["child", "family", "welfare", "benefit", "assistance", "disability"],
    }
    
    for topic, keywords in topic_keywords.items():
        if any(kw in title_lower for kw in keywords):
            return topic
    
    return "General Government"


def determine_priority(title: str, requested_by_governor: bool = False,
                       bill_prefix: str = "") -> str:
    """Determine bill priority based on keywords, bill type, and source.

    Signals (checked in order):
      1. Governor-requested bills → high
      2. Joint memorials / concurrent resolutions → low (ceremonial)
      3. Keyword match in title → high or low
      4. Default → medium

    Args:
        title: Short description / title of the bill.
        requested_by_governor: Whether the governor requested the bill.
        bill_prefix: Bill type prefix, e.g. "HB", "SJM", "HCR".
    """
    if requested_by_governor:
        return "high"

    # Joint memorials and concurrent resolutions are ceremonial / low priority
    if bill_prefix.upper().endswith(("JM", "CR")):
        return "low"

    if not title:
        return "medium"

    title_lower = title.lower()

    high_keywords = [
        "emergency", "budget", "funding", "safety", "crisis", "urgent",
        "appropriation", "revenue", "public safety", "health care",
        "education funding", "housing", "transportation",
        "child welfare", "fentanyl", "opioid", "homelessness",
    ]
    low_keywords = [
        "technical", "clarifying", "housekeeping", "minor", "study", "report",
        "commemorat", "proclaim", "memorializ", "designat", "renam",
        "recogni", "joint memorial",
    ]

    if any(kw in title_lower for kw in high_keywords):
        return "high"
    if any(kw in title_lower for kw in low_keywords):
        return "low"

    return "medium"


def normalize_status(status: str, history_line: str = "", original_agency: str = "") -> str:
    """
    Normalize status to standard values reflecting the full legislative lifecycle.

    Possible return values (in progression order):
      prefiled, introduced, committee, floor,
      passed_origin, opposite_committee, opposite_floor,
      passed_legislature, governor, enacted,
      vetoed, failed
    """
    status_lower = (status or "").lower().strip()
    history_lower = (history_line or "").lower()
    agency_lower = (original_agency or "").lower()

    # Determine the opposite chamber name for cross-chamber detection.
    # The WA API status field uses a chamber prefix: "H " for House, "S " for Senate
    # (e.g., "S Ways & Means" = Senate committee, "H Approps" = House committee).
    if "house" in agency_lower:
        opposite = "senate"
        origin_prefix = "h "
        opposite_prefix = "s "
    elif "senate" in agency_lower:
        opposite = "house"
        origin_prefix = "s "
        opposite_prefix = "h "
    else:
        opposite = ""
        origin_prefix = ""
        opposite_prefix = ""

    # --- Post-legislature stages (check first, most specific) ---
    if history_lower:
        if "effective date" in history_lower:
            return "enacted"
        if "governor signed" in history_lower or "signed by governor" in history_lower:
            return "enacted"
        # "C 123 L 2025" pattern = chapter law reference
        if re.match(r'c \d+ l \d{4}', history_lower):
            return "enacted"
        if "delivered to governor" in history_lower or "governor's desk" in history_lower:
            return "governor"
        if "veto" in history_lower:
            return "vetoed"
        if "died" in history_lower or "failed" in history_lower:
            return "failed"

    # --- Cross-chamber detection via API status prefix ---
    # The API status field reliably indicates which chamber the bill is in.
    # A House bill with status "S ..." is in the Senate (opposite chamber).
    if opposite_prefix and status_lower.startswith(opposite_prefix):
        # Bill is in the opposite chamber — determine committee vs floor stage
        if any(kw in status_lower for kw in ["rules", "2nd reading", "3rd reading"]):
            return "opposite_floor"
        # "Third reading, passed" in opposite chamber = passed legislature
        if "third reading" in history_lower and "passed" in history_lower:
            return "passed_legislature"
        return "opposite_committee"

    # --- Cross-chamber / passed stages (history-based fallback) ---
    if history_lower:
        # Both chambers mentioned in "passed" context = passed legislature
        if "passed" in history_lower and "house" in history_lower and "senate" in history_lower:
            return "passed_legislature"

        # "Third reading, passed" = passed a chamber floor vote
        if "third reading" in history_lower and "passed" in history_lower:
            # If the history also references the opposite chamber, the bill crossed over
            if opposite and opposite in history_lower:
                return "opposite_floor"
            return "passed_origin"

        # Detect cross-chamber referral: origin=House but "referred to Senate ..."
        if opposite and f"referred to {opposite}" in history_lower:
            return "opposite_committee"

    # --- Origin chamber stages ---
    if status_lower:
        if "passed" in status_lower:
            return "passed_origin"
        if "committee" in status_lower:
            return "committee"
        if "introduced" in status_lower:
            return "introduced"
        if "prefiled" in status_lower or "pre-filed" in status_lower:
            return "prefiled"

    if history_lower:
        if "referred to" in history_lower:
            return "committee"
        if "first reading" in history_lower:
            return "introduced"
        if "second reading" in history_lower or "third reading" in history_lower:
            return "floor"
        if "rules committee" in history_lower or "placed on" in history_lower:
            return "floor"
        if "passed" in history_lower:
            return "passed_origin"

    return "prefiled"


def format_bill_number(bill_id: str) -> str:
    """Format bill ID to display number (e.g., 'HB1001' -> 'HB 1001')"""
    # Already has space
    if ' ' in bill_id:
        return bill_id
    
    # Handle complex prefixes like 2SHB1037, ESHB1234, 2SSB5001
    # Pattern: optional leading digits, letters, then the bill number
    match = re.match(r'^(\d*[A-Z]+)(\d+)$', bill_id)
    if match:
        return f"{match.group(1)} {match.group(2)}"
    
    # Simple format like HB1001
    match = re.match(r'^([A-Z]+)(\d+)$', bill_id)
    if match:
        return f"{match.group(1)} {match.group(2)}"
    
    return bill_id


def get_leg_url(bill_number: int, bill_type: str = "") -> str:
    """Generate the leg.wa.gov URL for a bill"""
    return f"https://app.leg.wa.gov/billsummary?BillNumber={bill_number}&Year={YEAR}"


def compute_content_hash(status: str, history_line: str, action_date: str, sponsor: str) -> str:
    """Compute a short hash of bill content fields for change detection.

    Used by the incremental fetcher to determine if a bill's data has changed
    since the last fetch without doing a full deep comparison.
    """
    content = f"{status}|{history_line}|{action_date}|{sponsor}"
    return hashlib.md5(content.encode()).hexdigest()[:8]


def build_bill_dict(details: Dict, original_agency: str) -> Dict:
    """Build a standardized bill dictionary from API details.

    Extracts and normalizes fields from the raw API response into
    the format used by bills.json. Shared by both the full fetcher
    and the incremental fetcher.

    Args:
        details: Raw bill details from get_legislation_details()
        original_agency: 'House' or 'Senate' based on bill prefix

    Returns:
        A bill dict ready for inclusion in bills.json
    """
    bill_id = details["bill_id"]
    prefix, num = extract_bill_number_from_id(bill_id)

    title = details.get("short_description") or details.get("long_description") or "No title available"
    sponsor = details.get("sponsor") or "Unknown"
    status = normalize_status(
        details.get("status", ""),
        details.get("history_line", ""),
        original_agency
    )

    history_line = details.get("history_line", "")
    introduced_date = details.get("introduced_date", "")[:10] if details.get("introduced_date") else ""

    # Determine which session this bill belongs to.
    # Within a single biennium (e.g. a long session followed by the next
    # year's short session), bills enacted/vetoed/failed in the prior year
    # are not active this year, unless "reintroduced and retained".
    # At the start of a new biennium there is no carryover -- every bill
    # belongs to the current year.
    prior_year = SESSION.get("priorSession", {}).get("year")
    if prior_year and str(YEAR - 1) == str(prior_year):
        # Same biennium -- check for carryovers
        terminal = status in ("enacted", "vetoed", "failed", "partial_veto")
        reintroduced = "reintroduced" in history_line.lower()
        if terminal and not reintroduced:
            session = str(prior_year)
        else:
            session = str(YEAR)
    else:
        # New biennium -- no carryovers, all bills belong to current year
        session = str(YEAR)

    bill_dict = {
        "id": bill_id.replace(" ", ""),
        "number": format_bill_number(bill_id),
        "title": title,
        "sponsor": sponsor,
        "description": details.get("long_description") or f"A bill relating to {title.lower()}",
        "status": status,
        "committee": "",  # Populated from hearing data
        "priority": determine_priority(title, details.get("requested_by_governor", False), prefix),
        "topic": determine_topic(title),
        "introducedDate": introduced_date,
        "lastUpdated": datetime.now().isoformat(),
        "legUrl": get_leg_url(num, prefix),
        "hearings": [],
        "active": True,
        "biennium": BIENNIUM,
        "session": session,
        "originalAgency": original_agency,
        "historyLine": history_line,
        "votes": [],
    }

    # Fetch votes for bills that have passed at least one chamber
    vote_statuses = ("passed_origin", "opposite_committee", "opposite_floor",
                     "passed_legislature", "governor", "enacted")
    if status in vote_statuses:
        bill_num = int(num)
        votes = get_roll_calls(BIENNIUM, bill_num)
        bill_dict["votes"] = votes
    else:
        bill_dict["votes"] = []

    # Parse governor action
    governor_action = parse_governor_action(history_line)
    if governor_action:
        bill_dict["governorAction"] = governor_action

    return bill_dict


def get_committee_meetings(begin_date: str, end_date: str) -> List[Dict]:
    """
    Fetch committee meetings within a date range using CommitteeMeetingService.
    Returns a list of meeting dicts with agendaId, date, committee name, etc.
    """
    logger.info(f"Fetching committee meetings from {begin_date} to {end_date}...")

    root = make_soap_request(
        COMMITTEE_MEETING_SERVICE,
        "GetCommitteeMeetings",
        {
            "beginDate": f"{begin_date}T00:00:00",
            "endDate": f"{end_date}T23:59:59"
        }
    )

    if root is None:
        return []

    meetings = []
    meeting_elements = find_all_elements(root, "CommitteeMeeting")

    for elem in meeting_elements:
        cancelled = find_element_text(elem, "Cancelled")
        if cancelled.lower() == "true":
            continue

        agenda_id = find_element_text(elem, "AgendaId")
        date_str = find_element_text(elem, "Date")
        agency = find_element_text(elem, "Agency")
        room = find_element_text(elem, "Room")

        # Get committee name from nested Committees/Committee/LongName
        committee_name = ""
        committees_elem = None
        for child in elem:
            if strip_namespace(child.tag) == "Committees":
                committees_elem = child
                break
        if committees_elem is not None:
            for child in committees_elem:
                if strip_namespace(child.tag) == "Committee":
                    committee_name = find_element_text(child, "LongName")
                    if not committee_name:
                        committee_name = find_element_text(child, "Name")
                    break

        if agenda_id:
            meetings.append({
                "agendaId": int(agenda_id),
                "date": date_str[:10] if date_str else "",
                "time": date_str[11:16] if date_str and len(date_str) > 11 else "",
                "committee": committee_name or agency,
                "room": room,
                "agency": agency
            })

    logger.info(f"Found {len(meetings)} non-cancelled committee meetings")
    return meetings


def get_meeting_agenda_items(agenda_id: int) -> List[Dict]:
    """
    Fetch the agenda items (bills) for a specific committee meeting.
    Returns a list of dicts with billId, hearingType, description.
    """
    root = make_soap_request(
        COMMITTEE_MEETING_SERVICE,
        "GetCommitteeMeetingItems",
        {"agendaId": str(agenda_id)}
    )

    if root is None:
        return []

    items = []
    item_elements = find_all_elements(root, "CommitteeMeetingItem")

    for elem in item_elements:
        bill_id = find_element_text(elem, "BillId")
        if not bill_id:
            continue
        hearing_type = find_element_text(elem, "HearingTypeDescription")
        items.append({
            "billId": bill_id.replace(" ", ""),
            "hearingType": hearing_type
        })

    return items


def fetch_hearings_for_bills(bills: List[Dict]) -> None:
    """
    Fetch upcoming committee hearings and attach them to matching bills.
    Modifies bills in-place by populating the 'hearings' field.
    This runs as a separate step after all bills are collected.
    """
    today = datetime.now()
    # Look 30 days ahead for upcoming hearings
    end_date = today + timedelta(days=30)
    begin_str = today.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")

    try:
        meetings = get_committee_meetings(begin_str, end_str)
    except Exception as e:
        logger.warning(f"Failed to fetch committee meetings (non-fatal): {e}")
        return

    if not meetings:
        logger.info("No upcoming committee meetings found")
        return

    # Build lookups: exact ID match + base bill number (e.g., 5124) fallback.
    # Agenda items may use a different version prefix (ESSB vs SSB) than what
    # we have stored, so we normalize to the numeric bill number for matching.
    bill_lookup = {b["id"]: b for b in bills}
    bill_by_number = {}
    for b in bills:
        _, num = extract_bill_number_from_id(b["id"])
        if num:
            bill_by_number[num] = b

    hearings_attached = 0

    for meeting in meetings:
        time.sleep(REQUEST_DELAY)

        try:
            items = get_meeting_agenda_items(meeting["agendaId"])
        except Exception as e:
            logger.warning(f"Failed to fetch agenda {meeting['agendaId']} (non-fatal): {e}")
            continue

        for item in items:
            bill = bill_lookup.get(item["billId"])
            if bill is None:
                _, num = extract_bill_number_from_id(item["billId"])
                bill = bill_by_number.get(num) if num else None
            if bill is not None:
                bill["hearings"].append({
                    "date": meeting["date"],
                    "time": meeting["time"],
                    "committee": meeting["committee"],
                    "room": meeting["room"],
                    "hearingType": item["hearingType"]
                })
                hearings_attached += 1

    logger.info(f"Attached {hearings_attached} hearing entries to bills")


def fetch_all_bills() -> List[Dict]:
    """Main function to fetch all bills with full details"""
    logger.info("=" * 60)
    logger.info(f"Starting WA Legislature Bill Fetcher - {datetime.now()}")
    logger.info(f"Biennium: {BIENNIUM}, Year: {YEAR}")
    logger.info("=" * 60)
    
    ensure_dirs()
    
    all_bill_info = {}
    
    # Step 1: Get list of all bills from GetLegislationByYear
    year_bills = get_legislation_list_by_year(YEAR)
    logger.info(f"GetLegislationByYear returned {len(year_bills)} bills")
    
    for bill in year_bills:
        key = bill.get("bill_number") or bill.get("bill_id")
        if key:
            all_bill_info[key] = bill
    
    # Step 2: Get prefiled legislation
    prefiled_bills = get_prefiled_legislation()
    logger.info(f"GetPreFiledLegislationInfo returned {len(prefiled_bills)} bills")
    
    for bill in prefiled_bills:
        key = bill.get("bill_number") or bill.get("bill_id")
        if key:
            if key not in all_bill_info:
                all_bill_info[key] = bill
            else:
                all_bill_info[key]["prefiled"] = True
    
    # Also try previous year for carryover bills, but only within the same
    # biennium -- a new biennium has no carryovers.
    prior_biennium = SESSION.get("priorSession", {}).get("biennium")
    if prior_biennium == BIENNIUM:
        prev_year_bills = get_legislation_list_by_year(YEAR - 1)
        logger.info(f"GetLegislationByYear ({YEAR - 1}) returned {len(prev_year_bills)} bills")
    else:
        prev_year_bills = []
        logger.info(f"New biennium ({BIENNIUM}) -- skipping prior-year carryover fetch")
    
    for bill in prev_year_bills:
        key = bill.get("bill_number") or bill.get("bill_id")
        if key and key not in all_bill_info:
            all_bill_info[key] = bill
    
    logger.info(f"Total unique bills found: {len(all_bill_info)}")
    
    # Step 3: Get full details for each bill
    # This is the key step that gets titles, sponsors, descriptions
    logger.info("Fetching full details for each bill...")
    
    final_bills = []
    processed = 0
    failed = 0
    
    # Get unique bill numbers
    bill_numbers_to_fetch = set()
    for key, info in all_bill_info.items():
        bill_num = info.get("bill_number")
        if bill_num:
            try:
                num = int(bill_num)
                bill_numbers_to_fetch.add(num)
            except ValueError:
                # Try extracting from bill_id
                _, num = extract_bill_number_from_id(info.get("bill_id", ""))
                if num:
                    bill_numbers_to_fetch.add(num)
    
    logger.info(f"Fetching details for {len(bill_numbers_to_fetch)} unique bill numbers...")
    
    for i, bill_num in enumerate(sorted(bill_numbers_to_fetch)):
        if i > 0 and i % 100 == 0:
            logger.info(f"Progress: {i}/{len(bill_numbers_to_fetch)} bills processed")
        
        # Add rate limiting
        time.sleep(REQUEST_DELAY)
        
        details = get_legislation_details(BIENNIUM, bill_num)
        
        if details and details.get("bill_id"):
            bill_id = details["bill_id"]
            prefix, num = extract_bill_number_from_id(bill_id)

            # Determine chamber/agency from bill prefix (needed for status detection)
            if prefix.endswith("HB") or prefix.endswith("HJR") or prefix.endswith("HJM") or prefix.endswith("HCR"):
                original_agency = "House"
            elif prefix.endswith("SB") or prefix.endswith("SJR") or prefix.endswith("SJM") or prefix.endswith("SCR"):
                original_agency = "Senate"
            else:
                original_agency = prefix

            bill = build_bill_dict(details, original_agency)
            final_bills.append(bill)
            processed += 1
        else:
            failed += 1
            logger.debug(f"No details found for bill number {bill_num}")
    
    logger.info(f"Successfully processed {processed} bills, {failed} failed")

    # Step 4: Fetch upcoming hearings and attach to bills
    # This is additive only — if it fails, bills are still returned without hearings
    try:
        fetch_hearings_for_bills(final_bills)
    except Exception as e:
        logger.warning(f"Hearing fetch failed (non-fatal, bills unaffected): {e}")

    # Step 5: Populate top-level committee field from hearing data
    # The API does not provide a current committee assignment directly,
    # so we derive it from the most recent hearing's committee name.
    committees_populated = 0
    for bill in final_bills:
        if not bill.get("committee") and bill.get("hearings"):
            bill["committee"] = bill["hearings"][-1]["committee"]
            committees_populated += 1
    logger.info(f"Populated committee field for {committees_populated} bills from hearing data")

    return final_bills


def save_bills_data(bills: List[Dict]) -> Dict:
    """Save bills data to JSON file"""
    # Sort bills by type then number
    def sort_key(b):
        prefix, num = extract_bill_number_from_id(b.get("number", ""))
        # Sort order: HB, SB, HJR, SJR, HJM, SJM, HCR, SCR, other
        type_order = {"HB": 1, "SB": 2, "HJR": 3, "SJR": 4, "HJM": 5, "SJM": 6, "HCR": 7, "SCR": 8}
        # Handle prefixes like 2SHB, ESHB, etc.
        base_type = prefix[-2:] if len(prefix) >= 2 else prefix
        return (type_order.get(base_type, 99), num)
    
    bills.sort(key=sort_key)
    
    data = {
        "lastSync": datetime.now().isoformat(),
        "sessionYear": YEAR,
        "sessionStart": SESSION.get("sessionStart", ""),
        "sessionEnd": SESSION.get("sessionEnd", ""),
        "biennium": BIENNIUM,
        "totalBills": len(bills),
        "bills": bills,
        "metadata": {
            "source": "Washington State Legislature Web Services",
            "apiEndpoint": API_BASE_URL,
            "updateFrequency": "daily",
            "dataVersion": "3.0.0"
        }
    }
    
    data_file = DATA_DIR / "bills.json"
    with open(data_file, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    logger.info(f"Saved {len(bills)} bills to {data_file}")
    return data


def create_stats_file(bills: List[Dict]):
    """Create comprehensive statistics file"""
    stats = {
        "generated": datetime.now().isoformat(),
        "totalBills": len(bills),
        "byStatus": {},
        "byCommittee": {},
        "byPriority": {},
        "byTopic": {},
        "bySponsor": {},
        "byType": {},
        "byAgency": {},
        "recentlyUpdated": 0,
        "updatedToday": 0
    }
    
    today = datetime.now().date()
    
    for bill in bills:
        # By status
        status = bill.get('status', 'unknown')
        stats['byStatus'][status] = stats['byStatus'].get(status, 0) + 1
        
        # By committee
        committee = bill.get('committee') or 'Unassigned'
        stats['byCommittee'][committee] = stats['byCommittee'].get(committee, 0) + 1
        
        # By priority
        priority = bill.get('priority', 'unknown')
        stats['byPriority'][priority] = stats['byPriority'].get(priority, 0) + 1
        
        # By topic
        topic = bill.get('topic', 'unknown')
        stats['byTopic'][topic] = stats['byTopic'].get(topic, 0) + 1
        
        # By sponsor
        sponsor = bill.get('sponsor', 'unknown')
        stats['bySponsor'][sponsor] = stats['bySponsor'].get(sponsor, 0) + 1
        
        # By type
        prefix, _ = extract_bill_number_from_id(bill.get('number', ''))
        base_type = prefix[-2:] if len(prefix) >= 2 else prefix
        stats['byType'][base_type] = stats['byType'].get(base_type, 0) + 1
        
        # By original agency (chamber)
        agency = bill.get('originalAgency', 'Unknown')
        stats['byAgency'][agency] = stats['byAgency'].get(agency, 0) + 1
        
        # Recently updated
        try:
            last_updated = datetime.fromisoformat(bill.get('lastUpdated', '').replace('Z', '+00:00'))
            if last_updated.date() == today:
                stats['updatedToday'] += 1
            if (datetime.now() - last_updated.replace(tzinfo=None)).days < 7:
                stats['recentlyUpdated'] += 1
        except (ValueError, TypeError):
            pass
    
    # Top sponsors
    stats['topSponsors'] = sorted(
        stats['bySponsor'].items(),
        key=lambda x: x[1],
        reverse=True
    )[:20]
    
    stats_file = DATA_DIR / "stats.json"
    with open(stats_file, 'w') as f:
        json.dump(stats, f, indent=2)
    
    logger.info(f"Statistics saved to {stats_file}")
    logger.info(f"  - {len(stats['byStatus'])} statuses")
    logger.info(f"  - {len(stats['byTopic'])} topics")
    logger.info(f"  - {len(stats['bySponsor'])} unique sponsors")


def generate_manifest(bills: List[Dict]):
    """Generate data/manifest.json from the current bill dataset.

    The manifest records per-bill state (status, history, sponsor hash)
    so the incremental fetcher can detect which bills have changed.
    """
    now = datetime.now().isoformat()
    manifest = {
        "lastFullSync": now,
        "lastIncrementalSync": now,
        "billCount": len(bills),
        "bills": {}
    }

    for bill in bills:
        bill_id = bill.get("id", "")
        content_hash = compute_content_hash(
            bill.get("status", ""),
            bill.get("historyLine", ""),
            bill.get("introducedDate", ""),
            bill.get("sponsor", "")
        )
        manifest["bills"][bill_id] = {
            "status": bill.get("status", ""),
            "contentHash": content_hash,
            "lastFetched": now
        }

    manifest_file = DATA_DIR / "manifest.json"
    with open(manifest_file, 'w') as f:
        json.dump(manifest, f, indent=2)

    logger.info(f"Manifest saved to {manifest_file} ({len(manifest['bills'])} bills)")


def create_sync_log(bills_count: int, status: str = "success"):
    """Create sync log entry"""
    log = {
        "timestamp": datetime.now().isoformat(),
        "status": status,
        "billsCount": bills_count,
        "biennium": BIENNIUM,
        "year": YEAR
    }
    
    log_file = DATA_DIR / "sync-log.json"
    
    logs = []
    if log_file.exists():
        try:
            with open(log_file, 'r') as f:
                data = json.load(f)
                logs = data.get('logs', [])
        except (json.JSONDecodeError, IOError):
            pass
    
    logs.insert(0, log)
    logs = logs[:100]  # Keep last 100 entries
    
    with open(log_file, 'w') as f:
        json.dump({"logs": logs}, f, indent=2)
    
    logger.info(f"Sync log updated: {status} - {bills_count} bills")


def main():
    """Main execution function"""
    try:
        # Fetch all bills with full details
        bills = fetch_all_bills()
        
        if not bills:
            logger.error("No bills fetched - check API connectivity")
            create_sync_log(0, "error")
            sys.exit(1)
        
        # Save data
        save_bills_data(bills)
        
        # Create statistics
        create_stats_file(bills)

        # Generate manifest for incremental fetch support
        generate_manifest(bills)

        # Create sync log
        create_sync_log(len(bills), "success")
        
        logger.info("=" * 60)
        logger.info(f"Completed successfully!")
        logger.info(f"Total bills: {len(bills)}")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        import traceback
        traceback.print_exc()
        create_sync_log(0, f"error: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
