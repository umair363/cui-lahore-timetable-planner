/* ============================================================================
   app-grid.js — the week timetable grid: days listed down the left as rows,
   time running across the top as columns. Matches the layout of the official
   CUI timetable (and of a printed timetable generally), rather than a
   Google-Calendar-style vertical week view.
   ============================================================================ */
window.App = window.App || {};

(function (App) {
  const DAY_START_MIN = 8 * 60 + 30;
  const DAY_END_MIN = 20 * 60 + 30;
  const PX_PER_MIN = 2;      // 120px per hour of width
  const ROW_HEIGHT = 64;      // px per day row (before lane-splitting for overlaps)
  const LABEL_COL = 74;       // px, the sticky day-label column
  const HEADER_ROW = 28;      // px, the sticky hour-ruler row

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
      const wrap = el("div", "weekgrid-wrap");
      wrap.innerHTML = `<div class="empty"><div class="big">🗓️</div><h4>Nothing to show</h4><p>${opts.emptyText || "No lessons match the current filters."}</p></div>`;
      container.appendChild(wrap);
      return;
    }

    const totalMin = DAY_END_MIN - DAY_START_MIN;
    const trackWidth = totalMin * PX_PER_MIN;

    const wrap = el("div", "weekgrid-wrap");
    const grid = el("div", "weekgrid-h" + (opts.compact ? " compact" : ""));
    grid.style.gridTemplateColumns = `${LABEL_COL}px ${trackWidth}px`;

    // corner + hour ruler
    grid.appendChild(el("div", "wg-corner-h"));
    const ruler = el("div", "wg-hours-track");
    ruler.style.height = HEADER_ROW + "px";
    ruler.style.backgroundImage = hourGridCss();
    for (let m = DAY_START_MIN; m < DAY_END_MIN; m += 30) {
      const onHour = m % 60 === 0;
      const mark = el("div", "wg-hourmark" + (onHour ? "" : " half"));
      mark.style.left = (m - DAY_START_MIN) * PX_PER_MIN + "px";
      mark.style.width = 30 * PX_PER_MIN + "px";
      mark.textContent = onHour ? fmtHour(m) : ":30";
      ruler.appendChild(mark);
    }
    grid.appendChild(ruler);

    const byDay = new Map(days.map((d) => [d, []]));
    for (const it of items) {
      const d = it.lesson.day;
      if (byDay.has(d)) byDay.get(d).push(it);
    }

    for (const d of days) {
      const dayItems = byDay.get(d) || [];
      const lanes = packLanes(dayItems);
      const laneCount = lanes.length ? Math.max(...lanes.map((l) => l.laneCount)) : 1;
      const rowHeight = ROW_HEIGHT * Math.max(1, laneCount * (opts.compact ? 0.72 : 1));

      const label = el("div", "wg-daylabel-h");
      label.style.height = rowHeight + "px";
      label.innerHTML = `${d}<span class="n">${App.DAY_LABEL[d] || ""}</span>`;
      grid.appendChild(label);

      const track = el("div", "wg-dayrow-track");
      track.style.height = rowHeight + "px";
      track.style.backgroundImage = hourGridCss();
      for (const { item, lane, laneCount: lc } of lanes) {
        const l = item.lesson;
        const startMin = App.timeToMin(l.start_time);
        const endMin = App.timeToMin(l.end_time);
        const left = Math.max(0, (startMin - DAY_START_MIN) * PX_PER_MIN);
        const width = Math.max(18, (endMin - startMin) * PX_PER_MIN);
        const blk = el("div", "wg-block-h" + (item.clash ? " clash" : ""));
        blk.style.left = left + "px";
        blk.style.width = width - 3 + "px";
        const laneHeightPct = 100 / lc;
        blk.style.top = `calc(${laneHeightPct * lane}% + 2px)`;
        blk.style.height = `calc(${laneHeightPct}% - 4px)`;
        if (!item.clash) blk.setAttribute("style", blk.getAttribute("style") + blockStyle(item.color));
        blk.innerHTML = `<div class="t">${escapeHtml(item.title)}</div><div class="m">${escapeHtml(item.meta || "")}</div>`;
        blk.title = `${item.title}\n${item.meta || ""}\n${l.start_time}–${l.end_time}`;
        if (opts.onClick) { blk.style.cursor = "pointer"; blk.addEventListener("click", () => opts.onClick(l, item)); }
        track.appendChild(blk);
      }
      grid.appendChild(track);
    }

    wrap.appendChild(grid);
    container.appendChild(wrap);
  }
  App.renderWeekGrid = renderWeekGrid;

  /** Two layers of vertical gridline: a firm one on the hour, a faint one on
   *  the half hour. Every lesson here starts and ends on a 30-minute period
   *  boundary, so the half-hour line is what you actually read a block against.
   *  Listed hour-first because earlier gradients paint on top. */
  function hourGridCss() {
    const hourPx = 60 * PX_PER_MIN;
    const halfPx = 30 * PX_PER_MIN;
    return [
      `repeating-linear-gradient(to right, transparent, transparent ${hourPx - 1}px, var(--rule-strong) ${hourPx - 1}px, var(--rule-strong) ${hourPx}px)`,
      `repeating-linear-gradient(to right, transparent, transparent ${halfPx - 1}px, var(--rule) ${halfPx - 1}px, var(--rule) ${halfPx}px)`,
    ].join(", ");
  }

  /** Greedy lane packing so overlapping same-day items stack instead of overwriting each other. */
  function packLanes(items) {
    const sorted = items.slice().sort((a, b) => a.lesson.start - b.lesson.start);
    const laneEnds = [];
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
