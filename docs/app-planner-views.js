/* ============================================================================
   app-planner-views.js — Planner, Auto-build, and Swap finder. The three
   views that actually answer "which courses/teachers should I pick".
   ============================================================================ */
window.App = window.App || {};

(function (App) {
  const { el, escapeHtml, renderWeekGrid, groupBy, tint } = App;

  // ---------------------------------------------------------------- PLANNER

  function renderPlanner(container) {
    const idx = App.getIndex();
    container.innerHTML = App._head("Planner", "Your week", "Add offerings from any course, teacher, or section page. Clashes are flagged in red the moment they happen.");

    const toolbar = el("div", "filterbar");
    const shareBtn = el("button", "btn sm"); shareBtn.textContent = "Copy shareable link";
    const clearBtn = el("button", "btn sm"); clearBtn.textContent = "Clear plan";
    toolbar.appendChild(shareBtn); toolbar.appendChild(clearBtn);
    const spacer = el("div", "filter-spacer"); toolbar.appendChild(spacer);
    const statusLine = el("span", "help-text"); statusLine.style.fontWeight = "560";
    toolbar.appendChild(statusLine);
    container.appendChild(toolbar);

    const gridWrap = el("div"); gridWrap.style.marginTop = "14px"; container.appendChild(gridWrap);
    const listWrap = el("div"); container.appendChild(listWrap);

    shareBtn.addEventListener("click", async () => {
      const url = location.origin + location.pathname + "#/planner?sel=" + App.planToParam();
      try { await navigator.clipboard.writeText(url); shareBtn.textContent = "Link copied ✓"; setTimeout(() => (shareBtn.textContent = "Copy shareable link"), 1600); }
      catch (e) { prompt("Copy this link:", url); }
    });
    clearBtn.addEventListener("click", () => { if (confirm("Remove all offerings from your plan?")) App.clearPlan(); });

    function draw() {
      const offerings = App.getPlanOfferings();
      const clashIds = App.findClashes(offerings);
      const allLessons = offerings.flatMap((o) => o.lessons);
      const days = new Set(allLessons.map((l) => l.day)).size;
      const earliest = allLessons.length ? Math.min(...allLessons.map((l) => App.timeToMin(l.start_time))) : null;
      const latest = allLessons.length ? Math.max(...allLessons.map((l) => App.timeToMin(l.end_time))) : null;
      const clashCount = clashIds.size ? clashIds.size / 2 : 0;

      // One status line instead of five boxed stat tiles - what matters most
      // (clash-free or not) is the badge; the rest is context, not headline.
      statusLine.innerHTML = offerings.length
        ? `${offerings.length} offering${offerings.length === 1 ? "" : "s"} · ${days} day${days === 1 ? "" : "s"}` +
          (earliest != null ? ` · ${fmtT(earliest)}–${fmtT(latest)}` : "") +
          ` <span class="tag ${clashCount ? "bad" : "ok"}" style="margin-left:6px;">${clashCount ? `${clashCount} clash${clashCount === 1 ? "" : "es"}` : "clash-free"}</span>`
        : "";

      const items = offerings.flatMap((o) => o.lessons.map((l) => ({
        lesson: l, color: App.courseColor(l.course), title: App.courseTitle(l.course),
        meta: App.teacherLabel(l.teacher) + " · " + App.roomLabel(l.room) + (o.group ? " · " + o.group : ""),
        clash: clashIds.has(l.id),
      })));

      listWrap.innerHTML = "";
      if (!offerings.length) {
        gridWrap.innerHTML = "";
        listWrap.appendChild((() => { const e = el("div", "empty"); e.innerHTML = `<div class="big">🧺</div><h4>Your plan is empty</h4><p>Go to <a href="#/courses">Courses</a> or <a href="#/autobuild">Auto-build</a> and add a section's offering - it'll show up here.</p>`; return e; })());
        return;
      }

      renderWeekGrid(gridWrap, items, { emptyText: "" });

      const listPanel = el("div", "panel"); listPanel.style.marginTop = "14px";
      listPanel.appendChild((() => { const h = el("div", "panel-head"); h.innerHTML = `<h3>Selected offerings</h3>`; return h; })());
      for (const o of offerings) {
        const sec = idx.sectionById.get(o.section);
        const hasClash = o.lessons.some((l) => clashIds.has(l.id));
        const row = el("div", "offer-row");
        row.innerHTML = `
          <span class="swatch" style="background:${App.courseColor(o.course)};"></span>
          <div class="offer-main">
            <div class="offer-title">${escapeHtml(App.courseTitle(o.course))} ${hasClash ? '<span class="tag bad">clash</span>' : ""}</div>
            <div class="offer-sub"><span>${escapeHtml(sec ? sec.name : "")}${o.group ? " · " + escapeHtml(o.group) : ""}</span><span>${escapeHtml(App.offeringTeachers(o).join(", ") || "Staff TBA")}</span></div>
          </div>
          <a class="btn sm ghost" href="#/course/${encodeURIComponent(o.course)}">View</a>
          <button class="btn sm" data-swap>Swap</button>
          <button class="btn sm" data-remove>Remove</button>`;
        row.querySelector("[data-remove]").addEventListener("click", () => App.removePlanOffering(o.id));
        row.querySelector("[data-swap]").addEventListener("click", () => { location.hash = `#/swap?course=${encodeURIComponent(o.course)}`; });
        listPanel.appendChild(row);
      }
      listWrap.appendChild(listPanel);
    }

    App.onPlanChange(draw);
    draw();
  }
  App.renderPlanner = renderPlanner;

  function fmtT(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function fmtDur(min) {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  // ---------------------------------------------------------------- AUTO-BUILD

  /** A text input with a click-through suggestion dropdown underneath it - the
   *  pattern the header search uses, generalized so every picker in the app
   *  shares one implementation instead of re-wiring mousedown/blur races each time.
   *  `getMatches(query)` returns [{key, title, sub}]; `onPick(key)` handles a choice. */
  function makeInlineSearch({ placeholder, getMatches, onPick }) {
    const wrap = el("div");
    wrap.style.cssText = "position:relative;";
    const input = document.createElement("input");
    input.placeholder = placeholder;
    input.autocomplete = "off";
    input.style.cssText = "width:100%; padding:9px 11px; border-radius:2px; border:1px solid var(--rule-strong); background:transparent; color:var(--text); font:inherit;";
    const box = el("div", "search-results hidden");
    box.style.cssText = "top:calc(100% + 4px);";
    wrap.appendChild(input);
    wrap.appendChild(box);

    function draw() {
      const matches = getMatches(input.value.trim());
      if (!matches.length) { box.classList.add("hidden"); box.innerHTML = ""; return; }
      // Buttons, not links: picking a suggestion adds it to the plan in place,
      // it never navigates anywhere - no href for a no-op click to fall back on.
      box.innerHTML = matches.map((d) => `
        <button type="button" class="search-row" data-key="${escapeHtml(String(d.key))}">
          <span class="search-row-title"><span class="t">${escapeHtml(d.title)}</span></span>
          <span class="search-row-meta mono">${escapeHtml(d.sub || "")}</span>
        </button>`).join("");
      box.classList.remove("hidden");
    }
    function pick(key) {
      onPick(key);
      input.value = "";
      box.classList.add("hidden");
      input.focus();
    }
    input.addEventListener("input", draw);
    input.addEventListener("focus", draw);
    box.addEventListener("mousedown", (e) => {
      // preventDefault stops the input from blurring on click, so the blur
      // handler below never fires and hides the box out from under the click.
      const row = e.target.closest(".search-row");
      if (row) { e.preventDefault(); pick(row.dataset.key); }
    });
    input.addEventListener("blur", () => box.classList.add("hidden"));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const matches = getMatches(input.value.trim());
        if (matches.length) pick(matches[0].key);
      } else if (e.key === "Escape") {
        box.classList.add("hidden");
      }
    });
    return wrap;
  }
  App.makeInlineSearch = makeInlineSearch;

  /** Every distinct section that offers `code` at all, sorted by name. */
  function sectionsOffering(idx, code) {
    const sids = [...new Set(App.allOfferingsForCourse(code).map((o) => o.section))];
    return sids.map((sid) => idx.sectionById.get(sid)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Distinct lab groups `code` runs within one section (empty if it doesn't split). */
  function groupsFor(code, sectionId) {
    return [...new Set(App.offeringsFor(code, sectionId).map((o) => o.group).filter(Boolean))].sort();
  }

  function renderAutoBuild(container) {
    const idx = App.getIndex();
    container.innerHTML = App._head("Auto-build", "Find a clash-free combination", "Load your section's course list, then adjust: drop what you're not taking, pin a course to a specific section or lab group to narrow the search, or add electives from anywhere. Clash-free combinations are ranked first by fewest campus days and least idle time. If none exist, you'll see the closest ones instead, with each overlap spelled out.");

    // course -> { sectionId: number|null (null = any section), group: "any"|string }
    const state = { courses: new Map(App.getPlanCourseCodes().map((c) => [c, { sectionId: null, group: "any" }])), noSat: false, allowClashes: false, baseSection: null };

    const pick = el("div", "panel");
    pick.appendChild((() => { const h = el("div", "panel-head"); h.innerHTML = "<h3>Courses to include</h3>"; return h; })());
    const pickBody = el("div", "panel-body");

    // --- start from a section: pre-loads its actual course list, each pinned to
    // that section by default (that's the timing the student is actually stuck
    // with) - the row controls below let them loosen or override it per course.
    const sectionRow = el("div");
    sectionRow.style.cssText = "display:flex; gap:8px; align-items:flex-start; margin-bottom:14px;";
    const sectionSearch = makeInlineSearch({
      placeholder: "Start from your section, e.g. FA25-BCS-A…",
      getMatches: (q) => q ? App.search(q, 8).filter((d) => d.kind === "section") : [],
      onPick: (sidStr) => {
        const sid = Number(sidStr);
        const sec = idx.sectionById.get(sid);
        const codes = [...new Set((idx.lessonsBySection.get(sid) || []).map((l) => l.course))];
        for (const c of codes) state.courses.set(c, { sectionId: sid, group: "any" });
        state.baseSection = sec ? sec.name : null;
        redrawChosen();
      },
    });
    sectionSearch.style.flex = "1 1 auto";
    sectionRow.appendChild(sectionSearch);
    pickBody.appendChild(sectionRow);

    const searchWrap = makeInlineSearch({
      placeholder: "…or add one course at a time by title or code",
      getMatches: (q) => q ? App.search(q, 8).filter((d) => d.kind === "course" && !state.courses.has(d.key)) : [],
      onPick: (code) => { state.courses.set(code, { sectionId: null, group: "any" }); redrawChosen(); },
    });
    pickBody.appendChild(searchWrap);
    const chosenWrap = el("div");
    pickBody.appendChild(chosenWrap);
    pick.appendChild(pickBody);
    container.appendChild(pick);

    function redrawChosen() {
      chosenWrap.innerHTML = "";
      if (!state.courses.size) {
        const hint = el("p", "help-text");
        hint.style.margin = "8px 0 0";
        hint.textContent = state.baseSection
          ? `Every course from ${state.baseSection} was removed.`
          : "No courses added yet. Start from your section above, or add one by one.";
        chosenWrap.appendChild(hint);
        return;
      }
      if (state.baseSection) {
        const note = el("p", "help-text");
        note.style.margin = "8px 0 8px";
        note.textContent = `Based on ${state.baseSection}. Each course is pinned to that section by default. Switch to "Any section" to shop electives or repeats around it.`;
        chosenWrap.appendChild(note);
      }
      const list = el("div", "panel");
      list.style.cssText = "border-color:var(--border-soft);";
      for (const [code, constraint] of state.courses) {
        list.appendChild(courseConstraintRow(code, constraint));
      }
      chosenWrap.appendChild(list);
    }

    function courseConstraintRow(code, constraint) {
      const row = el("div", "offer-row");
      const sections = sectionsOffering(idx, code);
      const swatch = el("span", "swatch");
      swatch.style.cssText = `background:${App.courseColor(code)}; margin-top:6px;`;
      row.appendChild(swatch);

      const main = el("div", "offer-main");
      main.innerHTML = `<div class="offer-title">${escapeHtml(App.courseTitle(code))} <span class="mono" style="font-weight:400; opacity:.65; font-size:11px;">${escapeHtml(code)}</span></div>`;

      const controls = el("div");
      controls.style.cssText = "display:flex; gap:8px; margin-top:6px; flex-wrap:wrap;";

      const sectionSel = document.createElement("select");
      sectionSel.className = "chip-select";
      sectionSel.innerHTML = `<option value="">Any section (${sections.length})</option>` +
        sections.map((s) => `<option value="${s.id}" ${constraint.sectionId === s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("");
      sectionSel.addEventListener("change", () => {
        constraint.sectionId = sectionSel.value ? Number(sectionSel.value) : null;
        constraint.group = "any";
        redrawChosen();
      });
      controls.appendChild(sectionSel);

      if (constraint.sectionId != null) {
        const groups = groupsFor(code, constraint.sectionId);
        if (groups.length) {
          const groupSel = document.createElement("select");
          groupSel.className = "chip-select";
          groupSel.innerHTML = `<option value="any">Any group</option>` +
            groups.map((g) => `<option value="${escapeHtml(g)}" ${constraint.group === g ? "selected" : ""}>Group ${escapeHtml(g)}</option>`).join("");
          groupSel.addEventListener("change", () => { constraint.group = groupSel.value; });
          controls.appendChild(groupSel);
        }
      }
      main.appendChild(controls);
      row.appendChild(main);

      const rm = el("button", "btn sm ghost");
      rm.textContent = "Remove";
      rm.addEventListener("click", () => { state.courses.delete(code); redrawChosen(); });
      row.appendChild(rm);
      return row;
    }
    redrawChosen();

    const opts = el("div", "filterbar");
    const satBtn = el("button", "chip-toggle"); satBtn.textContent = "No Saturday";
    satBtn.addEventListener("click", () => { state.noSat = !state.noSat; satBtn.classList.toggle("on", state.noSat); });
    opts.appendChild(satBtn);
    const clashBtn = el("button", "chip-toggle");
    clashBtn.textContent = "Allow clashes";
    clashBtn.title = "Also show combinations that overlap, ranked by least overlap first";
    clashBtn.addEventListener("click", () => { state.allowClashes = !state.allowClashes; clashBtn.classList.toggle("on", state.allowClashes); });
    opts.appendChild(clashBtn);
    const runBtn = el("button", "btn primary"); runBtn.textContent = "Generate combinations";
    const spacer = el("div", "filter-spacer"); opts.appendChild(spacer); opts.appendChild(runBtn);
    container.appendChild(opts);

    const resultsWrap = el("div"); container.appendChild(resultsWrap);

    runBtn.addEventListener("click", () => {
      if (!state.courses.size) { resultsWrap.innerHTML = App.emptyBlock("Pick at least one course", "Add a course above first."); return; }
      const combos = buildCombinations(state.courses, { noSat: state.noSat, allowClashes: state.allowClashes });
      renderCombos(resultsWrap, combos);
    });

    if (state.courses.size) runBtn.click();
  }
  App.renderAutoBuild = renderAutoBuild;

  /** For each course, gather offerings honouring that course's own section/group
   *  pin (or every section, if left open) — then backtrack across courses, pruning
   *  on clash; capped so a wide-open course can't blow up the search. */
  /** Minutes two offerings actually overlap, plus which lessons did it.
   *  Memoised: the backtracker asks the same pair many times over. */
  const clashMemo = new Map();
  function offeringClash(offA, offB) {
    const key = offA.id < offB.id ? offA.id + "|" + offB.id : offB.id + "|" + offA.id;
    let hit = clashMemo.get(key);
    if (hit) return hit;
    let minutes = 0;
    const pairs = [];
    for (const a of offA.lessons) {
      for (const b of offB.lessons) {
        if (a.day !== b.day) continue;
        const s0 = Math.max(App.timeToMin(a.start_time), App.timeToMin(b.start_time));
        const e0 = Math.min(App.timeToMin(a.end_time), App.timeToMin(b.end_time));
        if (e0 > s0) {
          minutes += e0 - s0;
          pairs.push({ day: a.day, start: s0, end: e0, minutes: e0 - s0, aId: a.id, bId: b.id });
        }
      }
    }
    hit = { minutes, pairs };
    clashMemo.set(key, hit);
    return hit;
  }

  /** For each course, gather offerings honouring that course's own section/group
   *  pin (or every section, if left open) then backtrack across courses.
   *
   *  Clashes are budgeted rather than forbidden outright. A clash-free week is
   *  obviously preferred and always ranked first, but "these two overlap by 30
   *  minutes" is a decision a student can actually make, and refusing to show
   *  it (the old behaviour) just left them with "no combination exists" and no
   *  idea how close they were. */
  function buildCombinations(courseConstraints, { noSat = false, allowClashes = false } = {}) {
    const entries = [...courseConstraints.entries()];
    const perCourse = entries.map(([code, constraint]) => {
      let offs = App.allOfferingsForCourse(code);
      if (constraint.sectionId != null) offs = offs.filter((o) => o.section === constraint.sectionId);
      if (constraint.group && constraint.group !== "any") offs = offs.filter((o) => o.group === constraint.group);
      if (noSat) offs = offs.filter((o) => !o.lessons.some((l) => l.day === "Sa"));
      return offs;
    });
    if (perCourse.some((offs) => !offs.length)) return { impossible: entries.filter((_, i) => !perCourse[i].length).map(([code]) => code) };

    const MAX_RESULTS = 60;

    function search(budget, requireClash) {
      const found = [];
      function backtrack(i, chosen, clashMin, clashPairs) {
        if (found.length >= MAX_RESULTS) return;
        if (i === perCourse.length) {
          if (requireClash && clashMin === 0) return;   // the clash-free pass already has these
          found.push({ offs: chosen.slice(), clashMin, clashPairs: clashPairs.slice() });
          return;
        }
        for (const off of perCourse[i]) {
          if (found.length >= MAX_RESULTS) return;
          let added = 0;
          const newPairs = [];
          for (const c of chosen) {
            const { minutes, pairs } = offeringClash(c, off);
            if (!minutes) continue;
            added += minutes;
            for (const pr of pairs) newPairs.push({ ...pr, a: c, b: off });
          }
          if (clashMin + added > budget) continue;
          chosen.push(off);
          backtrack(i + 1, chosen, clashMin + added, clashPairs.concat(newPairs));
          chosen.pop();
        }
      }
      backtrack(0, [], 0, []);
      return found;
    }

    const clean = search(0, false);
    // Show near-misses when asked for them, and always when there is no clean
    // answer at all - "closest possible" beats a dead end.
    const dirty = (allowClashes || !clean.length) ? search(240, true) : [];
    const results = clean.concat(dirty);

    for (const combo of results) {
      const lessons = combo.offs.flatMap((o) => o.lessons);
      const days = new Set(lessons.map((l) => l.day));
      const earliest = Math.min(...lessons.map((l) => App.timeToMin(l.start_time)));
      const latest = Math.max(...lessons.map((l) => App.timeToMin(l.end_time)));
      combo.score = { days: days.size, earliest, latest, gap: computeGapMinutes(lessons) };
    }
    results.sort((a, b) =>
      a.clashMin - b.clashMin ||
      a.score.days - b.score.days ||
      a.score.gap - b.score.gap ||
      a.score.earliest - b.score.earliest);

    return {
      combos: results.slice(0, 20),
      total: results.length,
      cleanCount: clean.length,
    };
  }

  function hasOverlap(offA, offB) {
    for (const a of offA.lessons) for (const b of offB.lessons) if (App.overlaps(a, b)) return true;
    return false;
  }

  function computeGapMinutes(lessons) {
    const byDay = groupBy(lessons, (l) => l.day);
    let gap = 0;
    for (const [, ls] of byDay) {
      const sorted = ls.slice().sort((a, b) => a.start - b.start);
      for (let i = 1; i < sorted.length; i++) {
        const prevEnd = App.timeToMin(sorted[i - 1].end_time);
        const curStart = App.timeToMin(sorted[i].start_time);
        if (curStart > prevEnd) gap += curStart - prevEnd;
      }
    }
    return gap;
  }

  function renderCombos(container, result) {
    container.innerHTML = "";
    if (result.impossible) {
      container.appendChild((() => { const d = document.createElement("div"); d.innerHTML = App.emptyBlock("No offerings found", "These course codes have no timetabled lessons: " + result.impossible.join(", ")); return d.firstChild; })());
      return;
    }
    if (!result.combos.length) { container.innerHTML = App.emptyBlock("Nothing fits, even with overlaps", "Every combination of these courses overlaps by more than four hours. Try dropping a course, opening a pinned section to \"Any section\", or turning off 'No Saturday'."); return; }
    const note = el("p", "help-text");
    note.style.margin = "0 0 14px";
    note.textContent = result.cleanCount
      ? `${result.cleanCount} clash-free combination${result.cleanCount === 1 ? "" : "s"} found. Showing the best ${result.combos.length}, ranked by fewest campus days then least idle time.`
      : `No clash-free combination exists. Showing the ${result.combos.length} closest, ranked by least overlap first, so you can see exactly what a given clash would cost you.`;
    container.appendChild(note);

    result.combos.forEach((combo, i) => {
      const idx = App.getIndex();
      const panel = el("div", "panel");
      const head = el("div", "panel-head");
      head.style.cursor = "pointer";
      head.innerHTML = `<h3>Option ${i + 1}</h3>` +
        `<span class="help-text">` +
        (combo.clashMin
          ? `<span class="tag bad" style="margin-right:8px;">${fmtDur(combo.clashMin)} clash</span>`
          : `<span class="tag ok" style="margin-right:8px;">clash-free</span>`) +
        `${combo.score.days} day${combo.score.days === 1 ? "" : "s"} · ${fmtT(combo.score.earliest)}–${fmtT(combo.score.latest)} · ${Math.round(combo.score.gap / 60 * 10) / 10}h idle</span>`;
      panel.appendChild(head);
      const body = el("div", "panel-body");
      body.style.display = "flex"; body.style.flexDirection = "column"; body.style.gap = "6px";
      const clashedOfferingIds = new Set(combo.clashPairs.flatMap((pr) => [pr.a.id, pr.b.id]));
      for (const o of combo.offs) {
        const sec = idx.sectionById.get(o.section);
        const line = el("div");
        line.style.fontSize = "12.5px";
        line.innerHTML = (clashedOfferingIds.has(o.id) ? `<span class="swatch" style="background:var(--bad-55); margin-right:6px; vertical-align:middle;"></span>` : "") +
          `<strong>${escapeHtml(App.courseTitle(o.course))}</strong> · ${escapeHtml(sec ? sec.name : "")}${o.group ? " " + escapeHtml(o.group) : ""} · ${escapeHtml(App.offeringTeachers(o).join(", ") || "Staff TBA")}`;
        body.appendChild(line);
      }

      // Spell out each overlap: which two courses, which day, which minutes.
      // "30 min clash" alone doesn't tell you whether you can live with it.
      if (combo.clashPairs.length) {
        const detail = el("div", "clash-detail");
        detail.innerHTML = combo.clashPairs.map((pr) =>
          `<div class="clash-line"><strong>${escapeHtml(App.courseTitle(pr.a.course))}</strong> overlaps <strong>${escapeHtml(App.courseTitle(pr.b.course))}</strong>` +
          ` <span class="when">${escapeHtml(pr.day)} ${fmtT(pr.start)}–${fmtT(pr.end)}</span> <span class="amt">${fmtDur(pr.minutes)}</span></div>`
        ).join("");
        body.appendChild(detail);
      }

      const actionsRow = el("div");
      actionsRow.style.cssText = "display:flex; gap:8px; margin-top:8px;";
      const previewBtn = el("button", "btn sm");
      previewBtn.textContent = "Hide timetable";
      const useBtn = el("button", "btn primary sm");
      useBtn.textContent = "Use this combination";
      useBtn.addEventListener("click", () => {
        App.clearPlan();
        for (const o of combo.offs) App.togglePlanOffering(o);
        location.hash = "#/planner";
      });
      actionsRow.appendChild(previewBtn);
      actionsRow.appendChild(useBtn);
      body.appendChild(actionsRow);

      const gridWrap = el("div");
      gridWrap.style.marginTop = "10px";
      body.appendChild(gridWrap);

      let shown = false;
      function drawGrid() {
        const clashLessonIds = new Set(combo.clashPairs.flatMap((pr) => [pr.aId, pr.bId]));
        const items = combo.offs.flatMap((o) => o.lessons.map((l) => ({
          lesson: l, color: App.courseColor(o.course), title: App.courseTitle(o.course),
          meta: App.offeringTeachers(o).join(", ") + " · " + App.roomLabel(l.room),
          clash: clashLessonIds.has(l.id),
        })));
        renderWeekGrid(gridWrap, items, { compact: true });
      }
      function setShown(v) {
        shown = v;
        previewBtn.textContent = shown ? "Hide timetable" : "Show timetable";
        gridWrap.classList.toggle("hidden", !shown);
        if (shown && !gridWrap.dataset.drawn) { drawGrid(); gridWrap.dataset.drawn = "1"; }
      }
      previewBtn.addEventListener("click", () => setShown(!shown));
      head.addEventListener("click", () => setShown(!shown));
      setShown(i === 0); // the top-ranked option previews itself; the rest are one click away

      panel.appendChild(body);
      container.appendChild(panel);
    });
  }

  // ---------------------------------------------------------------- SWAP FINDER

  function renderSwapFinder(container, params) {
    const idx = App.getIndex();
    const initialCourse = params.course || "";
    container.innerHTML = App._head("Swap finder", "Find an alternative that fits", "Pick a course already in your plan. We'll show every other section/teacher/time for it that doesn't clash with the rest of your plan.");

    const bar = el("div", "filterbar");
    const select = document.createElement("select");
    select.className = "chip-select";
    const planCourses = App.getPlanCourseCodes();
    if (!planCourses.length) {
      container.appendChild(bar);
      container.appendChild((() => { const d = document.createElement("div"); d.innerHTML = App.emptyBlock("Your plan is empty", "Add offerings in Courses or Planner first, then come back here to explore swaps."); return d.firstChild; })());
      return;
    }
    select.innerHTML = planCourses.map((c) => `<option value="${escapeHtml(c)}" ${c === initialCourse ? "selected" : ""}>${escapeHtml(App.courseTitle(c))}</option>`).join("");
    bar.appendChild(select);
    container.appendChild(bar);

    const resultsWrap = el("div"); container.appendChild(resultsWrap);

    function draw() {
      const code = select.value;
      const currentPlan = App.getPlanOfferings();
      const currentForCourse = currentPlan.find((o) => o.course === code);
      const rest = currentPlan.filter((o) => o.course !== code);
      const alternatives = App.allOfferingsForCourse(code).filter((o) => !currentForCourse || o.id !== currentForCourse.id);

      resultsWrap.innerHTML = "";
      const panel = el("div", "panel");
      panel.appendChild((() => { const h = el("div", "panel-head"); h.innerHTML = `<h3>Alternatives for ${escapeHtml(App.courseTitle(code))}</h3>`; return h; })());
      let anyFit = false;
      for (const o of alternatives) {
        const sec = idx.sectionById.get(o.section);
        const clashesWithRest = rest.some((r) => hasOverlap(r, o));
        if (!clashesWithRest) anyFit = true;
        const row = el("div", "offer-row");
        row.innerHTML = `
          <span class="tag ${clashesWithRest ? "bad" : "ok"}">${clashesWithRest ? "clashes" : "fits"}</span>
          <div class="offer-main">
            <div class="offer-title">${escapeHtml(sec ? sec.name : "")}${o.group ? " · " + escapeHtml(o.group) : ""} · ${escapeHtml(App.offeringTeachers(o).join(", ") || "Staff TBA")}</div>
            <div class="offer-sub">${o.lessons.map((l) => `<span>${l.day} ${l.start_time}–${l.end_time} · ${escapeHtml(App.roomLabel(l.room))}</span>`).join("")}</div>
          </div>
          <button class="btn sm ${clashesWithRest ? "" : "primary"}" ${clashesWithRest ? "disabled" : ""} data-use>Use</button>`;
        if (!clashesWithRest) row.querySelector("[data-use]").addEventListener("click", () => { App.togglePlanOffering(o); location.hash = "#/planner"; });
        panel.appendChild(row);
      }
      if (!alternatives.length) panel.appendChild((() => { const e = el("div", "empty"); e.innerHTML = "<p>No other offerings of this course exist.</p>"; return e; })());
      resultsWrap.appendChild(panel);
    }
    select.addEventListener("change", draw);
    draw();
  }
  App.renderSwapFinder = renderSwapFinder;

})(window.App);
