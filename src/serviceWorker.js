// Service worker: keeps the whole site on the phone after the first visit, so floor plans,
// directions, the 3D dollhouse and AR live view work at school without Wi-Fi or data.
//
// Not bundled with the app: vite.config.js copies this file to dist/sw.js at build time and
// puts the list of built files in PRECACHE and a build id in VERSION.
//
//  - The site's own files come from the saved copy (they have content hashes in their names,
//    so a saved file never goes stale). Pages open from the saved copy too, even with a weak
//    signal, and a new version is saved in the background when the site changes.
//  - Google Fonts are saved the first time they load.
//  - Server functions (/api/), Firebase and Google Maps always go to the network. Firestore
//    keeps its own offline copy of announcements and closures (see src/firebase.js).
/* global PRECACHE, VERSION */

const CACHE = `ssca-app-${VERSION}`;
const FONTS = "ssca-fonts";
const scoped = (path) => new URL(path, self.registration.scope).href;
// The app's scripts load with crossorigin, so their requests carry headers the saved copies
// were not stored with; a server "Vary" header would then hide the saved copy. The files have
// content hashes in their names, so the saved copy is always the right one.
const SAVED = { cacheName: CACHE, ignoreVary: true };

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map(scoped))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("ssca-app-") && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

// The page asks the waiting new version to take over when the person taps "Update".
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.includes("/api/")) return;
    // Any page address (including ?ar-live links) opens the saved app.
    if (request.mode === "navigate") {
      event.respondWith(caches.match(scoped("./"), SAVED).then((saved) => saved || fetch(request)));
      return;
    }
    event.respondWith(caches.match(request, SAVED).then((saved) => saved || fetch(request)));
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(fontFromCache(request));
  }
});

// Saved font if there is one (refreshed in the background); otherwise the network, saving it.
async function fontFromCache(request) {
  const cache = await caches.open(FONTS);
  const saved = await cache.match(request);
  const fresh = fetch(request).then((response) => {
    if (response.ok || response.type === "opaque") cache.put(request, response.clone());
    return response;
  }).catch(() => saved);
  return saved || fresh;
}
