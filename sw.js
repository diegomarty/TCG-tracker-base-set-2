// Service worker: la app y los datos van "red primero" (precios frescos) con copia para
// usar sin conexión; las imágenes de las cartas, "caché primero".
const APP = "bs2-app-v2";
const IMG = "bs2-img-v1";
const SHELL = ["./", "index.html", "assets/styles.css", "assets/app.js", "data/cards.json", "data/prices.json",
  "manifest.webmanifest", "assets/icon.svg", "assets/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => ![APP, IMG].includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "images.pokemontcg.io") {
    e.respondWith(caches.open(IMG).then(async (c) => {
      const hit = await c.match(req, { ignoreVary: true }) || await c.match(req.url, { ignoreVary: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") c.put(req.url, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(APP).then((c) => c.put(req, copy)); }
    return res;
  }).catch(async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === "navigate") return caches.match("./") || caches.match("index.html");
    return Response.error();
  }));
});
