const CACHE_NAME = "personal-calendar-2026-09-28-v3";
const APP_SHELL = [
    "./",
    "./index.html",
    "./style.css?v=20260928-personal-v82",
    "./manifest.webmanifest",
    "./config.js",
    "./js/app.js?v=20260928-personal-v82",
    "./js/storage.js",
    "./js/cloud.js",
    "./js/almanac.js",
    "./js/home.js",
    "./js/wishlist.js",
    "./js/vendor/lunar.js",
    "./js/vendor/docx.iife.js",
    "./icons/icon.svg",
    "./icons/icon-192.png",
    "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
    event.waitUntil(caches.keys()
        .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
        .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;
    event.respondWith(fetch(event.request)
        .then((response) => {
            if (response.ok) {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            }
            return response;
        })
        .catch(() => caches.match(event.request).then((response) => response || caches.match("./index.html"))));
});
