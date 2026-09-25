/* ============================================================================
   app-swap-views.js — the swap board.

   Everything a person types (handle, note) is user content and goes through
   escapeHtml on the way to the DOM. The CSP would stop an injected script from
   running, but "defence in depth" only counts if both layers are actually
   there.
   ============================================================================ */
window.App = window.App || {};

(function (App) {
  const { el, escapeHtml } = App;

  function head(eyebrow, title, desc) {
    return `<div class="page-head">
      ${eyebrow ? `<div class="page-eyebrow">${escapeHtml(eyebrow)}</div>` : ""}
      <h1 class="page-title">${escapeHtml(title)}</h1>
      ${desc ? `<p class="page-desc">${desc}</p>` : ""}
    </div>`;
  }

  function offeringLabel(id) {
    const o = App.offeringById(id);
    if (!o) return id;
    return App.offeringLabel(o) + " · " + (App.offeringTeachers(o).join(", ") || "Staff TBA");
  }

  function panel(title, sub) {
    const p = el("div", "panel");
    const h = el("div", "panel-head");
    h.innerHTML = `<h3>${escapeHtml(title)}</h3>${sub ? `<span class="help-text">${escapeHtml(sub)}</span>` : ""}`;
    p.appendChild(h);
    return p;
  }

  // ------------------------------------------------------------------ page

  async function renderSwaps(container) {
    container.innerHTML = head("Swaps", "Swap board",
      "Post the section you want out of, and the app finds who can actually give it to you — including three-way swaps nobody could spot alone.");
    const status = el("p", "help-text");
    status.textContent = "Connecting…";
    container.appendChild(status);

    const ready = await App.sbReady();
    if (!ready.ok) {
      status.remove();
      container.insertAdjacentHTML("beforeend", App.emptyBlock(
        "The swap board isn't switched on yet",
        escapeHtml(ready.reason || "Backend unavailable.") +
        " Once the project has anonymous sign-ins enabled and the schema applied, this page works with no login."));
      return;
    }
    status.remove();

    const me = await App.sbUserId();
    let profile = (await App.sbSelect("profiles", { id: `eq.${me}` }))[0];
    if (!profile) {
      container.appendChild(handlePrompt(async (handle) => {
        profile = (await App.sbInsert("profiles", { id: me, handle }))[0];
        renderSwaps(container);
      }));
      return;
    }

    const body = el("div");
    container.appendChild(body);
    await drawBoard(body, me, profile);
  }
  App.renderSwaps = renderSwaps;

  /** One question, once: what should people call you here. */
  function handlePrompt(onSet) {
    const p = panel("Pick a handle", "Shown on the board instead of your name. No email, no password — this device is your identity.");
    const row = el("div", "swap-form-row");
    const input = el("input", "text-input");
    input.placeholder = "e.g. umair_bse";
    input.maxLength = 24;
    const btn = el("button", "btn primary");
    btn.textContent = "Continue";
    const err = el("p", "help-text");
    err.style.color = "var(--bad-55)";
    btn.addEventListener("click", async () => {
      const handle = input.value.trim();
      if (handle.length < 2) { err.textContent = "At least 2 characters."; return; }
      btn.disabled = true; btn.textContent = "Saving…";
      try { await onSet(handle); }
      catch (e) {
        err.textContent = /duplicate|unique/i.test(e.message) ? "That handle is taken." : e.message;
        btn.disabled = false; btn.textContent = "Continue";
      }
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") btn.click(); });
    row.appendChild(input); row.appendChild(btn);
    p.appendChild(row); p.appendChild(err);
    return p;
  }

  // ------------------------------------------------------------------ board

  async function drawBoard(body, me, profile) {
    body.innerHTML = "";
    const [requests, myThreads] = await Promise.all([
      App.sbSelect("swap_requests", { status: "eq.open", order: "created_at.desc" }),
      App.sbSelect("threads", { order: "created_at.desc" }),
    ]);
    const profiles = await loadProfiles(requests.map((r) => r.user_id));
    const mine = requests.filter((r) => r.user_id === me);
    const theirs = requests.filter((r) => r.user_id !== me);

    body.appendChild(postSection(me, mine, () => drawBoard(body, me, profile)));

    // Matches first: this is the whole point of the page.
    const myIds = new Set(mine.map((r) => r.id));
    const matches = App.findSwapMatches(requests).filter((m) =>
      m.participants.some((p) => myIds.has(p.request.id)));
    body.appendChild(matchSection(matches, me, profiles, body, profile));

    body.appendChild(boardSection(theirs, profiles, me, body, profile));
    if (myThreads.length) body.appendChild(threadSection(myThreads, requests, profiles, me, body, profile));
  }

  async function loadProfiles(userIds) {
    const ids = [...new Set(userIds)].filter(Boolean);
    if (!ids.length) return new Map();
    const rows = await App.sbSelect("profiles", { id: `in.(${ids.join(",")})` });
    return new Map(rows.map((p) => [p.id, p]));
  }

  function who(profiles, userId) {
    const p = profiles.get(userId);
    if (!p) return "someone";
    return p.handle + (p.verified ? " ✓" : "");
  }

  // ------------------------------------------------------------------ posting

  function postSection(me, mine, refresh) {
    const p = panel("Your requests", mine.length ? "" : "Post what you want to move out of");
    const plan = App.getPlanOfferings();

    for (const r of mine) {
      const row = el("div", "list-row");
      row.innerHTML = `<div class="offer-main">
          <div class="offer-title">${escapeHtml(App.courseTitle(r.course))} <span class="tag code">${escapeHtml(r.course)}</span></div>
          <div class="offer-sub">Leaving <strong>${escapeHtml(offeringLabel(r.have))}</strong> · open to ${r.want.length} section${r.want.length === 1 ? "" : "s"}</div>
        </div>`;
      const del = el("button", "btn sm");
      del.textContent = "Withdraw";
      del.addEventListener("click", async () => {
        del.disabled = true;
        await App.sbDelete("swap_requests", { id: `eq.${r.id}` });
        refresh();
      });
      row.appendChild(del);
      p.appendChild(row);
    }

    if (!plan.length) {
      p.insertAdjacentHTML("beforeend", App.emptyBlock("No plan yet",
        'Add your courses in the <a href="#/planner">planner</a> first — the board uses it to check a swap actually fits your week.'));
      return p;
    }

    const posted = new Set(mine.map((r) => r.course));
    const options = plan.filter((o) => !posted.has(o.course));
    if (!options.length) return p;

    const form = el("div", "group-block");
    form.innerHTML = `<h3 class="group-heading">Post a swap</h3>`;
    const pick = el("select", "time-select");
    pick.style.maxWidth = "100%";
    for (const o of options) {
      const opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = `${App.courseTitle(o.course)} — ${App.offeringLabel(o)}`;
      pick.appendChild(opt);
    }
    const targets = el("div");
    const note = el("input", "text-input");
    note.placeholder = "Optional note (e.g. 'morning only, can meet Tue')";
    note.maxLength = 280;
    const submit = el("button", "btn primary");
    submit.textContent = "Post request";
    const err = el("p", "help-text");
    err.style.color = "var(--bad-55)";

    const planIds = plan.map((o) => o.id);
    function drawTargets() {
      const have = pick.value;
      const course = App.offeringById(have).course;
      const feasible = App.feasibleSwapTargets(course, have, planIds);
      targets.innerHTML = "";
      const label = el("p", "help-text");
      label.style.margin = "10px 0 6px";
      label.textContent = feasible.length
        ? `Tick every section you'd accept — only the ${feasible.length} that fit the rest of your week are listed.`
        : "No other section of this course fits the rest of your week.";
      targets.appendChild(label);
      const chips = el("div", "chip-row");
      for (const o of feasible) {
        const b = el("button", "chip-toggle");
        b.type = "button";
        b.dataset.id = o.id;
        b.textContent = App.offeringLabel(o);
        b.title = App.offeringTeachers(o).join(", ") || "Staff TBA";
        b.addEventListener("click", () => b.classList.toggle("on"));
        chips.appendChild(b);
      }
      targets.appendChild(chips);
    }
    pick.addEventListener("change", drawTargets);

    submit.addEventListener("click", async () => {
      const want = [...targets.querySelectorAll(".chip-toggle.on")].map((b) => b.dataset.id);
      if (!want.length) { err.textContent = "Pick at least one section you'd move to."; return; }
      err.textContent = "";
      submit.disabled = true; submit.textContent = "Posting…";
      try {
        await App.sbInsert("swap_requests", {
          user_id: me,
          course: App.offeringById(pick.value).course,
          have: pick.value,
          want,
          plan: planIds,
          note: note.value.trim() || null,
        });
        refresh();
      } catch (e) {
        err.textContent = /rate limit/i.test(e.message) ? "Too many posts in the last hour." : e.message;
        submit.disabled = false; submit.textContent = "Post request";
      }
    });

    form.appendChild(pick);
    form.appendChild(targets);
    form.appendChild(note);
    const actions = el("div", "swap-form-row");
    actions.appendChild(submit);
    form.appendChild(actions);
    form.appendChild(err);
    p.appendChild(form);
    drawTargets();
    return p;
  }

  // ------------------------------------------------------------------ matches

  function matchSection(matches, me, profiles, body, profile) {
    const p = panel(
      matches.length ? `Matches · ${matches.length}` : "Matches",
      "Checked against everyone's week — a swap only shows if it works for all of them");
    if (!matches.length) {
      p.insertAdjacentHTML("beforeend", App.emptyBlock("No matches yet",
        "Nobody currently wants what you're offering. Your request stays up — this updates as people post."));
      return p;
    }
    for (const m of matches) {
      const block = el("div", "group-block");
      const chain = m.kind === "chain";
      block.innerHTML = `<h3 class="group-heading">
        ${chain ? `${m.size}-way swap` : "Direct swap"}
        <span class="count">${escapeHtml(m.course)}</span></h3>
        ${chain ? `<p class="help-text" style="margin:0 0 8px;">Everyone moves one step round the circle and all ${m.size} get the section they asked for.</p>` : ""}`;
      for (const part of m.participants) {
        const isMe = part.request.user_id === me;
        const row = el("div", "list-row");
        row.innerHTML = `<div class="offer-main">
            <div class="offer-title">${isMe ? "You" : escapeHtml(who(profiles, part.request.user_id))}</div>
            <div class="offer-sub">gives <strong>${escapeHtml(offeringLabel(part.gives))}</strong> → gets <strong>${escapeHtml(offeringLabel(part.gets))}</strong></div>
          </div>`;
        if (!isMe) row.appendChild(contactButton(part.request, profiles, me, body, profile));
        block.appendChild(row);
      }
      p.appendChild(block);
    }
    return p;
  }

  // ------------------------------------------------------------------ board list

  function boardSection(theirs, profiles, me, body, profile) {
    const p = panel(`Everyone's requests · ${theirs.length}`, "");
    if (!theirs.length) {
      p.insertAdjacentHTML("beforeend", App.emptyBlock("Nothing posted yet", "Be the first — post above."));
      return p;
    }
    for (const [course, rows] of App.groupBy(theirs, (r) => r.course)) {
      const block = el("div", "group-block");
      block.innerHTML = `<h3 class="group-heading">${escapeHtml(App.courseTitle(course))} <span class="count">${rows.length}</span></h3>`;
      for (const r of rows) {
        const row = el("div", "list-row");
        row.innerHTML = `<div class="offer-main">
            <div class="offer-title">${escapeHtml(who(profiles, r.user_id))}</div>
            <div class="offer-sub">has <strong>${escapeHtml(offeringLabel(r.have))}</strong> · wants ${r.want.map((w) => `<span class="tag">${escapeHtml(App.offeringById(w) ? App.offeringLabel(App.offeringById(w)) : w)}</span>`).join(" ")}</div>
            ${r.note ? `<div class="offer-sub">“${escapeHtml(r.note)}”</div>` : ""}
          </div>`;
        const week = el("button", "btn sm");
        week.textContent = "Their week";
        week.addEventListener("click", () => showWeek(r, profiles));
        row.appendChild(week);
        row.appendChild(contactButton(r, profiles, me, body, profile));
        block.appendChild(row);
      }
      p.appendChild(block);
    }
    return p;
  }

  /** Their full week, drawn from the plan attached to the request - so you can
   *  see whether talking to them is even worth it, without them sending you
   *  anything. */
  function showWeek(request, profiles) {
    const wrap = el("div", "modal-wrap");
    const card = el("div", "modal-card");
    const close = el("button", "btn sm");
    close.textContent = "Close";
    close.addEventListener("click", () => wrap.remove());
    const h = el("div", "panel-head");
    h.innerHTML = `<h3>${escapeHtml(who(profiles, request.user_id))}'s week</h3>`;
    h.appendChild(close);
    card.appendChild(h);

    const items = (request.plan || [])
      .map((id) => App.offeringById(id))
      .filter(Boolean)
      .flatMap((o) => o.lessons.map((l) => ({
        lesson: l,
        color: App.courseColor(o.course),
        title: App.courseTitle(o.course),
        meta: App.offeringLabel(o) + " · " + (App.offeringTeachers(o).join(", ") || "Staff TBA"),
      })));
    const grid = el("div");
    App.renderWeekGrid(grid, items, { emptyText: "They haven't shared a full week." });
    card.appendChild(grid);
    wrap.appendChild(card);
    wrap.addEventListener("click", (e) => { if (e.target === wrap) wrap.remove(); });
    document.body.appendChild(wrap);
  }

  function contactButton(request, profiles, me, body, profile) {
    const b = el("button", "btn primary sm");
    b.textContent = "Message";
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        let thread = (await App.sbSelect("threads", {
          request_id: `eq.${request.id}`, initiator_id: `eq.${me}`,
        }))[0];
        if (!thread) {
          thread = (await App.sbInsert("threads", {
            request_id: request.id, owner_id: request.user_id, initiator_id: me,
          }))[0];
        }
        openChat(thread, request, profiles, me);
      } catch (e) {
        alert(/rate limit/i.test(e.message)
          ? "You've started a lot of conversations in the last hour. Try again shortly."
          : e.message);
      }
      b.disabled = false;
    });
    return b;
  }

  // ------------------------------------------------------------------ chat

  function threadSection(threads, requests, profiles, me, body, profile) {
    const byId = new Map(requests.map((r) => [r.id, r]));
    const p = panel(`Conversations · ${threads.length}`, "");
    for (const t of threads) {
      const r = byId.get(t.request_id);
      const otherId = t.owner_id === me ? t.initiator_id : t.owner_id;
      const row = el("div", "list-row");
      row.innerHTML = `<div class="offer-main">
          <div class="offer-title">${escapeHtml(who(profiles, otherId))}</div>
          <div class="offer-sub">${r ? escapeHtml(App.courseTitle(r.course)) : "swap"}</div>
        </div>`;
      const open = el("button", "btn sm");
      open.textContent = "Open";
      open.addEventListener("click", async () => {
        const known = profiles.has(otherId) ? profiles : await loadProfiles([otherId, ...profiles.keys()]);
        openChat(t, r, known, me);
      });
      row.appendChild(open);
      p.appendChild(row);
    }
    return p;
  }

  function openChat(thread, request, profiles, me) {
    const otherId = thread.owner_id === me ? thread.initiator_id : thread.owner_id;
    const wrap = el("div", "modal-wrap");
    const card = el("div", "modal-card chat");

    const h = el("div", "panel-head");
    h.innerHTML = `<h3>${escapeHtml(who(profiles, otherId))}</h3>`;
    const blockBtn = el("button", "btn sm");
    blockBtn.textContent = "Block";
    blockBtn.title = "Stop this person messaging you";
    blockBtn.addEventListener("click", async () => {
      if (!confirm("Block this person? Neither of you will be able to message the other.")) return;
      await App.sbInsert("blocks", { blocker_id: me, blocked_id: otherId });
      wrap.remove();
    });
    const reportBtn = el("button", "btn sm");
    reportBtn.textContent = "Report";
    reportBtn.addEventListener("click", async () => {
      const reason = prompt("What's wrong with this conversation?");
      if (!reason || reason.trim().length < 3) return;
      await App.sbInsert("reports", { reporter_id: me, subject_id: otherId, thread_id: thread.id, reason: reason.trim() });
      alert("Reported. Thanks — that's recorded.");
    });
    const close = el("button", "btn sm");
    close.textContent = "Close";
    close.addEventListener("click", () => { stop(); wrap.remove(); });
    h.appendChild(blockBtn); h.appendChild(reportBtn); h.appendChild(close);
    card.appendChild(h);

    if (request) {
      const ctx = el("p", "help-text");
      ctx.style.margin = "0 0 10px";
      ctx.textContent = `About ${App.courseTitle(request.course)} — they have ${App.offeringById(request.have) ? App.offeringLabel(App.offeringById(request.have)) : request.have}`;
      card.appendChild(ctx);
    }

    const log = el("div", "chat-log");
    card.appendChild(log);

    const row = el("div", "swap-form-row");
    const input = el("input", "text-input");
    input.placeholder = "Message…";
    input.maxLength = 1000;
    const send = el("button", "btn primary");
    send.textContent = "Send";
    async function doSend() {
      const bodyText = input.value.trim();
      if (!bodyText) return;
      input.value = "";
      try {
        await App.sbInsert("messages", { thread_id: thread.id, sender_id: me, body: bodyText });
        await refresh();
      } catch (e) {
        alert(/rate limit/i.test(e.message) ? "Slow down a moment — too many messages." : e.message);
      }
    }
    send.addEventListener("click", doSend);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") doSend(); });
    row.appendChild(input); row.appendChild(send);
    card.appendChild(row);

    let lastCount = -1;
    async function refresh() {
      const msgs = await App.sbSelect("messages", {
        thread_id: `eq.${thread.id}`, order: "created_at.asc",
      });
      if (msgs.length === lastCount) return;
      lastCount = msgs.length;
      log.innerHTML = msgs.map((m) => `
        <div class="chat-msg ${m.sender_id === me ? "mine" : ""}">
          <span class="chat-body">${escapeHtml(m.body)}</span>
          <span class="chat-time">${new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>`).join("");
      log.scrollTop = log.scrollHeight;
    }
    const stop = App.sbPoll(refresh, { interval: 4000 });

    wrap.addEventListener("click", (e) => { if (e.target === wrap) { stop(); wrap.remove(); } });
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    input.focus();
  }

})(window.App);
