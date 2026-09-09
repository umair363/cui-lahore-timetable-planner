"""Crawl sfs.cuilahore.edu.pk's public timetable, parse both sides, join them, and
write site/data/timetable.json for the static site to consume.

Stdlib only (urllib, html.parser, concurrent.futures) - no install step, so this
can't break on a dependency bump inside a scheduled CI job.

Usage:
    python scrape.py                 full crawl, writes site/data/timetable.json
    python scrape.py --limit 20      smoke test: only the first N of each kind
    python scrape.py --cache-dir X   reuse/save raw HTML under X (default: .cache)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

from join import Lesson, join_sheets, lesson_times
from parser import Sheet, parse_sheet, period_to_time

BASE = "https://sfs.cuilahore.edu.pk/schedule/Public/Timetable"
UA = "cui-timetable-planner/1.0 (+student-built course planner; contact via github issues)"
CONCURRENCY = 4
TIMEOUT = 30
RETRIES = 3
MIN_SUCCESS_RATE = 0.90
MAX_REGRESSION = 0.20  # abort publish if lessons/teachers/sections drop by more than this

DAY_ORDER = {d: i for i, d in enumerate(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"])}


def fetch(kind: str, who: str = "", dept: str = "") -> str:
    q = {"Kind": kind}
    if dept:
        q["Dept"] = dept
    if who:
        q["Who"] = who
    url = BASE + "?" + urllib.parse.urlencode(q)
    last_err = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return r.read().decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
            time.sleep(0.5 * (attempt + 1) + random.uniform(0, 0.3))
    raise RuntimeError(f"failed to fetch {url}: {last_err}")


def cache_path(cache_dir: str, label: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9]+", "_", label).strip("_")
    return os.path.join(cache_dir, f"{safe}.html")


def fetch_cached(cache_dir: str, label: str, kind: str, who: str = "", dept: str = "") -> str:
    """label names the cache file; kind/who/dept are the real request params sent to
    the university server (label and kind intentionally diverge for index pages,
    where the request carries no `Who` but the cache still needs one file per kind/dept)."""
    p = cache_path(cache_dir, label)
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return f.read()
    html = fetch(kind, who=who, dept=dept)
    os.makedirs(cache_dir, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(html)
    return html


def extract_options(html: str, name: str) -> list[str]:
    m = re.search(rf'<select name="{name}"[^>]*>(.*?)</select>', html, re.S)
    if not m:
        return []
    return [o for o in re.findall(r'<option value="([^"]*)"', m.group(1)) if o]


def build_dept_map(cache_dir: str, kind: str, depts: list[str]) -> dict[str, str]:
    """entity name -> department, from per-dept filtered index pages."""
    mapping: dict[str, str] = {}

    def one(dept: str):
        html = fetch_cached(cache_dir, f"idx_{kind}_dept_{dept}", kind, dept=dept)
        return dept, extract_options(html, "Who")

    with ThreadPoolExecutor(CONCURRENCY) as ex:
        futs = [ex.submit(one, d) for d in depts]
        for fut in as_completed(futs):
            dept, whos = fut.result()
            for w in whos:
                mapping.setdefault(w, dept)
    return mapping


PROGRAM_RE = re.compile(r"^(?:FA|SP)\d{2}-([A-Z]+)-", re.I)
BATCH_RE = re.compile(r"^((?:FA|SP)\d{2})-", re.I)


def derive_program_batch(name: str) -> tuple[str, str]:
    pm = PROGRAM_RE.match(name)
    bm = BATCH_RE.match(name)
    return (pm.group(1) if pm else "", bm.group(1) if bm else "")


LAB_ROOM_RE = re.compile(r"\blab\b", re.I)


def room_kind(room: str) -> str:
    return "lab" if LAB_ROOM_RE.search(room) else "room" if room else "unspecified"


def crawl(cache_dir: str, limit: int | None) -> dict:
    print("Fetching entity indexes...", file=sys.stderr)
    cls_idx_html = fetch_cached(cache_dir, "idx_class_all", "class")
    tch_idx_html = fetch_cached(cache_dir, "idx_teacher_all", "teacher")
    class_names = extract_options(cls_idx_html, "Who")
    teacher_names = extract_options(tch_idx_html, "Who")
    class_depts = extract_options(cls_idx_html, "Dept")
    teacher_depts = extract_options(tch_idx_html, "Dept")

    if limit:
        class_names = class_names[:limit]
        teacher_names = teacher_names[:limit]

    print(f"{len(class_names)} classes, {len(teacher_names)} teachers", file=sys.stderr)

    print("Building department map...", file=sys.stderr)
    class_dept_map = build_dept_map(cache_dir, "class", class_depts)
    teacher_dept_map = build_dept_map(cache_dir, "teacher", teacher_depts)

    print("Fetching sheets...", file=sys.stderr)
    jobs = [("class", w) for w in class_names] + [("teacher", w) for w in teacher_names]
    results: dict[tuple[str, str], str | None] = {}
    ok = 0

    def one(job):
        kind, who = job
        try:
            return job, fetch_cached(cache_dir, f"{kind}_{who}", kind, who=who)
        except Exception as e:
            print(f"  FAILED {kind} {who}: {e}", file=sys.stderr)
            return job, None

    with ThreadPoolExecutor(CONCURRENCY) as ex:
        futs = [ex.submit(one, j) for j in jobs]
        for i, fut in enumerate(as_completed(futs), 1):
            job, html = fut.result()
            results[job] = html
            if html:
                ok += 1
            if i % 50 == 0 or i == len(jobs):
                print(f"  {i}/{len(jobs)} fetched, {ok} ok", file=sys.stderr)

    success_rate = ok / len(jobs) if jobs else 1.0
    if success_rate < MIN_SUCCESS_RATE:
        raise RuntimeError(
            f"only {success_rate:.0%} of pages fetched successfully "
            f"(threshold {MIN_SUCCESS_RATE:.0%}) - aborting without publishing"
        )

    print("Parsing sheets...", file=sys.stderr)
    class_sheets: list[Sheet] = []
    teacher_sheets: list[Sheet] = []
    version = ""
    term = ""
    all_courses: dict[str, str] = {}

    for (kind, who), html in results.items():
        if not html:
            continue
        sheet = parse_sheet(html, kind)
        if sheet.version:
            version = sheet.version
        if sheet.term:
            term = sheet.term
        for c in sheet.courses:
            title = c["title"]
            if c["code"] and title and title != c["code"]:
                all_courses[c["code"]] = title
            else:
                all_courses.setdefault(c["code"], title)
        if kind == "class":
            class_sheets.append(sheet)
        else:
            teacher_sheets.append(sheet)

    print("Joining...", file=sys.stderr)
    lessons, report = join_sheets(class_sheets, teacher_sheets)
    print(f"  join report: {report}", file=sys.stderr)

    return {
        "version": version,
        "term": term,
        "class_sheets": class_sheets,
        "teacher_sheets": teacher_sheets,
        "class_dept_map": class_dept_map,
        "teacher_dept_map": teacher_dept_map,
        "all_courses": all_courses,
        "lessons": lessons,
        "report": report,
    }


def build_dataset(crawled: dict) -> dict:
    lessons: list[Lesson] = crawled["lessons"]

    course_colors: dict[str, str] = {}
    for l in lessons:
        if l.course and l.color and l.course not in course_colors:
            course_colors[l.course] = l.color

    courses = [
        {"code": code, "title": title, "color": course_colors.get(code, "#64748b")}
        for code, title in sorted(crawled["all_courses"].items())
    ]

    teacher_names = sorted({l.teacher for l in lessons if l.teacher} |
                            {s.who for s in crawled["teacher_sheets"]})
    teacher_index = {name: i for i, name in enumerate(teacher_names)}
    teachers = [
        {"id": i, "name": name, "dept": crawled["teacher_dept_map"].get(name, "")}
        for i, name in enumerate(teacher_names)
    ]

    section_names = sorted({s for l in lessons for s in l.sections} |
                            {s.who for s in crawled["class_sheets"]})
    section_groups: dict[str, set[str]] = {}
    for l in lessons:
        if l.group:
            for s in l.sections:
                section_groups.setdefault(s, set()).add(l.group)
    section_index = {name: i for i, name in enumerate(section_names)}
    sections = [
        {
            "id": i,
            "name": name,
            "dept": crawled["class_dept_map"].get(name, ""),
            "program": derive_program_batch(name)[0],
            "batch": derive_program_batch(name)[1],
            "groups": sorted(section_groups.get(name, [])),
        }
        for i, name in enumerate(section_names)
    ]

    room_names = sorted({l.room for l in lessons if l.room})
    room_index = {name: i for i, name in enumerate(room_names)}
    rooms = [{"id": i, "name": name, "kind": room_kind(name)} for i, name in enumerate(room_names)]

    lesson_rows = []
    for i, l in enumerate(lessons):
        start_t, end_t = lesson_times(l)
        lesson_rows.append({
            "id": i,
            "course": l.course,
            "teacher": teacher_index.get(l.teacher) if l.teacher else None,
            "sections": [section_index[s] for s in l.sections if s in section_index],
            "group": l.group,
            "room": room_index.get(l.room) if l.room else None,
            "day": l.day,
            "day_i": DAY_ORDER.get(l.day, 9),
            "start": l.p_start,
            "end": l.p_end,
            "start_time": start_t,
            "end_time": end_t,
            "kind": "lab" if (l.room and room_kind(l.room) == "lab") or (l.p_end - l.p_start + 1) >= 5 else "lecture",
        })
    lesson_rows.sort(key=lambda r: (r["day_i"], r["start"]))

    periods = [{"n": n, "time": period_to_time(n)} for n in range(1, 25)]

    report = dict(crawled["report"])
    total_class = len(crawled["class_sheets"])
    total_teacher = len(crawled["teacher_sheets"])
    report["sheets_class"] = total_class
    report["sheets_teacher"] = total_teacher

    return {
        "meta": {
            "term": crawled["term"] or "Fall 2026 Timetable",
            "version": crawled["version"],
            "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "counts": {
                "courses": len(courses), "teachers": len(teachers),
                "sections": len(sections), "rooms": len(rooms), "lessons": len(lesson_rows),
            },
            "integrity": report,
            "source": BASE,
        },
        "periods": periods,
        "courses": courses,
        "teachers": teachers,
        "sections": sections,
        "rooms": rooms,
        "lessons": lesson_rows,
    }


def sanity_check(new: dict, prev_path: str) -> list[str]:
    problems = []
    if not os.path.exists(prev_path):
        return problems
    try:
        with open(prev_path, encoding="utf-8") as f:
            prev = json.load(f)
    except Exception:
        return problems
    for key in ("lessons", "teachers", "sections"):
        old_n = prev.get("meta", {}).get("counts", {}).get(key, 0)
        new_n = new["meta"]["counts"].get(key, 0)
        if old_n and new_n < old_n * (1 - MAX_REGRESSION):
            problems.append(f"{key}: {old_n} -> {new_n} (drop > {MAX_REGRESSION:.0%})")
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="only first N of each kind (smoke test)")
    ap.add_argument("--cache-dir", default=os.path.join(os.path.dirname(__file__), ".cache"))
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "site", "data", "timetable.json"))
    ap.add_argument("--no-gate", action="store_true", help="write even if the sanity gate would fail")
    args = ap.parse_args()

    crawled = crawl(args.cache_dir, args.limit)
    dataset = build_dataset(crawled)

    out_path = os.path.abspath(args.out)
    problems = sanity_check(dataset, out_path)
    if problems and not args.no_gate:
        print("SANITY GATE FAILED - not publishing:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        sys.exit(1)
    elif problems:
        print("Sanity gate would fail but --no-gate set; publishing anyway:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    payload = json.dumps(dataset, ensure_ascii=False, separators=(",", ":"))
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(payload)

    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]
    print(f"Wrote {out_path} ({len(payload)} bytes, sha256:{digest})")
    print(f"Counts: {dataset['meta']['counts']}")
    print(f"Integrity: {dataset['meta']['integrity']}")


if __name__ == "__main__":
    main()
