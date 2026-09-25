/* ============================================================================
   app-swap.js — the swap matching engine.

   A noticeboard of "want X have Y" posts is low signal: you still have to read
   every post and work out whether it helps you. This app knows the whole
   timetable, so it can do the work instead.

   Two things it finds that a person reading a board cannot:

   1. Direct matches — someone has the slot you want AND wants the slot you
      have. A two-person swap.
   2. Chains — you want B's slot, B wants C's slot, C wants yours. Everybody
      moves one step round the circle and all three get what they asked for.
      Nobody in that loop could see it by looking at the board themselves; it
      only exists when you can see every request at once.

   Swaps are always within a single course: trading your CSC211 section for
   someone's MTH262 section is not a thing. That keeps the search per-course
   and small.

   Everything here is pure - requests in, matches out - so it runs client-side
   with no backend and can be tested without one.
   ============================================================================ */
window.App = window.App || {};

(function (App) {
  /**
   * A request is:
   *   { id, handle, course, have, want: [offeringId], plan: [offeringId] }
   * `plan` is that person's other offerings, used to check a swap wouldn't
   * break the rest of their week.
   */

  const MAX_CHAIN = 4;   // beyond four people, coordinating it never happens

  /** Would `incoming` fit this person's week once `outgoing` is given up? */
  function fits(request, incomingId) {
    const incoming = App.offeringById(incomingId);
    if (!incoming) return false;
    const others = (request.plan || [])
      .filter((id) => id !== request.have && id !== incomingId)
      .map((id) => App.offeringById(id))
      .filter(Boolean);
    for (const other of others) {
      for (const a of incoming.lessons) {
        for (const b of other.lessons) {
          if (App.overlaps(a, b)) return false;
        }
      }
    }
    return true;
  }
  App.swapFits = fits;

  /**
   * Cycles in the "wants" graph. An edge A -> B means B holds the slot A asked
   * for, so a cycle is a rotation where everyone moves into the next person's
   * place.
   *
   * Only cycles whose lowest-indexed member is the start are kept, which is
   * what stops the same loop being reported once per rotation.
   */
  function cyclesWithin(requests, maxChain) {
    const byHave = new Map();
    requests.forEach((r, i) => {
      if (!byHave.has(r.have)) byHave.set(r.have, []);
      byHave.get(r.have).push(i);
    });

    const edges = requests.map((r) => {
      const out = new Set();
      for (const wanted of r.want || []) {
        for (const j of byHave.get(wanted) || []) out.add(j);
      }
      return [...out];
    });

    const found = [];
    const path = [];
    const onPath = new Set();

    function walk(start, node) {
      path.push(node);
      onPath.add(node);
      for (const next of edges[node]) {
        if (next === start && path.length >= 2) {
          found.push(path.slice());
        } else if (next > start && !onPath.has(next) && path.length < maxChain) {
          walk(start, next);
        }
      }
      path.pop();
      onPath.delete(node);
    }

    for (let i = 0; i < requests.length; i++) walk(i, i);
    return found;
  }

  /**
   * All workable swaps involving `me` (or every swap on the board, if `me` is
   * null). A cycle is only offered when it works for *everyone* in it - a swap
   * that fixes your week by breaking someone else's is not a swap they will
   * agree to, so it is not worth showing.
   */
  function findMatches(requests, { me = null, maxChain = MAX_CHAIN } = {}) {
    const byCourse = new Map();
    for (const r of requests) {
      if (!r || !r.course || !r.have || !(r.want || []).length) continue;
      if (!byCourse.has(r.course)) byCourse.set(r.course, []);
      byCourse.get(r.course).push(r);
    }

    const matches = [];
    for (const [course, group] of byCourse) {
      for (const cycle of cyclesWithin(group, maxChain)) {
        const participants = cycle.map((idx, k) => {
          const person = group[idx];
          const next = group[cycle[(k + 1) % cycle.length]];
          return { request: person, gives: person.have, gets: next.have };
        });
        if (!participants.every((p) => fits(p.request, p.gets))) continue;
        if (me && !participants.some((p) => p.request.id === me)) continue;
        matches.push({
          course,
          kind: participants.length === 2 ? "direct" : "chain",
          size: participants.length,
          participants,
        });
      }
    }

    // Fewest people first: a two-way swap actually happens, a four-way rarely
    // survives contact with four humans.
    matches.sort((a, b) => a.size - b.size || a.course.localeCompare(b.course));
    return matches;
  }
  App.findSwapMatches = findMatches;

  /**
   * Sections of a course this person could move to without breaking the rest
   * of their week — the candidate targets to offer when posting a request,
   * so an impossible ask can't be posted in the first place.
   */
  function feasibleTargets(course, haveId, plan) {
    const mine = { have: haveId, plan: plan || [] };
    return App.allOfferingsForCourse(course)
      .filter((o) => o.id !== haveId && fits(mine, o.id))
      .sort((a, b) => App.naturalCompare(App.offeringLabel(a), App.offeringLabel(b)));
  }
  App.feasibleSwapTargets = feasibleTargets;

})(window.App);
