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
      for (const id of raw.split(",").filter(Boolean)) selected.set(id, parseId(id));
    } catch (e) { /* private mode etc — plan just won't persist */ }
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

  function parseId(id) {
    const [course, section, group] = id.split("::");
    return { course, section: Number(section), group: group || "" };
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
      const offs = App.offeringsFor(parseId(id).course, parseId(id).section);
      const found = offs.find((o) => o.id === id);
      if (found) out.push(found);
    }
    return out;
  }
  App.getPlanOfferings = getSelectedOfferings;

  function getSelectedCourseCodes() {
    return [...new Set([...selected.values()].map((p) => p.course))];
  }
  App.getPlanCourseCodes = getSelectedCourseCodes;

  function planSize() { return selected.size; }
  App.planSize = planSize;

  loadFromLocalStorage();

})(window.App);
