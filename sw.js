// Offline support: the app shell is cached so the CPR coach and call button work with no signal.
// Map data is cached separately by the app in localStorage.
const VERSION = "heartline-v1";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "icons/icon.svg",
  "src/app.js",
  "src/about.js",
  "src/lib/aed.js",
  "src/lib/cpr.js",
  "src/lib/gaps.js",
  "src/lib/geo.js",
  "src/lib/hours.js",
  "src/lib/i18n.js",
  "src/lib/overpass.js",
  "src/lib/report.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Network-first for our own files so updates land; fall back to cache offline.
  if (url.origin === location.origin || url.hostname === "unpkg.com") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request, { ignoreSearch: true })),
    );
  }
});
