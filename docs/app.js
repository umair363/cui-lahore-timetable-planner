/* ============================================================================
   app.js — search overlay, hash router, theme toggle, boot.
   ============================================================================ */
window.App = window.App || {};

(function (App) {
  App._head = function (eyebrow, title, desc) {
    return `<div class="page-head">
      ${eyebrow ? `<div class="page-eyebrow">${App.escapeHtml(eyebrow)}</div>` : ""}
      <h1 class="page-title">${App.escapeHtml(title)}</h1>
      ${desc ? `<p class="page-desc">${desc}</p>` : ""}
    </div>`;
  };

  // ---------------------------------------------------------------- search overlay

  function initSearch() {
    const input = document.getElementById("search-input");
    const results = document.getElementById("search-results");
    let activeIndex = -1;
    let currentDocs = [];

    function iconFor(kind) {
      return { course: "📘", teacher: "🧑‍🏫", section: "🎓", room: "📍" }[kind] || "•";
    }
    function hrefFor(doc) {
      if (doc.kind === "course") return `#/course/${encodeURIComponent(doc.key)}`;
      if (doc.kind === "teacher") return `#/teacher/${doc.key}`;
      if (doc.kind === "section") return `#/section/${doc.key}`;
      if (doc.kind === "room") return `#/room/${doc.key}`;
      return "#/";
    }

    function render(query) {
      const docs = App.search(query, 30);
      currentDocs = docs;
      activeIndex = -1;
      if (!query.trim()) { results.classList.add("hidden"); return; }
      if (!docs.length) {
        results.innerHTML = `<div class="search-empty">No matches for "${App.escapeHtml(query)}"</div>`;
        results.classList.remove("hidden");
        return;
      }
      const groups = App.groupBy(docs, (d) => d.kind);
      const order = ["course", "teacher", "section", "room"];
      const labels = { course: "Courses", teacher: "Faculty", section: "Sections", room: "Rooms" };
      let html = "";
      let i = 0;
      for (const kind of order) {
        const items = groups.get(kind);
        if (!items) continue;
        html += `<div class="search-group-label">${labels[kind]}</div>`;
        for (const doc of items) {
          html += `<a class="search-row" data-i="${i}" href="${hrefFor(doc)}">
            <span>${iconFor(doc.kind)}</span>
            <span class="search-row-title"><span class="t">${App.escapeHtml(doc.title)}</span></span>
            <span class="search-row-meta">${App.escapeHtml(doc.sub || "")}</span>
          </a>`;
          i++;
        }
      }
      results.innerHTML = html;
      results.classList.remove("hidden");
    }

    input.addEventListener("input", () => render(input.value));
    input.addEventListener("focus", () => { if (input.value.trim()) render(input.value); });
    input.addEventListener("keydown", (e) => {
      const rows = [...results.querySelectorAll(".search-row")];
      if (e.key === "ArrowDown") { e.preventDefault(); activeIndex = Math.min(rows.length - 1, activeIndex + 1); highlight(rows); }
      else if (e.key === "ArrowUp") { e.preventDefault(); activeIndex = Math.max(0, activeIndex - 1); highlight(rows); }
      else if (e.key === "Enter") {
        if (activeIndex >= 0 && rows[activeIndex]) { rows[activeIndex].click(); }
        else if (rows[0]) rows[0].click();
      } else if (e.key === "Escape") { input.blur(); results.classList.add("hidden"); }
    });
    function highlight(rows) {
      rows.forEach((r, i) => r.classList.toggle("hl", i === activeIndex));
      if (rows[activeIndex]) rows[activeIndex].scrollIntoView({ block: "nearest" });
    }
    results.addEventListener("mousedown", (e) => {
      const row = e.target.closest(".search-row");
      if (row) { setTimeout(() => { input.value = ""; results.classList.add("hidden"); }, 0); }
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".searchbox")) results.classList.add("hidden");
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== input && !isTyping(e.target)) {
        e.preventDefault(); input.focus();
      }
    });
    function isTyping(t) { return t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA"; }
  }

  // ---------------------------------------------------------------- theme

  function initTheme() {
    const btn = document.getElementById("theme-toggle");
    const stored = localStorage.getItem("cui-tt-theme");
    if (stored) document.documentElement.setAttribute("data-theme", stored);
    updateIcon();
    btn.addEventListener("click", () => {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark" ||
        (!document.documentElement.hasAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
      const next = isDark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("cui-tt-theme", next);
      updateIcon();
    });
    function updateIcon() {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark" ||
        (!document.documentElement.hasAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
      btn.innerHTML = isDark
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    }
  }

  // ---------------------------------------------------------------- router

  const routes = [
    { re: /^\/?$/, render: (c) => App.renderHome(c) },
    { re: /^\/courses$/, render: (c) => App.renderCourseList(c) },
    { re: /^\/course\/([^/]+)$/, render: (c, m) => App.renderCourseDetail(c, decodeURIComponent(m[1])) },
    { re: /^\/teachers$/, render: (c) => App.renderTeacherList(c) },
    { re: /^\/teacher\/(\d+)$/, render: (c, m) => App.renderTeacherDetail(c, m[1]) },
    { re: /^\/sections$/, render: (c) => App.renderSectionList(c) },
    { re: /^\/section\/(\d+)$/, render: (c, m) => App.renderSectionDetail(c, m[1]) },
    { re: /^\/rooms$/, render: (c) => App.renderRoomList(c) },
    { re: /^\/room\/(\d+)$/, render: (c, m) => App.renderRoomDetail(c, m[1]) },
    { re: /^\/planner$/, render: (c) => App.renderPlanner(c) },
    { re: /^\/autobuild$/, render: (c) => App.renderAutoBuild(c) },
    { re: /^\/swap$/, render: (c, m, params) => App.renderSwapFinder(c, params) },
  ];

  function parseHash() {
    const raw = location.hash.slice(1) || "/";
    const [path, query] = raw.split("?");
    const params = {};
    if (query) for (const kv of query.split("&")) { const [k, v] = kv.split("="); params[k] = decodeURIComponent(v || ""); }
    return { path, params };
  }

  function setActiveNav(path) {
    document.querySelectorAll(".nav a").forEach((a) => {
      const section = a.dataset.section;
      a.classList.toggle("active", section && path.startsWith("/" + section));
    });
  }

  function route() {
    const { path, params } = parseHash();
    if (params.sel) { App.loadPlanFromParam(params.sel); }
    const main = document.getElementById("view");
    setActiveNav(path);
    for (const r of routes) {
      const m = path.match(r.re);
      if (m) {
        try { r.render(main, m, params); }
        catch (err) {
          console.error(err);
          main.innerHTML = App.emptyBlock("Something went wrong rendering this page", String(err && err.message || err));
        }
        window.scrollTo({ top: 0 });
        return;
      }
    }
    main.innerHTML = App.emptyBlock("Page not found", "That link doesn't match a known view.");
  }

  window.addEventListener("hashchange", route);

  // ---------------------------------------------------------------- boot

  async function boot() {
    initTheme();
    initSearch();
    const main = document.getElementById("view");
    main.innerHTML = `<div class="panel"><div class="panel-body"><div class="skeleton" style="height:18px;width:40%;margin-bottom:10px;"></div><div class="skeleton" style="height:220px;"></div></div></div>`;
    try {
      await App.load();
    } catch (e) {
      main.innerHTML = App.emptyBlock("Couldn't load the timetable", "The data file failed to load. If you're running this locally, serve the folder over http:// (e.g. `python -m http.server`) rather than opening index.html directly.");
      console.error(e);
      return;
    }
    const badge = document.getElementById("nav-plan-count");
    function updateBadge() { badge.textContent = App.planSize() || ""; badge.classList.toggle("hidden", !App.planSize()); }
    App.onPlanChange(updateBadge);
    updateBadge();

    const d = App.getData();
    const meta = document.getElementById("footer-meta");
    if (meta) {
      const dt = new Date(d.meta.scraped_at);
      meta.textContent = `${d.meta.term} · ${d.meta.version} · data checked ${dt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
    }
    route();
  }

  // Registered after boot, not before: the first load should never wait on
  // this, and there's nothing useful to precache until the shell has painted.
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    // file:// (opening index.html directly) has no serviceWorker origin to
    // register against - only http(s):// (localhost or the deployed site).
    if (location.protocol !== "http:" && location.protocol !== "https:") return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Service worker registration failed:", err));
    });
  }
  registerServiceWorker();

  document.addEventListener("DOMContentLoaded", boot);

})(window.App);
