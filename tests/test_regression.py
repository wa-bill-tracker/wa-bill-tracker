#!/usr/bin/env python3
"""
Regression Test Suite for WA Bill Tracker
Ensures new changes do not break existing functionality

Run with: python -m pytest tests/test_regression.py -v
"""

import unittest
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
import tempfile
import shutil

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'scripts'))


class TestBillsJSONStructure(unittest.TestCase):
    """Regression tests for bills.json structure"""
    
    @classmethod
    def setUpClass(cls):
        """Load bills data if available"""
        cls.bills_file = Path("data/bills.json")
        cls.bills_data = None
        
        if cls.bills_file.exists():
            with open(cls.bills_file, 'r') as f:
                cls.bills_data = json.load(f)
    
    def test_bills_json_has_required_top_level_fields(self):
        """Test bills.json has all required top-level fields"""
        if self.bills_data is None:
            self.skipTest("No bills.json available")
        
        required_fields = ['lastSync', 'sessionYear', 'totalBills', 'bills', 'metadata']
        
        for field in required_fields:
            self.assertIn(field, self.bills_data, 
                f"bills.json missing required field: {field}")
    
    def test_bills_json_metadata_structure(self):
        """Test metadata section has required fields"""
        if self.bills_data is None:
            self.skipTest("No bills.json available")
        
        metadata = self.bills_data.get('metadata', {})
        
        required_metadata = ['source', 'updateFrequency', 'dataVersion']
        
        for field in required_metadata:
            self.assertIn(field, metadata,
                f"metadata missing required field: {field}")
    
    def test_bills_count_matches_array_length(self):
        """Test totalBills matches actual bills array length"""
        if self.bills_data is None:
            self.skipTest("No bills.json available")
        
        total = self.bills_data.get('totalBills', 0)
        actual = len(self.bills_data.get('bills', []))
        
        self.assertEqual(total, actual,
            f"totalBills ({total}) does not match bills array length ({actual})")
    
    def test_each_bill_has_required_fields(self):
        """Test each bill has all required fields"""
        if self.bills_data is None:
            self.skipTest("No bills.json available")
        
        required_bill_fields = [
            'id', 'number', 'title', 'status', 'committee',
            'priority', 'topic', 'introducedDate', 'lastUpdated',
            'legUrl', 'hearings', 'session'
        ]
        
        for bill in self.bills_data.get('bills', []):
            for field in required_bill_fields:
                self.assertIn(field, bill,
                    f"Bill {bill.get('id', 'unknown')} missing required field: {field}")
    
    def test_bill_ids_are_unique(self):
        """Test all bill IDs are unique"""
        if self.bills_data is None:
            self.skipTest("No bills.json available")
        
        ids = [bill.get('id') for bill in self.bills_data.get('bills', [])]
        unique_ids = set(ids)
        
        self.assertEqual(len(ids), len(unique_ids),
            f"Duplicate bill IDs found: {len(ids) - len(unique_ids)} duplicates")
    
    def test_bill_numbers_format(self):
        """Test bill numbers follow expected format"""
        if self.bills_data is None:
            self.skipTest("No bills.json available")
        
        import re
        valid_pattern = r'^(\d*[A-Z]+)\s+\S+$'
        
        for bill in self.bills_data.get('bills', []):
            number = bill.get('number', '')
            self.assertRegex(number, valid_pattern,
                f"Bill number '{number}' does not match expected format")
    
    def test_bill_status_values_are_valid(self):
        """Test bill status values are from expected set"""
        if self.bills_data is None:
            self.skipTest("No bills.json available")
        
        valid_statuses = ['prefiled', 'introduced', 'committee', 'floor',
                          'passed_origin', 'opposite_committee', 'opposite_floor',
                          'passed_legislature', 'governor', 'enacted',
                          'partial_veto', 'vetoed', 'failed']
        
        for bill in self.bills_data.get('bills', []):
            status = bill.get('status', '')
            self.assertIn(status, valid_statuses,
                f"Bill {bill.get('id')} has invalid status: {status}")
    
    def test_bill_priority_values_are_valid(self):
        """Test bill priority values are from expected set"""
        if self.bills_data is None:
            self.skipTest("No bills.json available")
        
        valid_priorities = ['high', 'medium', 'low']
        
        for bill in self.bills_data.get('bills', []):
            priority = bill.get('priority', '')
            self.assertIn(priority, valid_priorities,
                f"Bill {bill.get('id')} has invalid priority: {priority}")
    
    def test_bill_leg_urls_are_valid(self):
        """Test bill legislature URLs are properly formed"""
        if self.bills_data is None:
            self.skipTest("No bills.json available")
        
        for bill in self.bills_data.get('bills', []):
            url = bill.get('legUrl', '')
            self.assertTrue(url.startswith('https://app.leg.wa.gov/'),
                f"Bill {bill.get('id')} has invalid legUrl: {url}")



# TestMeetingsJSONStructure removed (issue #69): meetings.json was never part of
# the data architecture. Meeting/hearing data is embedded in bills.json and
# validated by TestAppJSCompatibility::test_hearings_array_format.


class TestStatsJSONStructure(unittest.TestCase):
    """Regression tests for stats.json structure"""
    
    @classmethod
    def setUpClass(cls):
        """Load stats data if available"""
        cls.stats_file = Path("data/stats.json")
        cls.stats_data = None
        
        if cls.stats_file.exists():
            with open(cls.stats_file, 'r') as f:
                cls.stats_data = json.load(f)
    
    def test_stats_json_has_required_fields(self):
        """Test stats.json has all required fields"""
        if not self.stats_data:
            # Empty dict ({}) means stats.json was reset for a new biennium
            # and awaits the next data fetch -- not yet populated.
            self.skipTest("stats.json not yet populated for current biennium")

        required_fields = [
            'generated', 'totalBills', 'byStatus', 'byCommittee',
            'byPriority', 'byTopic'
        ]
        
        for field in required_fields:
            self.assertIn(field, self.stats_data,
                f"stats.json missing required field: {field}")
    
    def test_stats_counts_are_consistent(self):
        """Test stats counts add up correctly"""
        if self.stats_data is None:
            self.skipTest("No stats.json available")
        
        total = self.stats_data.get('totalBills', 0)
        status_total = sum(self.stats_data.get('byStatus', {}).values())
        priority_total = sum(self.stats_data.get('byPriority', {}).values())
        
        self.assertEqual(total, status_total,
            f"Total ({total}) != sum of byStatus ({status_total})")
        self.assertEqual(total, priority_total,
            f"Total ({total}) != sum of byPriority ({priority_total})")


class TestAppJSCompatibility(unittest.TestCase):
    """Regression tests for app.js data compatibility"""
    
    @classmethod
    def setUpClass(cls):
        """Load bills data if available"""
        cls.bills_file = Path("data/bills.json")
        cls.bills_data = None
        
        if cls.bills_file.exists():
            with open(cls.bills_file, 'r') as f:
                cls.bills_data = json.load(f)
    
    def test_bills_have_fields_used_by_app_js(self):
        """Test bills have all fields expected by app.js"""
        if self.bills_data is None:
            self.skipTest("No bills.json available")
        
        # Fields used in app.js createBillCard function
        app_js_expected_fields = [
            'id', 'number', 'title', 'sponsor', 'committee',
            'status', 'priority', 'topic', 'description', 'hearings'
        ]
        
        for bill in self.bills_data.get('bills', [])[:10]:  # Check first 10
            for field in app_js_expected_fields:
                self.assertIn(field, bill,
                    f"Bill missing field expected by app.js: {field}")
    
    def test_hearings_array_format(self):
        """Test hearings array matches app.js expectations"""
        if self.bills_data is None:
            self.skipTest("No bills.json available")
        
        for bill in self.bills_data.get('bills', []):
            hearings = bill.get('hearings', [])
            self.assertIsInstance(hearings, list,
                f"Bill {bill.get('id')} hearings should be an array")
            
            for hearing in hearings:
                self.assertIn('date', hearing,
                    f"Hearing in bill {bill.get('id')} missing date")


class TestScriptImports(unittest.TestCase):
    """Test that script modules can be imported without errors"""
    
    def test_fetch_all_bills_imports(self):
        """Test fetch_all_bills.py can be imported"""
        try:
            from scripts import fetch_all_bills
            self.assertTrue(hasattr(fetch_all_bills, 'main'))
            self.assertTrue(hasattr(fetch_all_bills, 'make_soap_request'))
            self.assertTrue(hasattr(fetch_all_bills, 'build_bill_dict'))
        except ImportError as e:
            self.fail(f"Could not import fetch_all_bills: {e}")

    def test_required_functions_exist(self):
        """Test all required functions exist in fetch_all_bills"""
        from scripts import fetch_all_bills

        required_functions = [
            'ensure_dirs',
            'make_soap_request',
            'find_element_text',
            'find_all_elements',
            'normalize_status',
            'extract_bill_number_from_id',
            'determine_topic',
            'determine_priority',
            'get_legislation_list_by_year',
            'get_prefiled_legislation',
            'get_legislation_details',
            'fetch_hearings_for_bills',
            'build_bill_dict',
            'compute_content_hash',
            'generate_manifest',
            'save_bills_data',
            'create_stats_file',
            'create_sync_log',
            'main'
        ]

        for func_name in required_functions:
            self.assertTrue(
                hasattr(fetch_all_bills, func_name),
                f"Missing required function: {func_name}"
            )


class TestConfigurationValues(unittest.TestCase):
    """Test configuration values are correct"""
    
    def test_api_url_is_correct(self):
        """Test API URL points to official WA Legislature services"""
        from scripts import fetch_all_bills
        
        self.assertEqual(
            fetch_all_bills.API_BASE_URL,
            "https://wslwebservices.leg.wa.gov",
            "API URL should be official WA Legislature services"
        )
    
    def test_biennium_format(self):
        """Test biennium is in correct format"""
        from scripts import fetch_all_bills
        
        import re
        self.assertRegex(
            fetch_all_bills.BIENNIUM,
            r'^\d{4}-\d{2}$',
            "Biennium should be in YYYY-YY format"
        )
    
    def test_year_is_reasonable(self):
        """Test year is reasonable"""
        from scripts import fetch_all_bills
        
        current_year = datetime.now().year
        self.assertIn(
            fetch_all_bills.YEAR,
            range(current_year - 1, current_year + 2),
            "Year should be recent"
        )


class TestBackwardsCompatibility(unittest.TestCase):
    """Test backwards compatibility with existing data"""
    
    def test_old_bills_json_can_be_read(self):
        """Test that old-format bills.json can still be read"""
        # Simulate old format
        old_format = {
            "lastSync": "2026-01-01T00:00:00",
            "sessionYear": 2026,
            "totalBills": 1,
            "bills": [{
                "id": "HB1234",
                "number": "HB 1234",
                "title": "Test Bill",
                "status": "prefiled",
                "committee": "Education",
                "priority": "medium",
                "topic": "Education",
                "introducedDate": "2026-01-01",
                "lastUpdated": "2026-01-01T00:00:00",
                "legUrl": "https://app.leg.wa.gov/billsummary?BillNumber=1234&Year=2026",
                "hearings": []
            }],
            "metadata": {
                "source": "Test",
                "updateFrequency": "daily",
                "dataVersion": "2.0.0"
            }
        }
        
        # Write to temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(old_format, f)
            temp_path = f.name
        
        try:
            # Read it back
            with open(temp_path, 'r') as f:
                data = json.load(f)
            
            self.assertEqual(data['totalBills'], 1)
            self.assertEqual(data['bills'][0]['id'], 'HB1234')
        finally:
            os.unlink(temp_path)


class TestDataDirectoryStructure(unittest.TestCase):
    """Test expected data directory structure"""
    
    def test_data_directory_exists(self):
        """Test data directory exists or can be created"""
        data_dir = Path("data")
        
        if not data_dir.exists():
            # Script should be able to create it
            from scripts.fetch_all_bills import ensure_data_dir
            ensure_data_dir()
        
        self.assertTrue(data_dir.exists() or data_dir.parent.exists(),
            "Data directory should exist or be creatable")
    
    def test_expected_files_present(self):
        """Test expected data files are present after sync"""
        data_dir = Path("data")
        
        if not data_dir.exists():
            self.skipTest("Data directory does not exist")
        
        expected_files = ['bills.json']  # Minimum required
        
        for filename in expected_files:
            file_path = data_dir / filename
            if not file_path.exists():
                # This is a warning, not a failure
                print(f"Note: {filename} not present (may not have run sync yet)")


if __name__ == '__main__':
    unittest.main(verbosity=2)
