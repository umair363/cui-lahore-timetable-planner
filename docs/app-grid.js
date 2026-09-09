/* ============================================================================
   app-grid.js — the vertical week calendar. One reusable renderer used by the
   teacher, section, and planner views: given a list of {lesson, labelFn,
   colorFn, clashIds} it lays out absolutely-positioned blocks against an
   hour-ruled grid, Mo–Sa, 08:30–20:30.
   ============================================================================ */
window.App = window.App || {};

(function (App) {
  const DAY_START_MIN = 8 * 60 + 30;
  const DAY_END_MIN = 20 * 60 + 30;
  const PX_PER_MIN = 1; // matches --px-per-min in styles.css

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    if (!m) return [100, 116, 139];
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  }

  function blockStyle(color) {
    const [r, g, b] = hexToRgb(color);
    const isDark = document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.hasAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const bg = isDark ? `rgba(${r},${g},${b},0.22)` : `rgba(${r},${g},${b},0.13)`;
    const border = isDark ? `rgba(${r},${g},${b},0.55)` : `rgba(${r},${g},${b},0.45)`;
    return `--blk-bg:${bg}; --blk-border:${border};`;
  }

  /**
   * items: [{ lesson, title, meta, color, clash }]
   * opts: { days?: string[], compact?: boolean, onClick?: (lesson)=>void }
   */
  function renderWeekGrid(container, items, opts = {}) {
    const days = opts.days || App.DAYS;
    container.innerHTML = "";

    if (!items.length) {
      const wrap = document.createElement("div");
      wrap.className = "weekgrid-wrap";
      wrap.innerHTML = `<div class="empty"><div class="big">🗓️</div><h4>Nothing to show</h4><p>${opts.emptyText || "No lessons match the current filters."}</p></div>`;
      container.appendChild(wrap);
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "weekgrid-wrap";
    const grid = document.createElement("div");
    grid.className = "weekgrid" + (opts.compact ? " compact" : "");
    grid.style.setProperty("--days", days.length);
    grid.style.setProperty("--px-per-min", PX_PER_MIN);

    grid.appendChild(el("div", "wg-corner"));
    for (const d of days) {
      const lab = el("div", "wg-daylabel");
      lab.innerHTML = `${d}<span class="n">${App.DAY_LABEL[d] || ""}</span>`;
      grid.appendChild(lab);
    }

    const totalMin = DAY_END_MIN - DAY_START_MIN;
    const timeCol = el("div", "wg-timecol");
    timeCol.style.position = "relative";
    timeCol.style.height = totalMin * PX_PER_MIN + "px";
    for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += 60) {
      const h = el("div", "wg-hour");
      h.style.height = "0";
      h.style.position = "absolute";
      h.style.top = (m - DAY_START_MIN) * PX_PER_MIN + "px";
      h.style.right = "6px";
      h.style.fontSize = "10.5px";
      h.style.color = "var(--text-faint)";
      h.textContent = fmtHour(m);
      timeCol.appendChild(h);
    }
    grid.appendChild(timeCol);

    const byDay = new Map(days.map((d) => [d, []]));
    for (const it of items) {
      const d = it.lesson.day;
      if (byDay.has(d)) byDay.get(d).push(it);
    }

    for (const d of days) {
      const col = el("div", "wg-daycol");
      col.style.position = "relative";
      col.style.height = totalMin * PX_PER_MIN + "px";
      const dayItems = byDay.get(d) || [];
      const lanes = packLanes(dayItems);
      for (const { item, lane, laneCount } of lanes) {
        const l = item.lesson;
        const startMin = App.timeToMin(l.start_time);
        const endMin = App.timeToMin(l.end_time);
        const top = Math.max(0, (startMin - DAY_START_MIN) * PX_PER_MIN);
        const height = Math.max(20, (endMin - startMin) * PX_PER_MIN);
        const blk = el("div", "wg-block" + (item.clash ? " clash" : ""));
        blk.style.top = top + "px";
        blk.style.height = height + "px";
        const widthPct = 100 / laneCount;
        blk.style.left = `calc(${widthPct * lane}% + 3px)`;
        blk.style.width = `calc(${widthPct}% - 6px)`;
        if (!item.clash) blk.setAttribute("style", blk.getAttribute("style") + blockStyle(item.color));
        blk.innerHTML = `<div class="t">${escapeHtml(item.title)}</div><div class="m">${escapeHtml(item.meta || "")}</div>`;
        blk.title = `${item.title}\n${item.meta || ""}\n${l.start_time}–${l.end_time}`;
        if (opts.onClick) { blk.style.cursor = "pointer"; blk.addEventListener("click", () => opts.onClick(l, item)); }
        col.appendChild(blk);
      }
      grid.appendChild(col);
    }

    wrap.appendChild(grid);
    container.appendChild(wrap);
  }
  App.renderWeekGrid = renderWeekGrid;

  /** Greedy lane packing so overlapping same-day items sit side by side instead of stacking. */
  function packLanes(items) {
    const sorted = items.slice().sort((a, b) => a.lesson.start - b.lesson.start);
    const laneEnds = []; // end period of the last item placed in each lane
    const placed = [];
    for (const item of sorted) {
      let lane = laneEnds.findIndex((end) => end <= item.lesson.start);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = item.lesson.end + 0.001;
      placed.push({ item, lane });
    }
    const laneCount = Math.max(1, laneEnds.length);
    return placed.map((p) => ({ ...p, laneCount }));
  }

  function fmtHour(min) {
    let h = Math.floor(min / 60);
    const ampm = h >= 12 ? "pm" : "am";
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}${ampm}`;
  }

  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
  App.el = el;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  App.escapeHtml = escapeHtml;

})(window.App);
