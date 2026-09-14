/* ============================================================================
   app-plan.js — the student's selected offerings: persisted to localStorage,
   and mirrored into the URL so a plan is a link you can send someone.
   ============================================================================ */
window.App = window.App || {};

(function (App) {
  const STORAGE_KEY = "cui-tt-plan-v1";
  let selected = new Map(); // offering.id -> {course, section, group}
  const listeners = new Set();

  function notify() { for (const fn of listeners) fn(); }
  App.onPlanChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  function encodeId(id) { return id.replace(/::/g, "~"); }
  function decodeId(s) { return s.replace(/~/g, "::"); }

  function serialize() {
    return [...selected.keys()].map(encodeId).join(",");
  }
  App.planToParam = serialize;

  function loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      // serialize() writes the "~"-encoded form, so it has to be decoded back
      // here. Without this the restored key never matches an offering id and
      // the plan comes back silently empty on every page load.
      for (const enc of raw.split(",").filter(Boolean)) {
        const id = decodeId(enc);
        selected.set(id, parseId(id));
      }
    } catch (e) { /* private mode etc - plan just won't persist */ }
  }

  function loadFromParam(param) {
    if (!param) return false;
    selected = new Map();
    for (const enc of param.split(",").filter(Boolean)) {
      const id = decodeId(enc);
      selected.set(id, parseId(id));
    }
    return true;
  }
  App.loadPlanFromParam = loadFromParam;

  // The middle segment is the section NAME (see offeringsFor in app-data.js):
  // stable across data refreshes, unlike the section's positional numeric id.
  function parseId(id) {
    const [course, section, group] = id.split("::");
    return { course, section, group: group || "" };
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, serialize()); } catch (e) { /* ignore */ }
  }

  function isSelected(offeringId) { return selected.has(offeringId); }
  App.isPlanSelected = isSelected;

  function toggle(offering) {
    if (selected.has(offering.id)) selected.delete(offering.id);
    else {
      // only one group offering per (course, section) at a time
      for (const id of [...selected.keys()]) {
        const p = parseId(id);
        if (p.course === offering.course && p.section === offering.section) selected.delete(id);
      }
      selected.set(offering.id, { course: offering.course, section: offering.section, group: offering.group });
    }
    save(); notify();
  }
  App.togglePlanOffering = toggle;

  function remove(offeringId) { selected.delete(offeringId); save(); notify(); }
  App.removePlanOffering = remove;

  function clear() { selected.clear(); save(); notify(); }
  App.clearPlan = clear;

  function getSelectedOfferings() {
    const idx = App.getIndex();
    if (!idx) return [];
    const out = [];
    for (const id of selected.keys()) {
      const { course, section } = parseId(id);
      const sec = idx.sectionByName.get(section);
      if (!sec) continue;
      const found = App.offeringsFor(course, sec.id).find((o) => o.id === id);
      if (found) out.push(found);
    }
    return out;
  }
  App.getPlanOfferings = getSelectedOfferings;

  /** Plan entries that no longer resolve against the loaded dataset - i.e. the
   *  university dropped that offering. Worth telling the student about after a
   *  refresh rather than quietly showing them a shorter plan. */
  function getMissingPlanEntries() {
    const idx = App.getIndex();
    if (!idx) return [];
    const live = new Set(getSelectedOfferings().map((o) => o.id));
    return [...selected.keys()].filter((id) => !live.has(id)).map(parseId);
  }
  App.getMissingPlanEntries = getMissingPlanEntries;

  /** One-off migration of plans saved before offering ids were keyed by section
   *  name. Runs once data is available, since it needs the id -> name mapping.
   *  Best effort: an old positional id is interpreted against the CURRENT data,
   *  which is the only mapping we still have. */
  function migrateLegacyIds() {
    const idx = App.getIndex();
    if (!idx) return 0;
    let migrated = 0;
    const next = new Map();
    for (const id of selected.keys()) {
      const [course, section, group] = id.split("::");
      if (/^\d+$/.test(section)) {
        const sec = idx.sectionById.get(Number(section));
        if (sec) {
          const nid = group ? `${course}::${sec.name}::${group}` : `${course}::${sec.name}`;
          next.set(nid, parseId(nid));
          migrated++;
          continue;
        }
      }
      next.set(id, parseId(id));
    }
    if (migrated) { selected = next; save(); }
    return migrated;
  }
  App.migratePlanIds = migrateLegacyIds;

  function getSelectedCourseCodes() {
    return [...new Set([...selected.values()].map((p) => p.course))];
  }
  App.getPlanCourseCodes = getSelectedCourseCodes;

  function planSize() { return selected.size; }
  App.planSize = planSize;

  loadFromLocalStorage();

})(window.App);
