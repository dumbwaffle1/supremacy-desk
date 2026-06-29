// Supremacy service worker: push notifications only.
//
// IMPORTANT: we deliberately do NOT intercept navigations (no `fetch` handler).
// A network-first navigation cache used to proxy page loads through the SW, but
// browsers don't reliably apply `Set-Cookie` headers on responses returned via
// respondWith — which silently dropped Convex Auth's refreshed session cookie
// and logged people out. Letting navigations hit the network directly keeps the
// auth cookie refresh working. The marginal offline shell isn't worth the bug.
const CACHE = "supremacy-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop the old navigation cache from the previous SW version.
      for (const key of await caches.keys()) {
        if (key === CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "Supremacy";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      data: { url: data.url || "/" },
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [60, 30, 60],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const c of list) {
          if ("focus" in c && c.url.includes(url)) return c.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      }),
  );
});
