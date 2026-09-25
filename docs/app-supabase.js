/* ============================================================================
   app-supabase.js — a small client for the swap board's backend.

   Why not the official SDK: this site loads no third-party scripts at all, so
   script-src can stay locked to 'self'. Pulling in a bundle from a CDN would
   mean opening that up; vendoring ~100KB to call four REST endpoints is worse
   than writing the four calls. Everything here is fetch against PostgREST plus
   the anonymous-session endpoints.

   The anon key below is meant to be public - it identifies the project, it
   does not authorise anything. What a holder of it may actually read or write
   is decided entirely by the row level security policies in
   supabase/schema.sql. If those are wrong, this key being secret would not
   save you; if they are right, publishing it costs nothing.

   Identity is a session on this device: no email, no password, no code to
   wait for. The trade is that clearing site data loses the identity, and with
   it your posts and conversations.
   ============================================================================ */
window.App = window.App || {};

(function (App) {
  const URL_BASE = "https://dxorvodovxlhuoducnrl.supabase.co";
  const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4b3J2b2RvdnhsaHVvZHVjbnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMjg4NjUsImV4cCI6MjEwNTkwNDg2NX0.RwkgJbN_S7OP5xZuDQQJPEJTVVoOEuH6eB1saeafjXA";
  const STORE_KEY = "cui-tt-session-v1";

  let cached = null;

  function readStored() {
    if (cached) return cached;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      cached = raw ? JSON.parse(raw) : null;
    } catch (e) { cached = null; }
    return cached;
  }

  function store(sess) {
    cached = sess;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(sess)); } catch (e) { /* private mode */ }
  }

  function clearSession() {
    cached = null;
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
  }
  App.sbSignOut = clearSession;

  function shape(json) {
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      user_id: json.user && json.user.id,
      // refresh a minute early rather than discovering expiry mid-request
      expires_at: Date.now() + Math.max(0, (json.expires_in || 3600) - 60) * 1000,
    };
  }

  async function authCall(path, body) {
    const res = await fetch(`${URL_BASE}/auth/v1/${path}`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.msg || json.error_description || json.message || `auth ${res.status}`);
      err.code = json.error_code || json.code;
      throw err;
    }
    return json;
  }

  /** The device's session, created on first use. */
  async function session({ create = true } = {}) {
    let sess = readStored();
    if (sess && sess.expires_at > Date.now()) return sess;

    if (sess && sess.refresh_token) {
      try {
        sess = shape(await authCall("token?grant_type=refresh_token", { refresh_token: sess.refresh_token }));
        store(sess);
        return sess;
      } catch (e) {
        clearSession();   // refresh token rejected - start over rather than loop
      }
    }
    if (!create) return null;
    sess = shape(await authCall("signup", {}));
    store(sess);
    return sess;
  }
  App.sbSession = session;

  App.sbUserId = async function () {
    const s = await session();
    return s && s.user_id;
  };

  /**
   * One PostgREST call. `query` is an object of PostgREST filters, e.g.
   *   { select: "*", status: "eq.open", order: "created_at.desc" }
   */
  async function rest(table, { method = "GET", query = {}, body = null, prefer = "" } = {}) {
    const sess = await session();
    const qs = new URLSearchParams(query).toString();
    const headers = {
      apikey: ANON_KEY,
      Authorization: `Bearer ${sess.access_token}`,
      "Content-Type": "application/json",
    };
    if (prefer) headers.Prefer = prefer;

    const res = await fetch(`${URL_BASE}/rest/v1/${table}${qs ? "?" + qs : ""}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error((json && (json.message || json.hint)) || `request failed (${res.status})`);
      err.status = res.status;
      err.details = json;
      throw err;
    }
    return json;
  }
  App.sbRest = rest;

  App.sbSelect = (table, query) => rest(table, { query: { select: "*", ...query } });
  App.sbInsert = (table, row) => rest(table, { method: "POST", body: row, prefer: "return=representation" });
  App.sbUpdate = (table, query, patch) =>
    rest(table, { method: "PATCH", query, body: patch, prefer: "return=representation" });
  App.sbDelete = (table, query) => rest(table, { method: "DELETE", query });

  /**
   * Poll instead of opening a realtime socket. At this scale a few seconds of
   * latency on a chat message is imperceptible, and it avoids a second
   * protocol, a second failure mode and a reconnect loop to get wrong. Backs
   * off when the tab is hidden so a forgotten tab isn't hammering the API.
   */
  function poll(fn, { interval = 4000 } = {}) {
    let stopped = false;
    let timer = null;
    async function tick() {
      if (stopped) return;
      try { await fn(); } catch (e) { /* transient - try again next tick */ }
      if (stopped) return;
      timer = setTimeout(tick, document.hidden ? interval * 4 : interval);
    }
    tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }
  App.sbPoll = poll;

  /** True once the backend is actually set up - used to show an honest message
   *  rather than a broken page while the schema/toggle are still pending. */
  App.sbReady = async function () {
    try {
      await session();
      await rest("profiles", { query: { select: "id", limit: "1" } });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e.code === "anonymous_provider_disabled"
        ? "Anonymous sign-ins are not enabled on the project yet."
        : e.message };
    }
  };

})(window.App);
