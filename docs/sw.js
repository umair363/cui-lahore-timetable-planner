/* ============================================================================
   sw.js — makes the app installable and usable offline.

   Network-first for everything, cache as the offline fallback.

   The shell used to be cache-first with a background refresh. In practice that
   meant a deploy could take two visits to appear - and if the worker was torn
   down before the background write finished, it might not appear at all. For a
   timetable during registration week, showing yesterday's code or data is worse
   than waiting 200ms for the network. Offline still works: if the fetch fails
   or times out, the cached copy is served.
   - data/timetable.json: network-first. The whole point of this app is
     showing current data - a stale cached timetable would be actively
     misleading. Cache is only the offline fallback, never the first choice.

   CACHE_VERSION is the only thing that needs bumping to invalidate old
   caches on a shell change; the scraper's own data refreshes don't need it
   since the data path is network-first regardless.
   ============================================================================ */

const CACHE_VERSION = "v3";

const SHELL_CACHE = `cui-timetable-shell-${CACHE_VERSION}`;
const DATA_CACHE = `cui-timetable-data-${CACHE_VERSION}`;

const SHELL_FILES = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "app-data.js",
  "app-grid.js",
  "app-plan.js",
  "app-views.js",
  "app-planner-views.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const stale = names.filter((n) => n !== SHELL_CACHE && n !== DATA_CACHE);
    await Promise.all(stale.map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never intercept cross-origin

  const cacheName = url.pathname.endsWith("/data/timetable.json") ? DATA_CACHE : SHELL_CACHE;
  event.respondWith(networkFirst(req, cacheName));
});

/** Fresh if the network answers in time, otherwise whatever we have. The
 *  timeout matters: a phone on bad campus wifi should fall back to the cached
 *  app rather than hang on a request that may never complete. */
async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetchWithTimeout(req.url, 4000);
    if (fresh && fresh.ok) {
      await cache.put(req, fresh.clone());
      return fresh;
    }
  } catch (err) {
    /* fall through to cache */
  }
  const cached = await cache.match(req);
  return cached || Response.error();
}

function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { cache: "no-store", credentials: "same-origin", signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}
