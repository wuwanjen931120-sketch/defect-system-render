"use strict";

const CACHE_NAME = "defect-cache-v5";
const STATIC_ASSETS = [
  "./offline.html",
  "./style.css",
  "./core.js",
  "./safe-dom.js",
  "./ai.js",
  "./sidebar-common.js",
  "./offline.page.css",
  "./offline.handlers.js",
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
  ) {
    return;
  }

  // HTML 導航一律優先讀取最新版。
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .catch(() => caches.match("./offline.html"))
    );
    return;
  }

  const isStaticAsset = STATIC_ASSETS.some(
    asset =>
      new URL(asset, self.location.href).pathname === url.pathname
  );

  if (!isStaticAsset) {
    return;
  }

  // JS / CSS / 靜態資源改成 Network First。
  // 有網路時取得最新版並更新快取；
  // 只有網路失敗時才使用舊快取。
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request, {
          cache: "no-store"
        });

        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }

        return response;
      } catch {
        const cached = await caches.match(request);

        if (cached) {
          return cached;
        }

        return new Response("Offline", {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8"
          }
        });
      }
    })()
  );
});
