/* Reso service worker — offline-first. The whole app shell is precached at
 * install, so Reso opens and works with no network at all. Data lives in
 * IndexedDB on-device; only the optional AI features need connectivity. */

const VERSION = "reso-v3-offline";

/* Every route the app can open on. Prerendered static pages — safe to precache. */
const CORE_ROUTES = [
  "/", "/preview",
  "/overview", "/dashboard", "/academics", "/finance", "/journal",
  "/routines", "/digest", "/inbox", "/settings",
  "/manifest.json", "/icon-192.png", "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then(async (cache) => {
      // Cache each core route individually so one failure can't abort the install.
      await Promise.all(CORE_ROUTES.map((url) =>
        cache.add(new Request(url, { cache: "reload" })).catch(() => {})
      ));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // AI/API traffic is stateless and per-request — always live.
  if (url.pathname.startsWith("/api/")) return;

  // Hashed build assets: cache-first, they never change once named.
  if (url.pathname.startsWith("/_next/static") || /\.(png|jpg|jpeg|svg|ico|woff2?|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
      )
    );
    return;
  }

  // Google Fonts + other cross-origin statics: cache-first, opaque is fine.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com" || url.hostname === "accounts.google.com") {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        }).catch(() => hit)
      )
    );
    return;
  }

  // Navigations: try network for freshness, fall back to cache — the app
  // opens offline because every route is precached.
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(async () =>
          (await caches.match(req)) ||
          (await caches.match(url.pathname)) ||
          (await caches.match("/")) ||
          new Response("<h1>Offline</h1><p>Reso will open once a first visit has cached it.</p>", {
            headers: { "Content-Type": "text/html" }, status: 200,
          })
        )
    );
    return;
  }

  // Everything else: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((hit) => {
      const live = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      }).catch(() => hit);
      return hit || live;
    })
  );
});
