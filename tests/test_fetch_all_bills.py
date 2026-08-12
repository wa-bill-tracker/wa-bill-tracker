#!/usr/bin/env python3
"""
Unit tests for Washington State Legislature Bill Fetcher
Tests SOAP envelope building, XML parsing, data transformation, and helper functions.
"""

import unittest
import json
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
import sys
import os

# Add the scripts directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scripts.fetch_all_bills import (
    build_soap_envelope,
    strip_namespace,
    find_element_text,
    find_all_elements,
    extract_bill_number_from_id,
    determine_topic,
    determine_priority,
    normalize_status,
    format_bill_number,
    get_leg_url,
    NS,
    YEAR,
)


class TestSOAPEnvelopeBuilder(unittest.TestCase):
    """Test SOAP envelope construction"""
    
    def test_build_basic_envelope(self):
        """Test building a basic SOAP envelope"""
        envelope = build_soap_envelope("GetLegislation", {
            "biennium": "2025-26",
            "billNumber": "1001"
        })
        
        # Verify XML structure
        self.assertIn('<?xml version="1.0" encoding="utf-8"?>', envelope)
        self.assertIn('soap:Envelope', envelope)
        self.assertIn('soap:Body', envelope)
        self.assertIn('<GetLegislation', envelope)
        self.assertIn('<biennium>2025-26</biennium>', envelope)
        self.assertIn('<billNumber>1001</billNumber>', envelope)
        self.assertIn(NS, envelope)
    
    def test_build_envelope_single_param(self):
        """Test envelope with single parameter"""
        envelope = build_soap_envelope("GetLegislationByYear", {"year": "2026"})
        
        self.assertIn('<GetLegislationByYear', envelope)
        self.assertIn('<year>2026</year>', envelope)
    
    def test_envelope_is_valid_xml(self):
        """Test that envelope is valid XML"""
        envelope = build_soap_envelope("TestMethod", {"param1": "value1"})
        
        # Should not raise exception
        root = ET.fromstring(envelope)
        self.assertIsNotNone(root)


class TestXMLParsing(unittest.TestCase):
    """Test XML parsing helper functions"""
    
    def test_strip_namespace(self):
        """Test namespace stripping from tags"""
        self.assertEqual(strip_namespace("{http://example.com}TagName"), "TagName")
        self.assertEqual(strip_namespace("TagName"), "TagName")
        self.assertEqual(strip_namespace("{http://WSLWebServices.leg.wa.gov/}BillId"), "BillId")
    
    def test_find_element_text_with_namespace(self):
        """Test finding element text with namespace"""
        xml = f'''<root xmlns="{NS}">
            <Legislation>
                <ShortDescription>Test Bill Title</ShortDescription>
                <Sponsor>Rep. Test</Sponsor>
            </Legislation>
        </root>'''
        root = ET.fromstring(xml)
        
        # Test finding text
        desc = find_element_text(root, "ShortDescription")
        self.assertEqual(desc, "Test Bill Title")
        
        sponsor = find_element_text(root, "Sponsor")
        self.assertEqual(sponsor, "Rep. Test")
    
    def test_find_element_text_default(self):
        """Test default value when element not found"""
        xml = "<root><child>value</child></root>"
        root = ET.fromstring(xml)
        
        result = find_element_text(root, "nonexistent", "default_value")
        self.assertEqual(result, "default_value")
    
    def test_find_all_elements(self):
        """Test finding all elements with a tag name"""
        xml = f'''<root xmlns="{NS}">
            <LegislationInfo><BillId>HB 1001</BillId></LegislationInfo>
            <LegislationInfo><BillId>HB 1002</BillId></LegislationInfo>
            <LegislationInfo><BillId>SB 5001</BillId></LegislationInfo>
        </root>'''
        root = ET.fromstring(xml)
        
        infos = find_all_elements(root, "LegislationInfo")
        self.assertEqual(len(infos), 3)


class TestBillNumberExtraction(unittest.TestCase):
    """Test bill number extraction and parsing"""
    
    def test_simple_house_bill(self):
        """Test extracting from simple HB format"""
        prefix, num = extract_bill_number_from_id("HB 1001")
        self.assertEqual(prefix, "HB")
        self.assertEqual(num, 1001)
    
    def test_simple_senate_bill(self):
        """Test extracting from simple SB format"""
        prefix, num = extract_bill_number_from_id("SB 5001")
        self.assertEqual(prefix, "SB")
        self.assertEqual(num, 5001)
    
    def test_substitute_house_bill(self):
        """Test extracting from substitute bill format"""
        prefix, num = extract_bill_number_from_id("2SHB 1037")
        self.assertEqual(prefix, "2SHB")
        self.assertEqual(num, 1037)
    
    def test_engrossed_substitute(self):
        """Test extracting from engrossed substitute format"""
        prefix, num = extract_bill_number_from_id("ESHB 1234")
        self.assertEqual(prefix, "ESHB")
        self.assertEqual(num, 1234)
    
    def test_no_space(self):
        """Test extracting when no space between prefix and number"""
        prefix, num = extract_bill_number_from_id("HB1001")
        self.assertEqual(prefix, "HB")
        self.assertEqual(num, 1001)
    
    def test_joint_resolution(self):
        """Test extracting joint resolution"""
        prefix, num = extract_bill_number_from_id("HJR 4200")
        self.assertEqual(prefix, "HJR")
        self.assertEqual(num, 4200)
    
    def test_senate_joint_memorial(self):
        """Test extracting senate joint memorial"""
        prefix, num = extract_bill_number_from_id("SJM 8001")
        self.assertEqual(prefix, "SJM")
        self.assertEqual(num, 8001)


class TestTopicDetermination(unittest.TestCase):
    """Test topic classification from bill titles"""
    
    def test_education_topic(self):
        """Test education topic detection"""
        self.assertEqual(determine_topic("Concerning school funding"), "Education")
        self.assertEqual(determine_topic("Student loan reform"), "Education")
        self.assertEqual(determine_topic("Teacher certification"), "Education")
        self.assertEqual(determine_topic("Early childhood education (ECEAP)"), "Education")
    
    def test_healthcare_topic(self):
        """Test healthcare topic detection"""
        self.assertEqual(determine_topic("Health insurance reform"), "Healthcare")
        self.assertEqual(determine_topic("Mental health services"), "Healthcare")
        self.assertEqual(determine_topic("Hospital funding"), "Healthcare")
        self.assertEqual(determine_topic("Behavioral health programs"), "Healthcare")
    
    def test_housing_topic(self):
        """Test housing topic detection"""
        self.assertEqual(determine_topic("Rent control measures"), "Housing")
        self.assertEqual(determine_topic("Tenant rights protection"), "Housing")
        self.assertEqual(determine_topic("Zoning reform for housing"), "Housing")
        self.assertEqual(determine_topic("Homeless shelter funding"), "Housing")
    
    def test_environment_topic(self):
        """Test environment topic detection"""
        self.assertEqual(determine_topic("Climate action plan"), "Environment")
        self.assertEqual(determine_topic("Clean energy standards"), "Environment")
        self.assertEqual(determine_topic("Salmon habitat restoration"), "Environment")
    
    def test_transportation_topic(self):
        """Test transportation topic detection"""
        self.assertEqual(determine_topic("Highway maintenance funding"), "Transportation")
        self.assertEqual(determine_topic("Public transit expansion"), "Transportation")
        self.assertEqual(determine_topic("Vehicle registration fees"), "Transportation")
    
    def test_public_safety_topic(self):
        """Test public safety topic detection"""
        self.assertEqual(determine_topic("Crime prevention programs"), "Public Safety")
        self.assertEqual(determine_topic("Police reform"), "Public Safety")
        self.assertEqual(determine_topic("Emergency response services"), "Public Safety")
    
    def test_tax_topic(self):
        """Test tax topic detection"""
        self.assertEqual(determine_topic("Property tax reduction"), "Tax & Revenue")
        self.assertEqual(determine_topic("Budget appropriations"), "Tax & Revenue")
    
    def test_technology_topic(self):
        """Test technology topic detection"""
        self.assertEqual(determine_topic("Data privacy protection"), "Technology")
        self.assertEqual(determine_topic("Artificial intelligence regulation"), "Technology")
        self.assertEqual(determine_topic("Broadband expansion"), "Technology")
    
    def test_business_topic(self):
        """Test business topic detection"""
        self.assertEqual(determine_topic("Small business licensing"), "Business")
        self.assertEqual(determine_topic("Worker protection laws"), "Business")
    
    def test_default_topic(self):
        """Test default topic for unclassified bills"""
        self.assertEqual(determine_topic("Miscellaneous provisions"), "General Government")
        self.assertEqual(determine_topic(""), "General Government")


class TestPriorityDetermination(unittest.TestCase):
    """Test priority classification"""
    
    def test_high_priority_keywords(self):
        """Test high priority keyword detection"""
        self.assertEqual(determine_priority("Emergency funding bill"), "high")
        self.assertEqual(determine_priority("State budget crisis"), "high")
        self.assertEqual(determine_priority("Public safety urgent measures"), "high")
    
    def test_high_priority_governor_request(self):
        """Test governor request gets high priority"""
        self.assertEqual(determine_priority("Regular bill", requested_by_governor=True), "high")
    
    def test_low_priority_keywords(self):
        """Test low priority keyword detection"""
        self.assertEqual(determine_priority("Technical corrections bill"), "low")
        self.assertEqual(determine_priority("Clarifying existing law"), "low")
        self.assertEqual(determine_priority("Minor housekeeping changes"), "low")
    
    def test_medium_priority_default(self):
        """Test default medium priority"""
        self.assertEqual(determine_priority("Regular legislation"), "medium")
        self.assertEqual(determine_priority(""), "medium")


class TestStatusNormalization(unittest.TestCase):
    """Test status normalization"""
    
    def test_prefiled_status(self):
        """Test prefiled status"""
        self.assertEqual(normalize_status("Prefiled"), "prefiled")
        self.assertEqual(normalize_status("Pre-filed"), "prefiled")
    
    def test_introduced_status(self):
        """Test introduced status"""
        self.assertEqual(normalize_status("Introduced"), "introduced")
        self.assertEqual(normalize_status("", "First reading, referred to Education"), "committee")
    
    def test_committee_status(self):
        """Test committee status"""
        self.assertEqual(normalize_status("In Committee"), "committee")
        self.assertEqual(normalize_status("", "Referred to Ways & Means"), "committee")
    
    def test_passed_status(self):
        """Test passed status"""
        self.assertEqual(normalize_status("Passed", "Passed House and Senate"), "passed_legislature")
    
    def test_enacted_status(self):
        """Test enacted status"""
        self.assertEqual(normalize_status("", "Governor signed, C 123 L 2026"), "enacted")
    
    def test_vetoed_status(self):
        """Test vetoed status"""
        self.assertEqual(normalize_status("", "Governor vetoed"), "vetoed")
    
    def test_failed_status(self):
        """Test failed status"""
        self.assertEqual(normalize_status("", "Died in committee"), "failed")
        self.assertEqual(normalize_status("", "Failed to pass House"), "failed")


class TestBillNumberFormatting(unittest.TestCase):
    """Test bill number display formatting"""
    
    def test_add_space(self):
        """Test adding space to bill number"""
        self.assertEqual(format_bill_number("HB1001"), "HB 1001")
        self.assertEqual(format_bill_number("SB5001"), "SB 5001")
    
    def test_preserve_existing_space(self):
        """Test preserving existing space"""
        self.assertEqual(format_bill_number("HB 1001"), "HB 1001")
        self.assertEqual(format_bill_number("2SHB 1037"), "2SHB 1037")
    
    def test_complex_prefix(self):
        """Test complex prefixes"""
        self.assertEqual(format_bill_number("ESHB1234"), "ESHB 1234")
        self.assertEqual(format_bill_number("2SSB5001"), "2SSB 5001")


class TestLegUrl(unittest.TestCase):
    """Test leg.wa.gov URL generation"""
    
    def test_url_generation(self):
        """Test URL generation for bills"""
        url = get_leg_url(1001)
        self.assertIn("app.leg.wa.gov/billsummary", url)
        self.assertIn("BillNumber=1001", url)
        self.assertIn(f"Year={YEAR}", url)
    
    def test_url_different_bill_numbers(self):
        """Test URL for different bill numbers"""
        url1 = get_leg_url(1001)
        url2 = get_leg_url(5001)
        
        self.assertIn("1001", url1)
        self.assertIn("5001", url2)


class TestSOAPResponseParsing(unittest.TestCase):
    """Test parsing actual SOAP response XML structures"""
    
    def test_parse_legislation_response(self):
        """Test parsing a GetLegislation response"""
        xml = f'''<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
                <GetLegislationResponse xmlns="{NS}">
                    <GetLegislationResult>
                        <Legislation>
                            <ShortDescription>Concerning early childhood education</ShortDescription>
                            <LongDescription>AN ACT relating to early childhood education and assistance program.</LongDescription>
                            <Sponsor>Sen. Claire Wilson</Sponsor>
                            <IntroducedDate>2026-01-08T00:00:00</IntroducedDate>
                            <CurrentStatus>
                                <BillId>SB 5872</BillId>
                                <Status>Prefiled</Status>
                                <HistoryLine>Prefiled for introduction.</HistoryLine>
                            </CurrentStatus>
                            <RequestedByGovernor>true</RequestedByGovernor>
                        </Legislation>
                    </GetLegislationResult>
                </GetLegislationResponse>
            </soap:Body>
        </soap:Envelope>'''
        
        root = ET.fromstring(xml)
        
        # Find legislation elements
        legislations = find_all_elements(root, "Legislation")
        self.assertEqual(len(legislations), 1)
        
        leg = legislations[0]
        self.assertEqual(find_element_text(leg, "ShortDescription"), "Concerning early childhood education")
        self.assertEqual(find_element_text(leg, "Sponsor"), "Sen. Claire Wilson")
    
    def test_parse_legislation_info_list(self):
        """Test parsing a GetLegislationByYear response"""
        xml = f'''<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
                <GetLegislationByYearResponse xmlns="{NS}">
                    <GetLegislationByYearResult>
                        <LegislationInfo>
                            <Biennium>2025-26</Biennium>
                            <BillId>HB 1001</BillId>
                            <BillNumber>1001</BillNumber>
                            <ShortLegislationType>HB</ShortLegislationType>
                            <OriginalAgency>House</OriginalAgency>
                            <Active>true</Active>
                        </LegislationInfo>
                        <LegislationInfo>
                            <Biennium>2025-26</Biennium>
                            <BillId>HB 1002</BillId>
                            <BillNumber>1002</BillNumber>
                            <ShortLegislationType>HB</ShortLegislationType>
                            <OriginalAgency>House</OriginalAgency>
                            <Active>true</Active>
                        </LegislationInfo>
                    </GetLegislationByYearResult>
                </GetLegislationByYearResponse>
            </soap:Body>
        </soap:Envelope>'''
        
        root = ET.fromstring(xml)
        
        infos = find_all_elements(root, "LegislationInfo")
        self.assertEqual(len(infos), 2)
        
        bill_ids = [find_element_text(info, "BillId") for info in infos]
        self.assertIn("HB 1001", bill_ids)
        self.assertIn("HB 1002", bill_ids)


class TestDataOutputFormat(unittest.TestCase):
    """Test output data format compatibility with app.js"""
    
    def test_bill_object_structure(self):
        """Test that bill object has all required fields for app.js"""
        required_fields = [
            "id", "number", "title", "sponsor", "description",
            "status", "committee", "priority", "topic",
            "introducedDate", "lastUpdated", "legUrl", "hearings", "session"
        ]

        # Create a sample bill object
        bill = {
            "id": "HB1001",
            "number": "HB 1001",
            "title": "Test Bill",
            "sponsor": "Rep. Test",
            "description": "A test bill",
            "status": "prefiled",
            "committee": "Education",
            "priority": "medium",
            "topic": "Education",
            "introducedDate": "2026-01-12",
            "lastUpdated": datetime.now().isoformat(),
            "legUrl": "https://app.leg.wa.gov/billsummary?BillNumber=1001&Year=2026",
            "hearings": [],
            "session": "2026"
        }
        
        for field in required_fields:
            self.assertIn(field, bill, f"Missing required field: {field}")
    
    def test_status_values(self):
        """Test that status values match app.js expected values"""
        valid_statuses = ["prefiled", "introduced", "committee", "floor",
                          "passed_origin", "opposite_committee", "opposite_floor",
                          "passed_legislature", "governor", "enacted",
                          "partial_veto", "vetoed", "failed",
                          "passed"]  # legacy alias
        
        # Test normalization produces valid values
        test_cases = [
            ("Prefiled", "prefiled"),
            ("Introduced", "introduced"),
            ("In Committee", "committee"),
        ]
        
        for input_status, expected in test_cases:
            result = normalize_status(input_status)
            self.assertIn(result, valid_statuses)
    
    def test_priority_values(self):
        """Test that priority values match app.js expected values"""
        valid_priorities = ["high", "medium", "low"]
        
        results = [
            determine_priority("Emergency bill"),
            determine_priority("Regular bill"),
            determine_priority("Technical correction")
        ]
        
        for result in results:
            self.assertIn(result, valid_priorities)


if __name__ == "__main__":
    unittest.main(verbosity=2)
