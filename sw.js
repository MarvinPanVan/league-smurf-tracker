// Smurf Tracker offline cache. Only useful when the app is hosted over http(s)
// (e.g. GitHub Pages) — service workers cannot register on file:// pages, so
// opening the HTML file directly just skips all of this, which is fine.
const CACHE = "smurf-tracker-cache-v35";
const ASSETS = ["./", "./index.html", "./manifest.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;

  // Only ever touch our own files. Everything cross-origin — the op.gg rank
  // proxies, the profile-icon CDN, the backend worker, Google Fonts — must go
  // straight to the network: caching a rank check would pin the account to
  // whatever rank it had the first time it was ever fetched.
  if (new URL(e.request.url).origin !== self.location.origin) return;

  // Network-first so a redeployed app.html actually reaches people, with the
  // cache as the offline fallback rather than the default answer.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(cached => cached || Promise.reject(new Error("offline and not cached"))))
  );
});
