const CACHE_NAME = "shindanshi-pwa-v3";
const APP_SHELL = [
  "/shindanshi/",
  "/shindanshi/index.html",
  "/shindanshi/offline.html",
  "/shindanshi/css/style.css",
  "/shindanshi/js/app.js",
  "/shindanshi/js/secondary.js",
  "/shindanshi/js/shindanshi-explanation-render-helper.js",
  "/shindanshi/js/pwa.js",
  "/shindanshi/manifest.json",
  "/shindanshi/assets/icons/apple-touch-icon.png",
  "/shindanshi/assets/icons/icon-192.png",
  "/shindanshi/assets/icons/icon-512.png",
  "/shindanshi/assets/icons/favicon.ico"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            return key !== CACHE_NAME;
          })
          .map(function (key) {
            return caches.delete(key);
          })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/blog/") || url.pathname.startsWith("/news/") || url.pathname.startsWith("/shindanshi/blog/") || url.pathname.startsWith("/shindanshi/news/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          return response;
        })
        .catch(function () {
          return caches.match("/shindanshi/offline.html");
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cachedResponse) {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then(function (response) {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, responseToCache);
          });
          return response;
        })
        .catch(function () {
          if (request.destination === "document") {
            return caches.match("/shindanshi/offline.html");
          }
          return Response.error();
        });
    })
  );
});
