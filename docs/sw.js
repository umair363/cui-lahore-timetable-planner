/* ============================================================================
   sw.js — makes the app installable and usable offline.

   Two strategies, deliberately different:
   - App shell (HTML/CSS/JS/icons): cache-first, so the app opens instantly
     even offline, but refreshed in the background on every load so a new
     deploy is picked up within one visit, not held forever.
   - data/timetable.json: network-first. The whole point of this app is
     showing current data - a stale cached timetable would be actively
     misleading. Cache is only the offline fallback, never the first choice.

   CACHE_VERSION is the only thing that needs bumping to invalidate old
   caches on a shell change; the scraper's own data refreshes don't need it
   since the data path is network-first regardless.
   ============================================================================ */

const CACHE_VERSION = "v1";
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
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== SHELL_CACHE && n !== DATA_CACHE)
          .map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never intercept cross-origin (there isn't any, but be explicit)

  if (url.pathname.endsWith("/data/timetable.json")) {
    event.respondWith(networkFirst(req));
  } else {
    event.respondWith(cacheFirstThenRevalidate(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirstThenRevalidate(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req);
  const revalidate = fetch(req)
    .then((fresh) => { if (fresh.ok) cache.put(req, fresh.clone()); return fresh; })
    .catch(() => null);
  return cached || (await revalidate) || Response.error();
}
