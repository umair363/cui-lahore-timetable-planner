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
    const swapHint = el("span", "help-text"); swapHint.textContent = "";
    toolbar.appendChild(swapHint);
    container.appendChild(toolbar);

    const statsWrap = el("div"); container.appendChild(statsWrap);
    const gridWrap = el("div"); container.appendChild(gridWrap);
    const listPanel = el("div", "panel"); listPanel.style.marginTop = "14px";
    container.appendChild(listPanel);

    shareBtn.addEventListener("click", async () => {
      const url = location.origin + location.pathname + "#/planner?sel=" + App.planToParam();
      try { await navigator.clipboard.writeText(url); shareBtn.textContent = "Link copied ✓"; setTimeout(() => (shareBtn.textContent = "Copy shareable link"), 1600); }
      catch (e) { prompt("Copy this link:", url); }
    });
    clearBtn.addEventListener("click", () => { if (confirm("Remove all offerings from your plan?")) App.clearPlan(); });

    function draw() {
      const offerings = App.getPlanOfferings();
      const clashIds = App.findClashes(offerings);

      // stats
      const allLessons = offerings.flatMap((o) => o.lessons);
      const days = new Set(allLessons.map((l) => l.day));
      const earliest = allLessons.length ? Math.min(...allLessons.map((l) => App.timeToMin(l.start_time))) : null;
      const latest = allLessons.length ? Math.max(...allLessons.map((l) => App.timeToMin(l.end_time))) : null;
      const clashCount = clashIds.size ? clashIds.size / 2 : 0;

      statsWrap.innerHTML = "";
      const panel = el("div", "panel");
      const stats = el("div", "stats");
      stats.innerHTML = `
        <div class="stat"><div class="v">${offerings.length}</div><div class="l">Offerings</div></div>
        <div class="stat"><div class="v">${days.size}</div><div class="l">Campus days</div></div>
        <div class="stat"><div class="v">${earliest != null ? fmtT(earliest) : "—"}</div><div class="l">Earliest start</div></div>
        <div class="stat"><div class="v">${latest != null ? fmtT(latest) : "—"}</div><div class="l">Latest finish</div></div>
        <div class="stat ${clashCount ? "bad" : ""}"><div class="v">${clashCount}</div><div class="l">Clashing pair${clashCount === 1 ? "" : "s"}</div></div>`;
      panel.appendChild(stats);
      statsWrap.appendChild(panel);

      const items = offerings.flatMap((o) => o.lessons.map((l) => ({
        lesson: l, color: App.courseColor(l.course), title: App.courseTitle(l.course),
        meta: App.teacherLabel(l.teacher) + " · " + App.roomLabel(l.room) + (o.group ? " · " + o.group : ""),
        clash: clashIds.has(l.id),
      })));
      renderWeekGrid(gridWrap, items, { emptyText: "Your plan is empty. Browse courses and add offerings — they'll show up here." });

      listPanel.innerHTML = "";
      listPanel.appendChild((() => { const h = el("div", "panel-head"); h.innerHTML = `<h3>Selected offerings</h3>`; return h; })());
      if (!offerings.length) {
        listPanel.appendChild((() => { const e = el("div", "empty"); e.innerHTML = `<div class="big">🧺</div><h4>Nothing added yet</h4><p>Go to <a href="#/courses">Courses</a> and add a section's offering.</p>`; return e; })());
      }
      for (const o of offerings) {
        const sec = idx.sectionById.get(o.section);
        const hasClash = o.lessons.some((l) => clashIds.has(l.id));
        const row = el("div", "offer-row");
        row.innerHTML = `
          <span class="tag" style="background:${tint(App.courseColor(o.course))}; border-color:transparent; color:${App.courseColor(o.course)};">●</span>
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
    }

    App.onPlanChange(draw);
    draw();
  }
  App.renderPlanner = renderPlanner;

  function fmtT(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // ---------------------------------------------------------------- AUTO-BUILD

  function renderAutoBuild(container) {
    const idx = App.getIndex();
    container.innerHTML = App._head("Auto-build", "Find a clash-free combination", "Pick the courses you need. We'll enumerate every combination of sections/teachers that doesn't clash, ranked by fewest campus days and least idle time.");

    const state = { courses: new Set(App.getPlanCourseCodes()), noSat: false, maxDays: 6, results: [] };

    const pick = el("div", "panel");
    pick.appendChild((() => { const h = el("div", "panel-head"); h.innerHTML = "<h3>Courses to include</h3>"; return h; })());
    const pickBody = el("div", "panel-body");
    const input = document.createElement("input");
    input.placeholder = "Type a course title or code and press Enter…";
    input.className = "mono";
    input.style.cssText = "width:100%; padding:8px 10px; border-radius:8px; border:1px solid var(--border); background:var(--surface-2); margin-bottom:10px;";
    pickBody.appendChild(input);
    const chosenWrap = el("div", "section-list");
    pickBody.appendChild(chosenWrap);
    pick.appendChild(pickBody);
    container.appendChild(pick);

    function redrawChosen() {
      chosenWrap.innerHTML = "";
      for (const code of state.courses) {
        const chip = el("span", "tag accent");
        chip.style.cursor = "pointer";
        chip.innerHTML = `${escapeHtml(App.courseTitle(code))} <span class="mono" style="opacity:.7">${escapeHtml(code)}</span> ✕`;
        chip.addEventListener("click", () => { state.courses.delete(code); redrawChosen(); });
        chosenWrap.appendChild(chip);
      }
    }
    redrawChosen();

    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const q = input.value.trim();
      if (!q) return;
      const hits = App.search(q, 5).filter((d) => d.kind === "course");
      if (hits.length) { state.courses.add(hits[0].key); input.value = ""; redrawChosen(); }
    });

    const opts = el("div", "filterbar");
    const satBtn = el("button", "chip-toggle"); satBtn.textContent = "No Saturday";
    satBtn.addEventListener("click", () => { state.noSat = !state.noSat; satBtn.classList.toggle("on", state.noSat); });
    opts.appendChild(satBtn);
    const runBtn = el("button", "btn primary"); runBtn.textContent = "Generate combinations";
    const spacer = el("div", "filter-spacer"); opts.appendChild(spacer); opts.appendChild(runBtn);
    container.appendChild(opts);

    const resultsWrap = el("div"); container.appendChild(resultsWrap);

    runBtn.addEventListener("click", () => {
      if (!state.courses.size) { resultsWrap.innerHTML = App.emptyBlock("Pick at least one course", "Add a course above first."); return; }
      const combos = buildCombinations([...state.courses], { noSat: state.noSat });
      renderCombos(resultsWrap, combos);
    });

    if (state.courses.size) runBtn.click();
  }
  App.renderAutoBuild = renderAutoBuild;

  /** For each course, gather ALL offerings across every section (any-section mode —
   *  a student choosing electives usually doesn't care which section they join).
   *  Backtrack across courses, pruning on clash; cap the search so a course with many
   *  offerings can't blow up combinatorially. */
  function buildCombinations(courseCodes, { noSat = false } = {}) {
    const perCourse = courseCodes.map((code) => {
      let offs = App.allOfferingsForCourse(code);
      if (noSat) offs = offs.filter((o) => !o.lessons.some((l) => l.day === "Sa"));
      return offs;
    });
    if (perCourse.some((offs) => !offs.length)) return { impossible: courseCodes.filter((_, i) => !perCourse[i].length) };

    const MAX_RESULTS = 60;
    const results = [];
    function backtrack(i, chosen) {
      if (results.length >= MAX_RESULTS) return;
      if (i === perCourse.length) { results.push(chosen.slice()); return; }
      for (const off of perCourse[i]) {
        if (results.length >= MAX_RESULTS) return;
        if (chosen.some((c) => hasOverlap(c, off))) continue;
        chosen.push(off);
        backtrack(i + 1, chosen);
        chosen.pop();
      }
    }
    backtrack(0, []);

    for (const combo of results) {
      const lessons = combo.flatMap((o) => o.lessons);
      const days = new Set(lessons.map((l) => l.day));
      const earliest = Math.min(...lessons.map((l) => App.timeToMin(l.start_time)));
      const latest = Math.max(...lessons.map((l) => App.timeToMin(l.end_time)));
      const gap = computeGapMinutes(lessons);
      combo._score = { days: days.size, earliest, latest, gap };
    }
    results.sort((a, b) => a._score.days - b._score.days || a._score.gap - b._score.gap || a._score.earliest - b._score.earliest);
    return { combos: results.slice(0, 20), total: results.length };
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
    if (!result.combos.length) { container.innerHTML = App.emptyBlock("No clash-free combination exists", "Every combination of the chosen courses overlaps. Try dropping one course or removing 'No Saturday'."); return; }
    const note = el("p", "help-text");
    note.style.margin = "0 0 10px";
    note.textContent = `${result.total} clash-free combination${result.total === 1 ? "" : "s"} found — showing the best ${result.combos.length}, ranked by fewest campus days then least idle time.`;
    container.appendChild(note);

    result.combos.forEach((combo, i) => {
      const panel = el("div", "panel");
      const head = el("div", "panel-head");
      head.innerHTML = `<h3>Option ${i + 1}</h3><span class="help-text">${combo._score.days} day${combo._score.days === 1 ? "" : "s"} · ${fmtT(combo._score.earliest)}–${fmtT(combo._score.latest)} · ${Math.round(combo._score.gap / 60 * 10) / 10}h idle</span>`;
      panel.appendChild(head);
      const body = el("div", "panel-body");
      body.style.display = "flex"; body.style.flexDirection = "column"; body.style.gap = "6px";
      for (const o of combo) {
        const idx = App.getIndex();
        const sec = idx.sectionById.get(o.section);
        const line = el("div");
        line.style.fontSize = "12.5px";
        line.innerHTML = `<strong>${escapeHtml(App.courseTitle(o.course))}</strong> — ${escapeHtml(sec ? sec.name : "")}${o.group ? " " + escapeHtml(o.group) : ""} · ${escapeHtml(App.offeringTeachers(o).join(", ") || "Staff TBA")}`;
        body.appendChild(line);
      }
      const useBtn = el("button", "btn primary sm");
      useBtn.textContent = "Use this combination";
      useBtn.style.marginTop = "8px";
      useBtn.addEventListener("click", () => {
        App.clearPlan();
        for (const o of combo) App.togglePlanOffering(o);
        location.hash = "#/planner";
      });
      body.appendChild(useBtn);
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
            <div class="offer-title">${escapeHtml(sec ? sec.name : "")}${o.group ? " · " + escapeHtml(o.group) : ""} — ${escapeHtml(App.offeringTeachers(o).join(", ") || "Staff TBA")}</div>
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
