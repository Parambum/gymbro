/*
 * Service worker — deliberately does nothing.
 *
 * Chrome will not offer to install a web app unless one is registered with a
 * fetch handler, so this exists to satisfy that and for no other reason.
 *
 * It is network-only on purpose. A caching service worker on a Next.js app is
 * a reliable way to serve someone a half-updated build for weeks: hashed asset
 * names change every deploy, a stale HTML document asks for chunks that no
 * longer exist, and the page breaks in a way the user cannot clear and we
 * cannot see. The app also needs the network for every screen anyway, since
 * all of its data is server-rendered or fetched.
 *
 * If offline support is ever wanted, it belongs in a considered caching
 * strategy with versioned cleanup — not in a quiet edit to this file.
 */

self.addEventListener("install", () => {
  // Replace any previous worker immediately rather than waiting for every tab
  // to close, so a bad earlier version can always be superseded.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Clear anything a previous worker cached, so this one cannot inherit
      // stale assets from an older strategy.
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  // Required for installability. Passing the request straight through means
  // the browser behaves exactly as it would with no worker at all.
  event.respondWith(fetch(event.request));
});
