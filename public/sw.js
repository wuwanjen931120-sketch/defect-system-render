"use strict";

const CACHE_NAME = "aiot-static-v10";
const STATIC_ASSETS = [
  "./offline.html",
  "./style.css",
  "./core.js",
  "./ai.js",
  "./sidebar-common.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./vendor/marked.umd.js",
  "./vendor/dompurify.min.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname === "/health" ||
    request.headers.has("Authorization")
  ) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .catch(() => caches.match("./offline.html"))
    );
    return;
  }

  if (!STATIC_ASSETS.some(asset => new URL(asset, self.location.href).pathname === url.pathname)) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
