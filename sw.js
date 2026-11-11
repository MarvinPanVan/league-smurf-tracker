// Smurf Tracker offline cache. Only useful when the app is hosted over http(s)
// (e.g. GitHub Pages) — service workers cannot register on file:// pages, so
// opening the HTML file directly just skips all of this, which is fine.
// Bump SW cache so each release reaches hosted installs.
const CACHE = "smurf-tracker-cache-v125";
// "./" is the shell. Cloudflare Pages answers /index.html with a redirect to /, and a
// browser refuses a redirected response as the answer to a page load, so the page is
// kept under the address Pages serves it at.
// The page loads app.css and app.js as "?v=<version>", so a browser never pairs a
// new page with last release's script out of its HTTP cache; offline, the copies
// fetched here answer for any version (ignoreSearch, below).
const ASSETS = [
  "./",
  "./app.css",
  "./app.js",
  "./manifest.json",
  "./icons/favicon.svg",
  "./icons/favicon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  // the Latin files every page uses; the other alphabets are cached when first needed
  "./fonts/inter-latin.woff2",
  "./fonts/cinzel-latin.woff2",
];

// Store a response under a key. One that arrived through a redirect is stored as a
// plain copy of its body: served later for a page load, the redirected one itself
// makes the browser fail the load.
function keep(key, res) {
  const plain = res.redirected
    ? res.blob().then(b => new Response(b, { status: res.status, statusText: res.statusText, headers: res.headers }))
    : Promise.resolve(res);
  return plain.then(r => caches.open(CACHE).then(c => c.put(key, r)));
}

self.addEventListener("install", e => {
  // addAll fails the whole install if one asset 404s; cache what we can so a
  // missing icon never leaves the shell uncached.
  e.waitUntil(
    Promise.all(ASSETS.map(u =>
      // "reload": straight from the server, not an HTTP-cached copy of the last release
      fetch(new Request(u, { cache: "reload" })).then(res => (res && res.ok ? keep(u, res) : undefined)).catch(() => undefined)
    ))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Offline: the stored copy, then the same file under any ?v=, and for a page load of
// the app (./, ./index.html, ./?action=add) the shell. At any other address the shell
// would come up without its styles and script, which it asks for relative to the
// address, so there the browser shows its own offline page.
const HOME = new URL("./", self.location).pathname;
const isApp = req => req.mode === "navigate" && [HOME, HOME + "index.html"].includes(new URL(req.url).pathname);
function offline(req) {
  return caches.match(req)
    .then(hit => hit || caches.match(req, { ignoreSearch: true }))
    .then(hit => hit || (isApp(req) ? caches.match("./") : undefined))
    .then(hit => hit || Promise.reject(new Error("offline and not cached")));
}

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
        if (res && res.ok) e.waitUntil(keep(e.request, res.clone()).catch(() => undefined));
        return res;
      })
      .catch(() => offline(e.request))
  );
});
