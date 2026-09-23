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
    return `<div style="width:32px; height:32px; border-radius:2px; border:1px solid var(--rule-strong); color:var(--text); display:flex; align-items:center; justify-content:center; flex:0 0 auto;">${icon(name)}</div>`;
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

    // --- the whole section index, right here. Searching is faster if you
    // already know your code, but most people are scanning for theirs - so
    // show all of it rather than making them navigate somewhere else first.
    const d = App.getData();
    const byProgram = groupBy(
      d.sections.slice().sort((a, b) => a.name.localeCompare(b.name)),
      (sec) => sec.program || "Other"
    );
    const indexWrap = el("div", "panel");
    indexWrap.style.marginTop = "34px";
    indexWrap.appendChild((() => {
      const h = el("div", "panel-head");
      h.innerHTML = `<h3>All sections</h3><span class="help-text">${d.sections.length} across ${byProgram.size} programs</span>`;
      return h;
    })());
    const cols = el("div", "index-cols");
    for (const [prog, secs] of byProgram) {
      const block = el("div", "group-block");
      block.innerHTML = `<h3 class="group-heading">${escapeHtml(prog)} <span class="count">${secs.length}</span></h3>`;
      const chips = el("div", "chip-row");
      for (const sec of secs) {
        const a = document.createElement("a");
        a.href = `#/section/${sec.id}`;
        a.className = "tag";
        a.style.textDecoration = "none";
        a.textContent = sec.name;
        chips.appendChild(a);
      }
      block.appendChild(chips);
      cols.appendChild(block);
    }
    indexWrap.appendChild(cols);
    container.appendChild(indexWrap);
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
    input.style.cssText = "width:100%; padding:9px 11px; border-radius:2px; border:1px solid var(--rule-strong); background:transparent; color:var(--text); font:inherit;";
    input.addEventListener("input", () => onChange(input.value));
    wrap.appendChild(input);
    return wrap;
  }

  function renderCourseList(container) {
    const d = App.getData();
    const idx = App.getIndex();
    const active = d.courses.filter((c) => idx.activeCourseCodes.has(c.code)).sort((a, b) => a.title.localeCompare(b.title));
    container.innerHTML = head("Courses", "All courses offered this term", `${active.length} courses. Filter below, or use the search bar up top to jump straight to one.`);

    const list = el("div", "panel cols-2"); list.style.marginTop = "18px";
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
          <span class="swatch" style="background:${color};"></span>
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

    const list = el("div", "panel cols-2"); list.style.marginTop = "18px";
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
      row.innerHTML = `<span class="swatch" style="background:${App.courseColor(code)};"></span>
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
      row.innerHTML = `<span class="swatch" style="background:${App.courseColor(code)};"></span>
        <div class="offer-main"><div class="offer-title">${escapeHtml(App.courseTitle(code))}</div><div class="offer-sub">${courseChip(code)}</div></div>`;
      panel.appendChild(row);
    }
    container.appendChild(panel);
  }
  App.renderSectionDetail = renderSectionDetail;

  // ---------------------------------------------------------------- ROOMS

  function roomChip(r) {
    return `<a class="tag" style="text-decoration:none;" href="#/room/${r.id}">${escapeHtml(r.name)}</a>`;
  }

  /** Rooms grouped under their block heading. 111 spaces in one flat A-Z column
   *  was unreadable; by block it's a page you can actually scan. */
  function renderRoomList(container) {
    const d = App.getData();
    const rooms = d.rooms.slice().sort((a, b) => App.naturalCompare(a.name, b.name));
    container.innerHTML = head("Rooms", "Rooms & labs",
      `${rooms.length} spaces in use this term, grouped by block. Looking for somewhere empty? <a href="#/rooms/free">Find a free room</a>.`);

    const wrap = el("div");
    const countNote = el("p", "help-text");
    countNote.style.margin = "6px 0 0";

    function draw(query) {
      const shown = App.filterRanked(rooms, query, (r) => r.name + " " + r.kind);
      wrap.innerHTML = "";
      if (!shown.length) {
        wrap.innerHTML = App.emptyBlock("No matching rooms", "Try a room number like N-12, a block letter, or 'lab'.");
      } else {
        const groups = [...groupBy(shown, App.roomGroup).entries()]
          .sort((a, b) => App.roomGroupOrder(a[0]).localeCompare(App.roomGroupOrder(b[0])));
        for (const [name, list] of groups) {
          const block = el("div", "group-block");
          block.innerHTML =
            `<h3 class="group-heading">${escapeHtml(name)} <span class="count">${list.length}</span></h3>` +
            `<div class="chip-row">${list.map(roomChip).join("")}</div>`;
          wrap.appendChild(block);
        }
      }
      countNote.textContent = query.trim() ? `${shown.length} of ${rooms.length} rooms match "${query.trim()}"` : "";
    }

    container.appendChild(makeFilterBox("Filter by room or lab name…", draw));
    container.appendChild(countNote);
    container.appendChild(wrap);
    draw("");
  }
  App.renderRoomList = renderRoomList;

  const DAY_START_MIN = 8 * 60 + 30;
  const DAY_END_MIN = 20 * 60 + 30;

  function minLabel(min) {
    return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  }

  /** Who is in this lesson, as links: the section(s) and the teacher. This is the
   *  point of the room view - you find the slot you want, then you can go and
   *  ask the people actually in it. */
  function occupantLinks(l) {
    const idx = App.getIndex();
    const secs = l.sections
      .map((sid) => idx.sectionById.get(sid))
      .filter(Boolean)
      .map((sec) => `<a class="tag" style="text-decoration:none;" href="#/section/${sec.id}">${escapeHtml(sec.name)}</a>`)
      .join(" ");
    const t = l.teacher != null ? idx.teacherById.get(l.teacher) : null;
    const teacher = t
      ? `<a href="#/teacher/${t.id}">${escapeHtml(t.name)}</a>`
      : `<span class="help-text">Staff TBA</span>`;
    return { secs, teacher };
  }

  function renderRoomDetail(container, id) {
    const idx = App.getIndex();
    const room = idx.roomById.get(Number(id));
    if (!room) { container.innerHTML = head("Room", "Not found", ""); return; }
    const lessons = (idx.lessonsByRoom.get(Number(id)) || []).slice().sort(App.sortByDayStart);
    container.innerHTML = head("Room", room.name,
      `${lessons.length} lesson${lessons.length === 1 ? "" : "s"} timetabled here. <a href="#/rooms/free?day=Mo">Find a free room</a>.`);

    const items = lessons.map((l) => ({
      lesson: l, color: App.courseColor(l.course), title: App.courseTitle(l.course),
      meta: App.teacherLabel(l.teacher) + " · " + (l.sections.map((sid) => (idx.sectionById.get(sid) || {}).name).filter(Boolean).join(", ")),
    }));
    const gridWrap = el("div");
    renderWeekGrid(gridWrap, items, { emptyText: "No lessons recorded in this room." });
    container.appendChild(gridWrap);

    if (!lessons.length) return;

    // Booked slots, spelled out with links - the grid shows you *when*, this
    // shows you *who*, which is what you need to arrange a swap.
    const booked = el("div", "panel");
    booked.style.marginTop = "30px";
    booked.appendChild((() => {
      const h = el("div", "panel-head");
      h.innerHTML = `<h3>Who's in here</h3><span class="help-text">Click a class or teacher to open their full timetable</span>`;
      return h;
    })());
    for (const [day, dayLessons] of groupBy(lessons, (l) => l.day)) {
      const block = el("div", "group-block");
      let rows = "";
      for (const l of dayLessons) {
        const { secs, teacher } = occupantLinks(l);
        rows += `<div class="list-row">
          <span class="swatch" style="background:${App.courseColor(l.course)};"></span>
          <span class="when">${l.start_time}–${l.end_time}</span>
          <div class="offer-main">
            <div class="offer-title"><a href="#/course/${encodeURIComponent(l.course)}" style="text-decoration:none;">${escapeHtml(App.courseTitle(l.course))}</a>${l.group ? ` <span class="help-text">${escapeHtml(l.group)}</span>` : ""}</div>
            <div class="offer-sub">${secs} ${teacher}</div>
          </div>
        </div>`;
      }
      block.innerHTML = `<h3 class="group-heading">${escapeHtml(App.DAY_LABEL[day] || day)} <span class="count">${dayLessons.length}</span></h3>${rows}`;
      booked.appendChild(block);
    }
    container.appendChild(booked);

    // Gaps, per day. Useful on its own ("is this lab free after 3?") and the
    // reason you'd look at one room rather than search all of them.
    const freeWrap = el("div", "panel");
    freeWrap.style.marginTop = "30px";
    freeWrap.appendChild((() => {
      const h = el("div", "panel-head");
      h.innerHTML = `<h3>Free windows</h3><span class="help-text">Between ${minLabel(DAY_START_MIN)} and ${minLabel(DAY_END_MIN)}</span>`;
      return h;
    })());
    const rows = el("div");
    for (const day of App.DAYS) {
      const busy = lessons.filter((l) => l.day === day)
        .map((l) => [App.timeToMin(l.start_time), App.timeToMin(l.end_time)])
        .sort((a, b) => a[0] - b[0]);
      const gaps = [];
      let cursor = DAY_START_MIN;
      for (const [bs, be] of busy) {
        if (bs > cursor) gaps.push([cursor, bs]);
        cursor = Math.max(cursor, be);
      }
      if (cursor < DAY_END_MIN) gaps.push([cursor, DAY_END_MIN]);
      const row = el("div", "list-row");
      row.innerHTML = `<span class="when" style="min-width:92px;">${escapeHtml(App.DAY_LABEL[day] || day)}</span>
        <div class="offer-main"><div class="offer-sub">${
          gaps.length
            ? gaps.map(([a, b]) => `<span class="tag">${minLabel(a)}–${minLabel(b)}</span>`).join(" ")
            : `<span class="help-text">Booked all day</span>`
        }</div></div>`;
      rows.appendChild(row);
    }
    freeWrap.appendChild(rows);
    container.appendChild(freeWrap);
  }
  App.renderRoomDetail = renderRoomDetail;

  /** Pick a day and a window, get every room with nothing in it. The occupied
   *  list below is deliberately part of the same answer: when nothing is free,
   *  the next question is always "who's in there and can we swap?". */
  function renderFreeRooms(container, params) {
    const state = {
      day: App.DAYS.includes(params.day) ? params.day : "Mo",
      start: Number(params.start) || DAY_START_MIN,
      end: Number(params.end) || DAY_START_MIN + 60,
      kind: ["all", "room", "lab"].includes(params.kind) ? params.kind : "all",
    };

    container.innerHTML = head("Rooms", "Find a free room",
      "Pick a day and a time window. You'll get every room with nothing timetabled in it, and underneath, what's occupying the rest.");

    const controls = el("div", "panel");
    const results = el("div");

    // --- day
    const dayRow = el("div", "group-block");
    dayRow.innerHTML = `<h3 class="group-heading">Day</h3>`;
    const dayChips = el("div", "chip-row");
    for (const day of App.DAYS) {
      const b = el("button", "chip-toggle" + (day === state.day ? " on" : ""));
      b.textContent = App.DAY_LABEL[day] || day;
      b.addEventListener("click", () => {
        state.day = day;
        [...dayChips.children].forEach((c) => c.classList.toggle("on", c === b));
        draw();
      });
      dayChips.appendChild(b);
    }
    dayRow.appendChild(dayChips);
    controls.appendChild(dayRow);

    // --- window
    const timeRow = el("div", "group-block");
    timeRow.innerHTML = `<h3 class="group-heading">Time</h3>`;
    const timeInner = el("div");
    timeInner.style.cssText = "display:flex; align-items:center; gap:10px; flex-wrap:wrap;";
    function timeSelect(value, onChange) {
      const sel = el("select");
      sel.style.cssText = "padding:6px 8px; border:1px solid var(--rule-strong); border-radius:2px; background:transparent;";
      for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += 30) {
        const o = document.createElement("option");
        o.value = String(m);
        o.textContent = minLabel(m);
        if (m === value) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener("change", () => onChange(Number(sel.value)));
      return sel;
    }
    const startSel = timeSelect(state.start, (v) => { state.start = v; if (state.end <= v) { state.end = Math.min(v + 30, DAY_END_MIN); syncEnd(); } draw(); });
    const endSel = timeSelect(state.end, (v) => { state.end = v; draw(); });
    function syncEnd() { endSel.value = String(state.end); }
    timeInner.appendChild(startSel);
    timeInner.appendChild(Object.assign(document.createElement("span"), { className: "help-text", textContent: "to" }));
    timeInner.appendChild(endSel);
    timeRow.appendChild(timeInner);
    controls.appendChild(timeRow);

    // --- kind
    const kindRow = el("div", "group-block");
    kindRow.innerHTML = `<h3 class="group-heading">Kind</h3>`;
    const kindChips = el("div", "chip-row");
    for (const [key, label] of [["all", "Everything"], ["room", "Classrooms"], ["lab", "Labs"]]) {
      const b = el("button", "chip-toggle" + (key === state.kind ? " on" : ""));
      b.textContent = label;
      b.addEventListener("click", () => {
        state.kind = key;
        [...kindChips.children].forEach((c) => c.classList.toggle("on", c === b));
        draw();
      });
      kindChips.appendChild(b);
    }
    kindRow.appendChild(kindChips);
    controls.appendChild(kindRow);

    container.appendChild(controls);
    container.appendChild(results);

    function draw() {
      results.innerHTML = "";
      if (state.end <= state.start) {
        results.innerHTML = App.emptyBlock("That window runs backwards", "Pick an end time later than the start time.");
        return;
      }
      const { free, busy } = App.findFreeRooms(state.day, state.start, state.end, { kind: state.kind });
      const windowLabel = `${App.DAY_LABEL[state.day] || state.day} ${minLabel(state.start)}–${minLabel(state.end)}`;

      const freeWrap = el("div", "panel");
      freeWrap.style.marginTop = "30px";
      freeWrap.appendChild((() => {
        const h = el("div", "panel-head");
        h.innerHTML = `<h3>Free · ${free.length}</h3><span class="help-text">${escapeHtml(windowLabel)}</span>`;
        return h;
      })());
      if (!free.length) {
        freeWrap.innerHTML += App.emptyBlock("Nothing free in that window", "Try a shorter window, a different time, or check the occupied list below for a swap.");
      } else {
        const groups = [...groupBy(free, App.roomGroup).entries()]
          .sort((a, b) => App.roomGroupOrder(a[0]).localeCompare(App.roomGroupOrder(b[0])));
        for (const [name, list] of groups) {
          const block = el("div", "group-block");
          block.innerHTML =
            `<h3 class="group-heading">${escapeHtml(name)} <span class="count">${list.length}</span></h3>` +
            `<div class="chip-row">${list.map(roomChip).join("")}</div>`;
          freeWrap.appendChild(block);
        }
      }
      results.appendChild(freeWrap);

      const busyWrap = el("div", "panel");
      busyWrap.style.marginTop = "30px";
      const bh = el("div", "panel-head");
      bh.style.cursor = "pointer";
      bh.innerHTML = `<h3>Occupied · ${busy.length}</h3><span class="help-text">Show who's in them</span>`;
      busyWrap.appendChild(bh);
      const busyBody = el("div");
      busyBody.classList.add("hidden");
      let built = false;
      bh.addEventListener("click", () => {
        if (!built) {
          for (const { room, lessons } of busy) {
            for (const l of lessons) {
              const { secs, teacher } = occupantLinks(l);
              const row = el("div", "list-row");
              row.innerHTML = `<span class="swatch" style="background:${App.courseColor(l.course)};"></span>
                <span class="when" style="min-width:104px;"><a href="#/room/${room.id}" style="text-decoration:none;">${escapeHtml(room.name)}</a></span>
                <div class="offer-main">
                  <div class="offer-title">${escapeHtml(App.courseTitle(l.course))} <span class="help-text">${l.start_time}–${l.end_time}</span></div>
                  <div class="offer-sub">${secs} ${teacher}</div>
                </div>`;
              busyBody.appendChild(row);
            }
          }
          built = true;
        }
        busyBody.classList.toggle("hidden");
        bh.querySelector(".help-text").textContent = busyBody.classList.contains("hidden") ? "Show who's in them" : "Hide";
      });
      busyWrap.appendChild(busyBody);
      results.appendChild(busyWrap);
    }

    draw();
  }
  App.renderFreeRooms = renderFreeRooms;

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
