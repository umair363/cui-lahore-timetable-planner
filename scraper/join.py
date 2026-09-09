"""Join class-side and teacher-side sheets into complete lessons.

Neither sheet type is complete on its own: a class sheet never names the teacher,
a teacher sheet never names the class. But a lesson is identified uniquely by
(day, start period, end period, room, course code) - verified empirically on a
113-page sample: zero keys mapped to more than one teacher. Keys that map to more
than one *class* are real (a merged lecture / shared elective shown once per section).

Fallback keys handle a small number of blocks with no room (an empty string, not a
missing key) or a room that doesn't literally match between the two sides.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from parser import Block, Sheet, period_to_time


def _key(b: Block) -> tuple:
    return (b.day, b.p_start, b.p_end, b.room, b.code)


def _fallback_key(b: Block) -> tuple:
    return (b.day, b.p_start, b.p_end, b.code)


@dataclass
class Lesson:
    course: str
    day: str
    p_start: int
    p_end: int
    room: str
    color: str
    teacher: str | None = None
    sections: list[str] = field(default_factory=list)
    group: str = ""


def join_sheets(class_sheets: list[Sheet], teacher_sheets: list[Sheet]) -> tuple[list[Lesson], dict]:
    """Returns (lessons, report). report carries integrity counts for the sanity gate
    and for display in the site footer - never hidden, never guessed around.
    """
    # Index teacher blocks by exact key, and a same-day/code fallback for the few
    # blocks that don't carry a matching room string on both sides.
    teacher_by_key: dict[tuple, list[tuple[str, Block]]] = {}
    teacher_by_fallback: dict[tuple, list[tuple[str, Block]]] = {}
    for ts in teacher_sheets:
        for b in ts.blocks:
            teacher_by_key.setdefault(_key(b), []).append((ts.who, b))
            teacher_by_fallback.setdefault(_fallback_key(b), []).append((ts.who, b))

    # Group class blocks by key: multiple sections at the same key is a real merged lesson.
    class_by_key: dict[tuple, list[tuple[str, Block]]] = {}
    for cs in class_sheets:
        for b in cs.blocks:
            class_by_key.setdefault(_key(b), []).append((cs.who, b))

    lessons: list[Lesson] = []
    matched_exact = 0
    matched_fallback = 0
    unmatched_class_keys: list[tuple] = []
    ambiguous_teacher_keys: list[tuple] = []

    for key, entries in class_by_key.items():
        day, p_start, p_end, room, code = key
        sections = sorted({who for who, _ in entries})
        group = next((b.group for _, b in entries if b.group), "")
        color = entries[0][1].color

        cands = teacher_by_key.get(key)
        used_fallback = False
        if not cands:
            cands = teacher_by_fallback.get(_fallback_key(entries[0][1]))
            used_fallback = True

        teacher = None
        if cands:
            names = sorted({who for who, _ in cands})
            if len(names) == 1:
                teacher = names[0]
                matched_fallback += used_fallback
                matched_exact += not used_fallback
            else:
                ambiguous_teacher_keys.append(key)
        else:
            unmatched_class_keys.append(key)

        lessons.append(Lesson(
            course=code, day=day, p_start=p_start, p_end=p_end, room=room,
            color=color, teacher=teacher, sections=sections, group=group,
        ))

    # Teacher blocks whose key never showed up on the class side at all (rare -
    # e.g. a class sheet fetch failed). Surfaced, not silently dropped.
    all_class_keys = set(class_by_key.keys())
    orphan_teacher_blocks = 0
    for key, entries in teacher_by_key.items():
        if key not in all_class_keys:
            orphan_teacher_blocks += len(entries)

    report = {
        "lessons": len(lessons),
        "matched_exact": matched_exact,
        "matched_fallback": matched_fallback,
        "unmatched_class_keys": len(unmatched_class_keys),
        "ambiguous_teacher_keys": len(ambiguous_teacher_keys),
        "orphan_teacher_blocks": orphan_teacher_blocks,
    }
    return lessons, report


def lesson_times(lesson: Lesson) -> tuple[str, str]:
    return period_to_time(lesson.p_start), period_to_time(lesson.p_end + 1)
