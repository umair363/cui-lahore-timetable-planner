"""Parse a CUI Lahore timetable sheet (Kind=class or Kind=teacher) into structured blocks.

The page is plain server-rendered HTML: one <table class="grid"> per sheet, 6 day-rows
(each possibly split into several "lanes" for parallel lab groups via rowspan on the day
cell), 24 half-hour period columns. A lesson is a <td class="slot" colspan=N> containing
a <div class="blk"> with course code, optional group suffix, and room.

Only stdlib (html.parser) — no external dependencies, so the scraper needs no install step.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from html.parser import HTMLParser
import re


@dataclass
class Block:
    day: str
    lane: int
    p_start: int  # 1-indexed period, inclusive
    p_end: int    # inclusive
    code: str = ""
    group: str = ""
    room: str = ""
    color: str = ""

    @property
    def span(self) -> int:
        return self.p_end - self.p_start + 1


@dataclass
class Sheet:
    kind: str            # "class" or "teacher"
    who: str              # the sheet's subject, e.g. "FA24-BCS-A" or "Dr. Atif Saeed"
    version: str = ""     # "v. 2026-09-07"
    term: str = ""        # "Fall 2026 Timetable - Beta Version"
    blocks: list[Block] = field(default_factory=list)
    courses: list[dict] = field(default_factory=list)   # [{code, title}]


_DAYCOL_RE = re.compile(r"\bdaycol\b")
_BLK_RE = re.compile(r"\bblk\b")
_SLOT_RE = re.compile(r"\bslot\b")


class _GridHTMLParser(HTMLParser):
    """Single pass: collects tbody rows as a list of cell dicts, plus header/course metadata."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_tbody = False
        self.rows: list[list[dict]] = []
        self._cur_row: list[dict] | None = None
        self._cell: dict | None = None
        self._span_stack: list[str] = []  # class names of open <span> inside a .blk

        self.who = ""
        self.version = ""
        self.term = ""
        self._in_cls = False
        self._in_term = False
        self._in_ver = False

        self.courses: list[dict] = []
        self._in_course = False
        self._course_parts: dict[str, str] = {}
        self._course_span_stack: list[str] = []

    # -- tag handling -----------------------------------------------------
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class", "")

        if tag == "div" and cls == "cls":
            self._in_cls = True
        elif tag == "div" and cls == "term":
            self._in_term = True
        elif tag == "div" and cls == "course":
            self._in_course = True
            self._course_parts = {}
            self._course_span_stack = []
        elif tag == "span" and self._in_course:
            self._course_span_stack.append(cls)

        if tag == "tbody":
            self.in_tbody = True
            return
        if not self.in_tbody:
            return

        if tag == "tr":
            self._cur_row = []
        elif tag == "td":
            self._cell = {
                "is_day": bool(_DAYCOL_RE.search(cls)),
                "colspan": int(a.get("colspan", 1)),
                "rowspan": int(a.get("rowspan", 1)),
                "text": [],
                "blk": None,
            }
            self._span_stack = []
        elif self._cell is not None:
            if tag == "div" and _BLK_RE.search(cls):
                style = a.get("style", "")
                m = re.search(r"border-left-color\s*:\s*([^;]+)", style)
                self._cell["blk"] = {"color": (m.group(1).strip() if m else ""), "parts": {}}
            elif tag == "span" and self._cell.get("blk") is not None:
                key = (
                    "code" if "code" in cls else
                    "grp" if "grp" in cls else
                    "room" if "room" in cls else
                    "mid" if "mid" in cls else
                    cls
                )
                self._span_stack.append(key)

    def handle_data(self, data):
        if self._in_cls:
            self.who += data
        if self._in_term:
            self.term += data
        if self._in_course:
            text = " ".join(data.split())
            if text:
                key = self._course_span_stack[-1] if self._course_span_stack else "plain"
                self._course_parts[key] = (self._course_parts.get(key, "") + " " + text).strip()

        if self._cell is None:
            return
        text = data.strip()
        if not text:
            return
        blk = self._cell.get("blk")
        if blk is not None and self._span_stack:
            key = self._span_stack[-1]
            blk["parts"][key] = (blk["parts"].get(key, "") + " " + text).strip()
        elif blk is None:
            self._cell["text"].append(text)

    def handle_endtag(self, tag):
        if tag == "div" and self._in_cls:
            self._in_cls = False
        if tag == "div" and self._in_term:
            self._in_term = False
        if tag == "span" and self._in_course and self._course_span_stack:
            self._course_span_stack.pop()
        if tag == "div" and self._in_course:
            self._in_course = False
            code = self._course_parts.get("cc", "")
            title = self._course_parts.get("plain", "").strip(" -–—")
            sections_raw = self._course_parts.get("ct", "")
            sections = [s.strip() for s in sections_raw.split(",") if s.strip()]
            pend_raw = self._course_parts.get("pend", "")
            pend_m = re.search(r"\d+", pend_raw)
            pending = int(pend_m.group()) if pend_m else 0
            if code:
                self.courses.append({
                    "code": code, "title": title, "sections": sections, "pending": pending,
                })

        if tag == "tbody":
            self.in_tbody = False
            return
        if not self.in_tbody:
            return

        if tag == "span" and self._cell is not None and self._span_stack:
            self._span_stack.pop()
        elif tag == "td" and self._cell is not None:
            self._cur_row.append(self._cell)
            self._cell = None
        elif tag == "tr" and self._cur_row is not None:
            self.rows.append(self._cur_row)
            self._cur_row = None


def _resolve_grid(rows: list[list[dict]]) -> list[Block]:
    """Standard HTML-table occupancy resolution: a pending map of column -> rows remaining,
    decremented once per row for every column, cells placed into the first free column.
    """
    blocks: list[Block] = []
    pending: dict[int, int] = {}
    day = None
    lane = 0

    for row in rows:
        for col in list(pending.keys()):
            pending[col] -= 1
            if pending[col] <= 0:
                del pending[col]

        cells = list(row)
        if cells and cells[0]["is_day"]:
            day_text = " ".join(cells[0]["text"]).strip()
            if day_text:
                day = day_text
            lane = 0
            cells = cells[1:]
        else:
            lane += 1

        col = 0
        for cell in cells:
            while col in pending:
                col += 1
            start_col = col
            span = cell["colspan"]
            if cell["rowspan"] > 1:
                for k in range(span):
                    pending[start_col + k] = cell["rowspan"] - 1
            col += span

            blk = cell.get("blk")
            if blk is not None:
                parts = blk["parts"]
                blocks.append(Block(
                    day=day or "",
                    lane=lane,
                    p_start=start_col + 1,
                    p_end=start_col + span,
                    code=parts.get("code", ""),
                    group=re.sub(r"^[\s\-–]+", "", parts.get("grp", "")).strip(),
                    room=parts.get("room", ""),
                    color=blk["color"],
                ))
    return blocks


def parse_sheet(html: str, kind: str) -> Sheet:
    p = _GridHTMLParser()
    p.feed(html)
    blocks = _resolve_grid(p.rows)
    ver_m = re.search(r"v\.\s*[\d\-]+", p.term)
    version = ver_m.group(0) if ver_m else ""
    term = re.sub(r"\s*-?\s*v\.\s*[\d\-]+\s*$", "", p.term).strip()
    who = " ".join(p.who.split())
    return Sheet(kind=kind, who=who, version=version, term=term, blocks=blocks, courses=p.courses)


PERIOD_START_MIN = 8 * 60 + 30  # 08:30


def period_to_time(period: int) -> str:
    total = PERIOD_START_MIN + 30 * (period - 1)
    return f"{total // 60:02d}:{total % 60:02d}"
