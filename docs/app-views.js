/* ============================================================================
   app-views.js — one render function per route. Each takes the main <div>
   and a params object (from the hash router) and fills it in.
   ============================================================================ */
window.App = window.App || {};

(function (App) {
  const { el, escapeHtml, renderWeekGrid } = App;

  function head(eyebrow, title, desc) {
    return `<div class="page-head">
      ${eyebrow ? `<div class="page-eyebrow">${escapeHtml(eyebrow)}</div>` : ""}
      <h1 class="page-title">${escapeHtml(title)}</h1>
      ${desc ? `<p class="page-desc">${desc}</p>` : ""}
    </div>`;
  }

  function courseChip(code) {
    return `<span class="tag code">${escapeHtml(code)}</span>`;
  }

  // ---------------------------------------------------------------- HOME

  const ICONS = {
    book: '<path d="M4 19.5V5.5A2.5 2.5 0 0 1 6.5 3H19a1 1 0 0 1 1 1v14.5"/><path d="M6.5 21H20"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><circle cx="17.5" cy="9.5" r="2.5"/><path d="M15 14.2A4.7 4.7 0 0 1 20.5 19"/>',
    puzzle: '<path d="M9 3.5h3a1.5 1.5 0 0 1 0 3H11v2.2h2a2.3 2.3 0 1 1 0 4.6h-2V15h1a1.5 1.5 0 0 1 0 3H9v3.5H5.5A2 2 0 0 1 3.5 19.5V16h3.2a2.3 2.3 0 1 0 0-4.6H3.5V8a2 2 0 0 1 2-2H9z"/>',
  };
  function icon(name) {
    return `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  }
  function tileIcon(name) {
    return `<div style="width:34px; height:34px; border-radius:9px; background:var(--accent-tint); color:var(--accent); display:flex; align-items:center; justify-content:center; flex:0 0 auto;">${icon(name)}</div>`;
  }

  /** Home is a working surface, not a brochure: pull up your own section's week
   *  in one step, or pick up the plan you already had going. Deliberately no
   *  "N courses / N lessons" counters - nobody registering for classes needs to
   *  know how many rows are in the dataset. */
  function renderHome(container) {
    const idx = App.getIndex();
    const planned = App.getPlanOfferings();
    container.innerHTML = head("CUI Lahore · Fall 2026", "Your timetable, the way the university's site won't show it",
      "Pull up any section's full week, see which teacher actually takes each course, and build a clash-free schedule before registration closes.");

    // --- primary action: jump straight to a section's week
    const jump = el("div", "panel");
    jump.appendChild((() => {
      const h = el("div", "panel-head");
      h.innerHTML = `<h3>Open your section's timetable</h3><span class="help-text">Type your section code</span>`;
      return h;
    })());
    const jumpBody = el("div", "panel-body");
    jumpBody.appendChild(App.makeInlineSearch({
      placeholder: "e.g. FA25-BCS-A, SP24-BSE-B, FA23-BCE-A…",
      getMatches: (q) => q ? App.search(q, 8).filter((x) => x.kind === "section") : [],
      onPick: (sid) => { location.hash = `#/section/${sid}`; },
    }));
    jump.appendChild(jumpBody);
    container.appendChild(jump);

    // --- if there's a plan in progress, surface its real state, not a counter
    if (planned.length) {
      const clashIds = App.findClashes(planned);
      const lessons = planned.flatMap((o) => o.lessons);
      const days = new Set(lessons.map((l) => l.day)).size;
      const clashPairs = clashIds.size ? clashIds.size / 2 : 0;
      const panel = el("div", "panel");
      panel.style.marginTop = "14px";
      panel.appendChild((() => {
        const h = el("div", "panel-head");
        h.innerHTML = `<h3>Your plan in progress</h3>` +
          (clashPairs
            ? `<span class="tag bad">${clashPairs} clash${clashPairs === 1 ? "" : "es"} to fix</span>`
            : `<span class="tag ok">clash-free</span>`);
        return h;
      })());
      const body = el("div", "panel-body");
      body.innerHTML = `<p class="help-text" style="margin:0 0 10px;">${planned.length} offering${planned.length === 1 ? "" : "s"} across ${days} day${days === 1 ? "" : "s"} on campus.</p>`;
      const chips = el("div", "section-list");
      for (const o of planned) {
        const chip = el("span", "tag");
        const sec = idx.sectionById.get(o.section);
        chip.textContent = App.courseTitle(o.course) + (sec ? ` · ${sec.name}` : "");
        chips.appendChild(chip);
      }
      body.appendChild(chips);
      const go = document.createElement("a");
      go.className = "btn primary sm";
      go.href = "#/planner";
      go.textContent = clashPairs ? "Fix clashes in planner" : "Open planner";
      go.style.marginTop = "12px";
      body.appendChild(go);
      panel.appendChild(body);
      container.appendChild(panel);
    }

    // --- the two things worth doing that aren't just "browse a list"
    const row = el("div", "two-col");
    row.style.marginTop = "14px";
    row.innerHTML = `
      <a class="panel list-row link" href="#/autobuild" style="border-top:none; text-decoration:none;">
        ${tileIcon("puzzle")}
        <div class="offer-main"><div class="offer-title">Auto-build a schedule</div><div class="offer-sub">Load your section, drop what you're not taking, get every clash-free combination ranked.</div></div>
      </a>
      <a class="panel list-row link" href="#/courses" style="border-top:none; text-decoration:none;">
        ${tileIcon("book")}
        <div class="offer-main"><div class="offer-title">Find a course</div><div class="offer-sub">Every section, teacher, room and time a course is offered in.</div></div>
      </a>`;
    container.appendChild(row);
  }
  App.renderHome = renderHome;

  // ---------------------------------------------------------------- COURSES (list + detail)

  /** A live filter box bound to a redraw callback - the same shape on every
   *  list view (Courses/Faculty/Sections/Rooms), scoped to whatever's already
   *  loaded on that page rather than the whole dataset. */
  function makeFilterBox(placeholder, onChange) {
    const wrap = el("div");
    const input = document.createElement("input");
    input.placeholder = placeholder;
    input.autocomplete = "off";
    input.style.cssText = "width:100%; padding:8px 10px; border-radius:8px; border:1px solid var(--border); background:var(--surface-2); color:var(--text); font:inherit;";
    input.addEventListener("input", () => onChange(input.value));
    wrap.appendChild(input);
    return wrap;
  }

  function renderCourseList(container) {
    const d = App.getData();
    const idx = App.getIndex();
    const active = d.courses.filter((c) => idx.activeCourseCodes.has(c.code)).sort((a, b) => a.title.localeCompare(b.title));
    container.innerHTML = head("Courses", "All courses offered this term", `${active.length} courses. Filter below, or use the search bar up top to jump straight to one.`);

    const list = el("div", "panel"); list.style.marginTop = "14px";
    const countNote = el("p", "help-text");
    countNote.style.margin = "6px 0 0";

    function draw(query) {
      const shown = App.filterRanked(active, query, (c) => c.title + " " + c.code);
      list.innerHTML = "";
      for (const c of shown) {
        const row = document.createElement("a");
        row.href = `#/course/${encodeURIComponent(c.code)}`;
        row.className = "list-row link";
        const n = (idx.lessonsByCourse.get(c.code) || []).length;
        const color = App.courseColor(c.code);
        row.innerHTML = `
          <span class="tag" style="background:${tint(color)}; border-color:transparent; color:${color};">●</span>
          <div class="offer-main"><div class="offer-title">${escapeHtml(c.title)}</div>
            <div class="offer-sub">${courseChip(c.code)} <span>${n} lesson${n === 1 ? "" : "s"}/week</span></div></div>`;
        list.appendChild(row);
      }
      if (!shown.length) list.innerHTML = App.emptyBlock("No matching courses", "Try a different title or code.");
      countNote.textContent = query.trim() ? `${shown.length} of ${active.length} courses match "${query.trim()}"` : "";
    }

    container.appendChild(makeFilterBox("Filter by title or code…", draw));
    container.appendChild(countNote);
    container.appendChild(list);
    draw("");
  }
  App.renderCourseList = renderCourseList;

  function renderCourseDetail(container, code) {
    const idx = App.getIndex();
    const course = idx.courseByCode.get(code);
    const offerings = App.allOfferingsForCourse(code).sort((a, b) => {
      const sa = idx.sectionById.get(a.section), sb = idx.sectionById.get(b.section);
      return (sa ? sa.name : "").localeCompare(sb ? sb.name : "") || a.group.localeCompare(b.group);
    });

    if (!course && !offerings.length) {
      container.innerHTML = head("Course", code, "") + emptyBlock("Not found", "No offerings found for this course code this term.");
      return;
    }

    container.innerHTML = head("Course", course ? course.title : code, `${courseChip(code)}`);

    const filterState = { view: "list" };
    const body = el("div");
    container.appendChild(body);

    function draw() {
      body.innerHTML = "";
      const bar = el("div", "filterbar");
      bar.innerHTML = `
        <button class="chip-toggle ${filterState.view === "list" ? "on" : ""}" data-v="list">List</button>
        <button class="chip-toggle ${filterState.view === "week" ? "on" : ""}" data-v="week">Week view</button>
        <div class="filter-spacer"></div>
        <span class="help-text">${offerings.length} offering${offerings.length === 1 ? "" : "s"} across ${new Set(offerings.map(o => o.section)).size} section${new Set(offerings.map(o => o.section)).size === 1 ? "" : "s"}</span>`;
      bar.querySelectorAll("[data-v]").forEach((b) => b.addEventListener("click", () => { filterState.view = b.dataset.v; draw(); }));
      body.appendChild(bar);

      if (filterState.view === "week") {
        const items = offerings.flatMap((o) => o.lessons.map((l) => ({
          lesson: l, color: course ? course.color : "#64748b",
          title: (idx.sectionById.get(o.section) || {}).name + (o.group ? " " + o.group : ""),
          meta: App.teacherLabel(l.teacher) + " · " + App.roomLabel(l.room),
        })));
        const wrap = el("div");
        renderWeekGrid(wrap, items, { emptyText: "No timetabled lessons for this course." });
        body.appendChild(wrap);
        return;
      }

      const panel = el("div", "panel");
      const bySection = groupBy(offerings, (o) => o.section);
      for (const [sid, offs] of bySection) {
        const sec = idx.sectionById.get(sid);
        const head = el("div", "list-row");
        head.style.background = "var(--surface-2)";
        head.innerHTML = `<div class="offer-main"><a href="#/section/${sid}" class="offer-title" style="text-decoration:none;">${escapeHtml(sec ? sec.name : "Section")}</a></div>`;
        panel.appendChild(head);
        for (const o of offs) {
          const teachers = App.offeringTeachers(o);
          const row = el("div", "list-row");
          row.innerHTML = `
            <div class="offer-main">
              <div class="offer-title">${o.group ? `Lab group ${escapeHtml(o.group)}` : "Lecture"} · ${escapeHtml(teachers.join(", ") || "Staff TBA")}</div>
              <div class="offer-sub">${o.lessons.map((l) => `<span>${l.day} ${l.start_time}–${l.end_time} · ${escapeHtml(App.roomLabel(l.room))}</span>`).join("")}</div>
            </div>
            <button class="btn sm ${App.isPlanSelected(o.id) ? "primary" : ""}" data-add="${o.id}">${App.isPlanSelected(o.id) ? "In planner" : "Add"}</button>`;
          row.querySelector("[data-add]").addEventListener("click", (e) => {
            App.togglePlanOffering(o);
            e.target.textContent = App.isPlanSelected(o.id) ? "In planner" : "Add";
            e.target.classList.toggle("primary", App.isPlanSelected(o.id));
          });
          panel.appendChild(row);
        }
      }
      body.appendChild(panel);
    }
    draw();
  }
  App.renderCourseDetail = renderCourseDetail;

  // ---------------------------------------------------------------- TEACHERS

  function renderTeacherList(container) {
    const d = App.getData();
    const idx = App.getIndex();
    const withLoad = d.teachers.filter((t) => idx.teachersWithLoad.has(t.id)).sort((a, b) => a.name.localeCompare(b.name));
    container.innerHTML = head("Faculty", "Every teacher's load", `${withLoad.length} faculty with lessons this term. Filter below: the university's page can only show one at a time, here you can compare.`);

    const list = el("div", "panel"); list.style.marginTop = "14px";
    const countNote = el("p", "help-text");
    countNote.style.margin = "6px 0 0";

    function draw(query) {
      const shown = App.filterRanked(withLoad, query, (t) => t.name + " " + (t.dept || ""));
      list.innerHTML = "";
      for (const t of shown) {
        const n = (idx.lessonsByTeacher.get(t.id) || []).length;
        const sections = new Set((idx.lessonsByTeacher.get(t.id) || []).flatMap((l) => l.sections)).size;
        const row = document.createElement("a");
        row.href = `#/teacher/${t.id}`;
        row.className = "list-row link";
        row.innerHTML = `<div class="offer-main"><div class="offer-title">${escapeHtml(t.name)}</div>
          <div class="offer-sub">${t.dept ? `<span class="tag">${escapeHtml(t.dept)}</span>` : ""}<span>${n} lesson${n === 1 ? "" : "s"}/week · ${sections} section${sections === 1 ? "" : "s"}</span></div></div>`;
        list.appendChild(row);
      }
      if (!shown.length) list.innerHTML = App.emptyBlock("No matching faculty", "Try a different name or department.");
      countNote.textContent = query.trim() ? `${shown.length} of ${withLoad.length} faculty match "${query.trim()}"` : "";
    }

    container.appendChild(makeFilterBox("Filter by name or department…", draw));
    container.appendChild(countNote);
    container.appendChild(list);
    draw("");
  }
  App.renderTeacherList = renderTeacherList;

  function renderTeacherDetail(container, id) {
    const idx = App.getIndex();
    const teacher = idx.teacherById.get(Number(id));
    const lessons = (idx.lessonsByTeacher.get(Number(id)) || []).slice().sort(App.sortByDayStart);
    if (!teacher || !lessons.length) {
      container.innerHTML = head("Faculty", teacher ? teacher.name : "Not found", "") + emptyBlock("No lessons found", "This teacher has no timetabled lessons this term.");
      return;
    }
    container.innerHTML = head("Faculty", teacher.name, teacher.dept ? `<span class="tag">${escapeHtml(teacher.dept)}</span>` : "");

    const items = lessons.map((l) => ({
      lesson: l, color: App.courseColor(l.course),
      title: App.courseTitle(l.course),
      meta: l.sections.map((sid) => (idx.sectionById.get(sid) || {}).name).filter(Boolean).join(", ") + (l.group ? " " + l.group : "") + " · " + App.roomLabel(l.room),
    }));
    const gridWrap = el("div");
    renderWeekGrid(gridWrap, items);
    container.appendChild(gridWrap);

    const panel = el("div", "panel");
    panel.appendChild((() => { const h = el("div", "panel-head"); h.innerHTML = "<h3>Courses taught</h3>"; return h; })());
    const byCourse = groupBy(lessons, (l) => l.course);
    for (const [code, ls] of byCourse) {
      const sections = [...new Set(ls.flatMap((l) => l.sections))].map((sid) => (idx.sectionById.get(sid) || {}).name).filter(Boolean);
      const row = document.createElement("a");
      row.href = `#/course/${encodeURIComponent(code)}`;
      row.className = "list-row link";
      row.innerHTML = `<span class="tag" style="background:${tint(App.courseColor(code))}; border-color:transparent; color:${App.courseColor(code)};">●</span>
        <div class="offer-main"><div class="offer-title">${escapeHtml(App.courseTitle(code))}</div>
        <div class="offer-sub">${courseChip(code)}<span>${sections.join(", ")}</span></div></div>`;
      panel.appendChild(row);
    }
    container.appendChild(panel);
  }
  App.renderTeacherDetail = renderTeacherDetail;

  // ---------------------------------------------------------------- SECTIONS

  function renderSectionList(container) {
    const d = App.getData();
    const all = d.sections.slice().sort((a, b) => a.name.localeCompare(b.name));
    container.innerHTML = head("Sections", "Every class section", `${d.sections.length} sections. Filter below to find your own.`);

    const filterWrap = el("div");
    const resultsWrap = el("div");
    const countNote = el("p", "help-text");
    countNote.style.cssText = "margin:6px 0 0;";

    // Dozens of programs, most with a handful of sections - a bordered card
    // per program is mostly empty padding stacked forty times. A plain label
    // plus a chip row, spaced by rhythm rather than a box, scans in one pass.
    function draw(query) {
      const shown = App.filterRanked(all, query, (s) => [s.name, s.program, s.batch, s.dept].filter(Boolean).join(" "));
      resultsWrap.innerHTML = "";
      countNote.textContent = query.trim() ? `${shown.length} of ${all.length} sections match "${query.trim()}"` : "";
      if (!shown.length) { resultsWrap.appendChild((() => { const d2 = document.createElement("div"); d2.innerHTML = App.emptyBlock("No matching sections", "Try a batch year, program, or department."); return d2.firstChild; })()); return; }
      const byProgram = groupBy(shown, (s) => s.program || "Other");
      for (const [prog, secs] of byProgram) {
        const block = el("div", "group-block");
        block.innerHTML = `<h3 class="group-heading">${escapeHtml(prog)} <span class="count">${secs.length}</span></h3>`;
        const chips = el("div", "chip-row");
        for (const s of secs) {
          const a = document.createElement("a");
          a.href = `#/section/${s.id}`;
          a.className = "tag";
          a.style.textDecoration = "none";
          a.textContent = s.name;
          chips.appendChild(a);
        }
        block.appendChild(chips);
        resultsWrap.appendChild(block);
      }
    }

    filterWrap.appendChild(makeFilterBox("Filter by section, program, or batch (e.g. FA25-BCS-A)…", draw));
    filterWrap.appendChild(countNote);
    container.appendChild(filterWrap);
    container.appendChild(resultsWrap);
    draw("");
  }
  App.renderSectionList = renderSectionList;

  function renderSectionDetail(container, id) {
    const idx = App.getIndex();
    const section = idx.sectionById.get(Number(id));
    const lessons = (idx.lessonsBySection.get(Number(id)) || []).slice().sort(App.sortByDayStart);
    if (!section) { container.innerHTML = head("Section", "Not found", ""); return; }

    container.innerHTML = head("Section", section.name, [section.program, section.batch, section.dept].filter(Boolean).map((x) => `<span class="tag">${escapeHtml(x)}</span>`).join(" "));

    const courses = [...new Set(lessons.map((l) => l.course))].sort();
    const groupChoice = {};
    for (const code of courses) {
      const offs = App.offeringsFor(code, Number(id));
      const groups = [...new Set(offs.map((o) => o.group))].filter(Boolean);
      if (groups.length) groupChoice[code] = groups[0];
    }

    const bar = el("div", "filterbar");
    bar.innerHTML = `<span class="help-text">This section has choices in ${Object.keys(groupChoice).length} course${Object.keys(groupChoice).length === 1 ? "" : "s"}: pick a lab group to preview it below.</span>`;
    container.appendChild(bar);

    const groupBar = el("div", "filterbar");
    for (const code of Object.keys(groupChoice)) {
      const offs = App.offeringsFor(code, Number(id));
      const groups = [...new Set(offs.map((o) => o.group))].filter(Boolean);
      const label = el("span", "help-text");
      label.style.marginRight = "-4px";
      label.textContent = code + ":";
      groupBar.appendChild(label);
      for (const g of groups) {
        const btn = el("button", "chip-toggle" + (groupChoice[code] === g ? " on" : ""));
        btn.textContent = g;
        btn.addEventListener("click", () => { groupChoice[code] = g; drawGrid(); [...groupBar.children].forEach(c => {}); redrawChips(); });
        btn.dataset.code = code; btn.dataset.g = g;
        groupBar.appendChild(btn);
      }
    }
    if (Object.keys(groupChoice).length) container.appendChild(groupBar);
    function redrawChips() {
      groupBar.querySelectorAll("button").forEach((b) => b.classList.toggle("on", groupChoice[b.dataset.code] === b.dataset.g));
    }

    const gridWrap = el("div");
    container.appendChild(gridWrap);
    function drawGrid() {
      const visible = lessons.filter((l) => !l.group || l.group === groupChoice[l.course]);
      const items = visible.map((l) => ({
        lesson: l, color: App.courseColor(l.course), title: App.courseTitle(l.course),
        meta: App.teacherLabel(l.teacher) + " · " + App.roomLabel(l.room) + (l.group ? " · " + l.group : ""),
      }));
      renderWeekGrid(gridWrap, items);
    }
    drawGrid();
    groupBar.addEventListener("click", () => drawGrid());

    const panel = el("div", "panel");
    panel.appendChild((() => { const h = el("div", "panel-head"); h.innerHTML = "<h3>Courses this term</h3>"; return h; })());
    for (const code of courses) {
      const row = document.createElement("a");
      row.href = `#/course/${encodeURIComponent(code)}`;
      row.className = "list-row link";
      row.innerHTML = `<span class="tag" style="background:${tint(App.courseColor(code))}; border-color:transparent; color:${App.courseColor(code)};">●</span>
        <div class="offer-main"><div class="offer-title">${escapeHtml(App.courseTitle(code))}</div><div class="offer-sub">${courseChip(code)}</div></div>`;
      panel.appendChild(row);
    }
    container.appendChild(panel);
  }
  App.renderSectionDetail = renderSectionDetail;

  // ---------------------------------------------------------------- ROOMS

  function renderRoomList(container) {
    const d = App.getData();
    const rooms = d.rooms.slice().sort((a, b) => a.name.localeCompare(b.name));
    container.innerHTML = head("Rooms", "Rooms & labs", `${rooms.length} spaces in use this term. Filter below, then pick one to see when it's free.`);

    const list = el("div", "panel"); list.style.marginTop = "14px";
    const countNote = el("p", "help-text");
    countNote.style.margin = "6px 0 0";

    function draw(query) {
      const shown = App.filterRanked(rooms, query, (r) => r.name + " " + r.kind);
      list.innerHTML = "";
      for (const r of shown) {
        const row = document.createElement("a");
        row.href = `#/room/${r.id}`;
        row.className = "list-row link";
        row.innerHTML = `<div class="offer-main"><div class="offer-title">${escapeHtml(r.name)}</div></div><span class="tag">${r.kind === "lab" ? "Lab" : "Room"}</span>`;
        list.appendChild(row);
      }
      if (!shown.length) list.innerHTML = App.emptyBlock("No matching rooms", "Try a room number or 'lab'.");
      countNote.textContent = query.trim() ? `${shown.length} of ${rooms.length} rooms match "${query.trim()}"` : "";
    }

    container.appendChild(makeFilterBox("Filter by room or lab name…", draw));
    container.appendChild(countNote);
    container.appendChild(list);
    draw("");
  }
  App.renderRoomList = renderRoomList;

  function renderRoomDetail(container, id) {
    const idx = App.getIndex();
    const room = idx.roomById.get(Number(id));
    const lessons = (idx.lessonsByRoom.get(Number(id)) || []).slice().sort(App.sortByDayStart);
    if (!room) { container.innerHTML = head("Room", "Not found", ""); return; }
    container.innerHTML = head("Room", room.name, room.kind === "lab" ? '<span class="tag">Lab</span>' : "");
    const items = lessons.map((l) => ({
      lesson: l, color: App.courseColor(l.course), title: App.courseTitle(l.course),
      meta: App.teacherLabel(l.teacher) + " · " + (l.sections.map((sid) => (idx.sectionById.get(sid) || {}).name).filter(Boolean).join(", ")),
    }));
    const gridWrap = el("div");
    renderWeekGrid(gridWrap, items, { emptyText: "No lessons recorded in this room." });
    container.appendChild(gridWrap);
  }
  App.renderRoomDetail = renderRoomDetail;

  // ---------------------------------------------------------------- helpers

  function groupBy(arr, fn) {
    const m = new Map();
    for (const x of arr) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
    return m;
  }
  App.groupBy = groupBy;

  function tint(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    if (!m) return "rgba(100,116,139,0.14)";
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},0.14)`;
  }
  App.tint = tint;

  function emptyBlock(title, text) {
    return `<div class="panel"><div class="empty"><div class="big">🔍</div><h4>${escapeHtml(title)}</h4><p>${escapeHtml(text)}</p></div></div>`;
  }
  App.emptyBlock = emptyBlock;

})(window.App);
