// Smurf Tracker offline cache. Only useful when the app is hosted over http(s)
// (e.g. GitHub Pages) — service workers cannot register on file:// pages, so
// opening the HTML file directly just skips all of this, which is fine.
// Bump SW cache so each release reaches hosted installs.
const CACHE = "smurf-tracker-cache-v112";
// index.html is the shell; "./" was a redundant second cache of the same document.
// The page loads app.css and app.js as "?v=<version>", so a browser never pairs a
// new page with last release's script out of its HTTP cache; offline, the copies
// fetched here answer for any version (ignoreSearch, below).
const ASSETS = [
  "./index.html",
  "./app.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  // the Latin files every page uses; the other alphabets are cached when first needed
  "./fonts/inter-latin.woff2",
  "./fonts/cinzel-latin.woff2",
];

self.addEventListener("install", e => {
  // addAll fails the whole install if one asset 404s; cache what we can so a
  // missing icon never leaves the shell uncached.
  e.waitUntil(
    caches.open(CACHE).then(c =>
      // "reload": straight from the server, not an HTTP-cached copy of the last release
      Promise.all(ASSETS.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => undefined)))
    )
  );
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
  // proxies, the profile-icon CDN, the backend worker — must go
  // straight to the network: caching a rank check would pin the account to
  // whatever rank it had the first time it was ever fetched.
  if (new URL(e.request.url).origin !== self.location.origin) return;

  // Network-first so a redeployed index.html actually reaches people, with the
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
      .catch(() => caches.match(e.request).then(cached => cached || caches.match(e.request, { ignoreSearch: true })).then(cached =>
        cached || caches.match("./index.html").then(shell => shell || Promise.reject(new Error("offline and not cached")))))
  );
});
