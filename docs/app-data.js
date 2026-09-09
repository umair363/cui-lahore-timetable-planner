/* ============================================================================
   app-data.js — load timetable.json, build indices, derive "offerings".

   An offering is the real unit a student registers for: (course, section,
   lab group). A section's lessons for a course split into a common part
   (group == "") shared by everyone in the section, plus — when the course
   runs lab groups — one alternative per group (G1/G2/G3/Deff), each of which
   combines with the common part. Picking an offering means picking all of
   its lesson rows for the week.
   ============================================================================ */
window.App = window.App || {};

(function (App) {
  const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const DAY_LABEL = { Mo: "Monday", Tu: "Tuesday", We: "Wednesday", Th: "Thursday", Fr: "Friday", Sa: "Saturday", Su: "Sunday" };

  App.DAYS = DAYS;
  App.DAY_LABEL = DAY_LABEL;

  let data = null;      // raw parsed timetable.json
  let idx = null;        // built indices
  let loadPromise = null;

  function timeToMin(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }
  App.timeToMin = timeToMin;

  async function load() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      const res = await fetch("data/timetable.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("could not load timetable data (" + res.status + ")");
      data = await res.json();
      idx = build(data);
      return data;
    })();
    return loadPromise;
  }
  App.load = load;
  App.getData = () => data;
  App.getIndex = () => idx;

  function build(d) {
    const courseByCode = new Map(d.courses.map((c) => [c.code, c]));
    const teacherById = new Map(d.teachers.map((t) => [t.id, t]));
    const sectionById = new Map(d.sections.map((s) => [s.id, s]));
    const sectionByName = new Map(d.sections.map((s) => [s.name, s]));
    const roomById = new Map(d.rooms.map((r) => [r.id, r]));

    const lessonsByCourse = new Map();
    const lessonsByTeacher = new Map();
    const lessonsBySection = new Map();
    const lessonsByRoom = new Map();

    for (const l of d.lessons) {
      pushMulti(lessonsByCourse, l.course, l);
      if (l.teacher != null) pushMulti(lessonsByTeacher, l.teacher, l);
      if (l.room != null) pushMulti(lessonsByRoom, l.room, l);
      for (const sid of l.sections) pushMulti(lessonsBySection, sid, l);
    }

    // courses actually taught this term (course list may include stale entries)
    const activeCourseCodes = new Set(d.lessons.map((l) => l.course));

    // sections/teachers that actually have lessons (defensive against empty sheets)
    const teachersWithLoad = new Set(d.lessons.filter((l) => l.teacher != null).map((l) => l.teacher));

    return {
      courseByCode, teacherById, sectionById, sectionByName, roomById,
      lessonsByCourse, lessonsByTeacher, lessonsBySection, lessonsByRoom,
      activeCourseCodes, teachersWithLoad,
    };
  }

  function pushMulti(map, key, val) {
    let arr = map.get(key);
    if (!arr) { arr = []; map.set(key, arr); }
    arr.push(val);
  }

  // ------------------------------------------------------------ offerings

  /** All offerings for one (course, section) pair. */
  function offeringsFor(courseCode, sectionId) {
    const rows = (idx.lessonsBySection.get(sectionId) || []).filter((l) => l.course === courseCode);
    if (!rows.length) return [];
    const groups = [...new Set(rows.map((r) => r.group).filter(Boolean))].sort();
    if (!groups.length) {
      return [{
        id: `${courseCode}::${sectionId}`, course: courseCode, section: sectionId, group: "",
        lessons: rows.slice().sort(sortByDayStart),
      }];
    }
    return groups.map((g) => ({
      id: `${courseCode}::${sectionId}::${g}`, course: courseCode, section: sectionId, group: g,
      lessons: rows.filter((r) => r.group === "" || r.group === g).sort(sortByDayStart),
    }));
  }
  App.offeringsFor = offeringsFor;

  /** Every offering of a course, across every section that teaches it — the headline view. */
  function allOfferingsForCourse(courseCode) {
    const rows = idx.lessonsByCourse.get(courseCode) || [];
    const sectionIds = [...new Set(rows.flatMap((l) => l.sections))];
    const out = [];
    for (const sid of sectionIds) out.push(...offeringsFor(courseCode, sid));
    return out;
  }
  App.allOfferingsForCourse = allOfferingsForCourse;

  function sortByDayStart(a, b) {
    return a.day_i - b.day_i || a.start - b.start;
  }
  App.sortByDayStart = sortByDayStart;

  function offeringLabel(off) {
    const sec = idx.sectionById.get(off.section);
    return sec ? sec.name + (off.group ? " · " + off.group : "") : off.group || "";
  }
  App.offeringLabel = offeringLabel;

  function offeringTeachers(off) {
    const names = new Set();
    for (const l of off.lessons) {
      if (l.teacher != null) {
        const t = idx.teacherById.get(l.teacher);
        if (t) names.add(t.name);
      }
    }
    return [...names];
  }
  App.offeringTeachers = offeringTeachers;

  // ------------------------------------------------------------ clash detection

  function overlaps(a, b) {
    return a.day === b.day && a.start <= b.end && b.start <= a.end;
  }
  App.overlaps = overlaps;

  /** Given a set of selected offerings, return the set of lesson ids that clash with
   *  some other selected lesson (offerings are assumed internally consistent). */
  function findClashes(offerings) {
    const lessons = offerings.flatMap((o) => o.lessons.map((l) => ({ l, off: o.id })));
    const clashIds = new Set();
    for (let i = 0; i < lessons.length; i++) {
      for (let j = i + 1; j < lessons.length; j++) {
        if (lessons[i].off === lessons[j].off) continue;
        if (overlaps(lessons[i].l, lessons[j].l)) {
          clashIds.add(lessons[i].l.id);
          clashIds.add(lessons[j].l.id);
        }
      }
    }
    return clashIds;
  }
  App.findClashes = findClashes;

  // ------------------------------------------------------------ search

  function buildSearchDocs() {
    const docs = [];
    for (const c of data.courses) {
      if (!idx.activeCourseCodes.has(c.code)) continue;
      docs.push({ kind: "course", key: c.code, title: c.title || c.code, sub: c.code, hay: (c.title + " " + c.code).toLowerCase() });
    }
    for (const t of data.teachers) {
      if (!idx.teachersWithLoad.has(t.id)) continue;
      docs.push({ kind: "teacher", key: t.id, title: t.name, sub: t.dept || "Faculty", hay: (t.name + " " + t.dept).toLowerCase() });
    }
    for (const s of data.sections) {
      docs.push({ kind: "section", key: s.id, title: s.name, sub: [s.program, s.batch].filter(Boolean).join(" · ") || s.dept, hay: (s.name + " " + s.program + " " + s.batch + " " + s.dept).toLowerCase() });
    }
    for (const r of data.rooms) {
      docs.push({ kind: "room", key: r.id, title: r.name, sub: r.kind === "lab" ? "Lab" : "Room", hay: r.name.toLowerCase() });
    }
    return docs;
  }

  // Split on whitespace AND on letter/digit boundaries, so "cs101" still finds
  // "CSC101" (the raw substring "cs101" never appears verbatim in "csc101").
  // Shared by the global header search and every per-page filter box, so a
  // typo-tolerance fix here fixes it everywhere at once.
  function tokenize(query) {
    return query.trim().toLowerCase().match(/[a-z]+|\d+/gi) || [];
  }
  App.tokenize = tokenize;

  function scoreMatch(hay, terms) {
    let score = 0;
    for (const t of terms) {
      const i = hay.indexOf(t);
      if (i === -1) return -1;
      score += (i === 0 ? 3 : 1) + Math.max(0, 6 - t.length) * 0.1;
    }
    return score;
  }
  App.scoreMatch = scoreMatch;

  /** Filter+rank an arbitrary list by a query, given a function that builds
   *  each item's searchable text. Used for the per-page course/faculty/
   *  section/room filter boxes - same matching rules as the header search,
   *  just scoped to one already-loaded list instead of the whole dataset. */
  function filterRanked(items, query, hayFn) {
    const terms = tokenize(query);
    if (!terms.length) return items;
    const scored = [];
    for (const item of items) {
      const s = scoreMatch(hayFn(item).toLowerCase(), terms);
      if (s >= 0) scored.push({ item, s });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored.map((x) => x.item);
  }
  App.filterRanked = filterRanked;

  let searchDocs = null;
  function search(query, limit = 40) {
    if (!searchDocs) searchDocs = buildSearchDocs();
    const terms = tokenize(query);
    if (!terms.length) return [];
    const scored = [];
    for (const doc of searchDocs) {
      const s = scoreMatch(doc.hay, terms);
      if (s >= 0) scored.push({ doc, s });
    }
    scored.sort((a, b) => b.s - a.s || a.doc.title.localeCompare(b.doc.title));
    return scored.slice(0, limit).map((x) => x.doc);
  }
  App.search = search;

  // ------------------------------------------------------------ misc helpers

  function roomLabel(roomId) {
    if (roomId == null) return "TBA";
    const r = idx.roomById.get(roomId);
    return r ? r.name : "TBA";
  }
  App.roomLabel = roomLabel;

  function teacherLabel(teacherId) {
    if (teacherId == null) return "Staff TBA";
    const t = idx.teacherById.get(teacherId);
    return t ? t.name : "Staff TBA";
  }
  App.teacherLabel = teacherLabel;

  function courseTitle(code) {
    const c = idx.courseByCode.get(code);
    return (c && c.title) || code;
  }
  App.courseTitle = courseTitle;

  const HEX_COLOR_RE = /^#[0-9a-f]{3,8}$/i;
  const FALLBACK_COLOR = "#64748b";

  /** Always a validated #hex string, never raw scraped text - several call sites
   *  interpolate this straight into a style="..." attribute, so anything that
   *  isn't strictly a hex color (however that ever happened upstream) must be
   *  rejected here rather than trusted at every call site individually. */
  function courseColor(code) {
    const c = idx.courseByCode.get(code);
    const raw = c && c.color;
    return raw && HEX_COLOR_RE.test(raw) ? raw : FALLBACK_COLOR;
  }
  App.courseColor = courseColor;

})(window.App);
