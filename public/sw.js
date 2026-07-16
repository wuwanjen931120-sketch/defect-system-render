"use strict";

const CACHE_NAME = "aiot-pwa-v7-static-only";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./login.html",
  "./register.html",
  "./dashboard.html",
  "./logs.html",
  "./settings.html",
  "./ai.html",
  "./admin.html",
  "./mongo-admin.html",
  "./style.css",
  "./core.js",
  "./script.js",
  "./ai.js",
  "./sidebar-common.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
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
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 登入、API、帶 Authorization 的請求永遠不進快取。
  if (url.pathname.startsWith("/api/") || request.headers.has("Authorization")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: "no-store" });
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
        return response;
      } catch (_) {
        return (await caches.match(request)) || (await caches.match("./index.html"));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    const networkPromise = fetch(request).then(async response => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }
      return response;
    }).catch(() => null);

    return cached || (await networkPromise) || Response.error();
  })());
});
