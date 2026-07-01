

const CACHE_NAME = "aiot-pwa-v6-sidebar-all-ai"; // ✅ bump version
const ASSETS = [
  "./",
  "./index.html",
  "./login.html",
  "./dashboard.html",
  "./logs.html",
  "./settings.html",
  "./ai.html",
  "./style.css",
  "./core.js",
  "./script.js",
  "./ai.js",
  "./manifest.webmanifest"
];


self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});


self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    console.log('Current caches:', keys); // 顯示所有的快取鍵
    await Promise.all(keys.map(k => {
      if (k !== CACHE_NAME) {
        console.log(`Deleting cache: ${k}`);
        return caches.delete(k);
      }
      return Promise.resolve();
    }));
    await self.clients.claim();
  })());
});


// ✅ Network-first：避免舊快取讓頁面灰底、白畫面、三警告
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;


  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      const cached = await caches.match(req);
      return cached || caches.match("./index.html");
    }
  })());
});

