/* Chairvana service worker: shows alerts pushed to the stylist's device. */
self.addEventListener("push", (event) => {
  let data = { title: "Chairvana", body: "", url: "/app/today" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/app/today" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/app/today", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

/* ---------------------------------------------------------------------------
 * Salon screens keep playing without internet:
 *  - the screen page (/tv…) is saved each time it loads, and used when offline;
 *  - the app's built files (/_next/static, never change) are kept;
 *  - pictures a screen shows are saved when the screen asks ("cv-cache").
 * Everything else in the app goes straight to the network as before.
 * ------------------------------------------------------------------------- */
const PAGES = "cv-screen-pages-v1";
const STATIC = "cv-static-v1";
const MEDIA = "cv-screen-media";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Screen pages: network first, saved copy when offline.
  if (sameOrigin && req.mode === "navigate" && (url.pathname === "/tv" || url.pathname.startsWith("/tv/") || /^\/app\/screens\/[^/]+\/play$/.test(url.pathname))) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(() => caches.open(PAGES).then((c) => c.match(url.pathname)).then((hit) => hit || Response.error())),
    );
    return;
  }

  // Built files never change: keep them.
  if (sameOrigin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC).then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((res) => {
          if (res.ok) c.put(req, res.clone());
          return res;
        })),
      ),
    );
    return;
  }

  // Pictures a screen saved: from the saved copy first.
  if (req.destination === "image") {
    event.respondWith(
      caches.open(MEDIA).then((c) => c.match(req.url).then((hit) => hit || fetch(req))),
    );
  }
});

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type !== "cv-cache" || !Array.isArray(msg.urls)) return;
  const urls = msg.urls.filter((u) => typeof u === "string").slice(0, 300);
  event.waitUntil(
    caches.open(MEDIA).then(async (c) => {
      let saved = 0;
      for (const u of urls) {
        try {
          if (await c.match(u)) {
            saved++;
            continue;
          }
          const res = await fetch(u, { mode: "no-cors" });
          if (res.ok || res.type === "opaque") {
            await c.put(u, res);
            saved++;
          }
        } catch {
          /* try again next time */
        }
      }
      // Forget pictures no screen uses any more.
      const keep = new Set(urls);
      for (const k of await c.keys()) if (!keep.has(k.url)) await c.delete(k);
      if (event.source) event.source.postMessage({ type: "cv-cached", saved, total: urls.length });
    }),
  );
});
