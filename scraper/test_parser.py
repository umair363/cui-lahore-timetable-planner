"""Fixture-based tests for scraper.parser.

Fixtures under scraper/fixtures/ are real captured pages from sfs.cuilahore.edu.pk
(Fall 2026 Timetable, v. 2026-09-07), each chosen for a specific structural case:

  teacher_simple.html    a plain teacher sheet, single lane throughout
  class_simple.html      a plain class sheet with a full course list
  multilane_merged.html  a day split into parallel lab-group lanes (rowspan on the
                          day cell) AND a lecture merged across three sections
  roomless_block.html    a lesson block with no room span at all ("CoC")
"""
import os
import unittest

from parser import parse_sheet

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def load(name: str) -> str:
    with open(os.path.join(FIXTURES, name), encoding="utf-8") as f:
        return f.read()


class TestTeacherSheet(unittest.TestCase):
    def setUp(self):
        self.sheet = parse_sheet(load("teacher_simple.html"), "teacher")

    def test_identity(self):
        self.assertEqual(self.sheet.who, "Abdul Karim Shahid")
        self.assertEqual(self.sheet.version, "v. 2026-09-07")

    def test_block_count_and_shape(self):
        self.assertEqual(len(self.sheet.blocks), 6)
        for b in self.sheet.blocks:
            self.assertEqual(b.code, "CSC211")
            self.assertEqual(b.lane, 0)  # teacher sheets never carry parallel lanes

    def test_known_block(self):
        tue = [b for b in self.sheet.blocks if b.day == "Tu" and b.p_start == 1]
        self.assertEqual(len(tue), 1)
        b = tue[0]
        self.assertEqual((b.p_start, b.p_end), (1, 6))
        self.assertEqual(b.room, "CS Lab-C (C-8)")

    def test_courses_carry_clean_title_and_sections(self):
        # Teacher-side course entries carry the section list and a "pending" count in
        # separate spans alongside the title; a regression here mixed them into one
        # string (title = "Data Structures - FA25-BCS-A" or worse "...N pending").
        titles = {c["code"]: c for c in self.sheet.courses}
        self.assertEqual(titles["CSC211"]["title"], "Data Structures")
        for c in self.sheet.courses:
            self.assertNotIn("pending", c["title"])
            self.assertTrue(c["sections"])


class TestClassSheet(unittest.TestCase):
    def setUp(self):
        self.sheet = parse_sheet(load("class_simple.html"), "class")

    def test_identity(self):
        self.assertEqual(self.sheet.who, "FA24-BCS-A")

    def test_block_count(self):
        self.assertEqual(len(self.sheet.blocks), 15)

    def test_course_titles_have_no_leading_dash(self):
        # Regression: a leading "\n    " before the dash used to defeat lstrip(),
        # leaving titles like "- Machine Learning Fundamentals".
        for c in self.sheet.courses:
            self.assertFalse(c["title"].startswith("-"), c["title"])
        codes = {c["code"] for c in self.sheet.courses}
        self.assertIn("CSC316", codes)
        titles = {c["code"]: c["title"] for c in self.sheet.courses}
        self.assertEqual(titles["CSC316"], "Advance Database Systems")


class TestMultilaneAndMerged(unittest.TestCase):
    def setUp(self):
        self.sheet = parse_sheet(load("multilane_merged.html"), "class")

    def test_identity(self):
        self.assertEqual(self.sheet.who, "FA23-BCS-A")

    def test_parallel_lab_group_lanes(self):
        # Monday: two lab groups meet at once in different rooms - two lanes, both
        # present, with distinct group labels and rooms. This is the case a naive
        # rowspan-carry bug (leaking into columns a later row never visits) breaks.
        mon = [b for b in self.sheet.blocks if b.day == "Mo"]
        self.assertEqual(len(mon), 2)
        lanes = {b.lane for b in mon}
        self.assertEqual(lanes, {0, 1})
        groups = {b.group for b in mon}
        self.assertEqual(groups, {"G1", "G2"})
        rooms = {b.room for b in mon}
        self.assertEqual(rooms, {"N-1", "N-2"})

    def test_group_label_stripped_of_dash_prefix(self):
        for b in self.sheet.blocks:
            if b.group:
                self.assertFalse(b.group.startswith("-"), b.group)
                self.assertFalse(b.group.startswith(" "), repr(b.group))

    def test_no_column_bleed_after_multilane_day(self):
        # The day after a multi-lane split must not inherit phantom pending spans.
        tue = [b for b in self.sheet.blocks if b.day == "Tu"]
        self.assertGreaterEqual(len(tue), 3)
        starts = sorted(b.p_start for b in tue)
        self.assertEqual(starts[0], 3)  # first Tuesday block starts at period 3


class TestPendingCourseSuffix(unittest.TestCase):
    """Regression: a teacher whose course entry carries an extra <span class="pend">
    ("N pending", meaning N of their weekly meetings aren't timetabled yet) used to
    leak straight into the title - "Web Technologies 1 pending"."""

    def setUp(self):
        self.sheet = parse_sheet(load("teacher_pending_courses.html"), "teacher")

    def test_pending_suffix_not_in_title(self):
        self.assertTrue(self.sheet.courses)
        for c in self.sheet.courses:
            self.assertNotRegex(c["title"], r"pending")
            self.assertNotRegex(c["title"], r"\d+$")

    def test_pending_count_parsed_separately(self):
        by_code = {c["code"]: c for c in self.sheet.courses}
        self.assertIn("CSC303", by_code)
        self.assertEqual(by_code["CSC303"]["title"], "Mobile Application Development")
        self.assertEqual(by_code["CSC303"]["pending"], 2)
        self.assertEqual(by_code["CSC303"]["sections"], ["FA23-BCE-A", "FA23-BCE-B"])


class TestRoomlessBlock(unittest.TestCase):
    def setUp(self):
        self.sheet = parse_sheet(load("roomless_block.html"), "class")

    def test_roomless_block_present_with_empty_room(self):
        coc = [b for b in self.sheet.blocks if b.code == "CoC"]
        self.assertEqual(len(coc), 1)
        self.assertEqual(coc[0].room, "")
        self.assertEqual((coc[0].day, coc[0].p_start, coc[0].p_end), ("We", 3, 4))


if __name__ == "__main__":
    unittest.main()
