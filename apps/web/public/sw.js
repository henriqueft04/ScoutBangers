/*
 * Minimal service worker. Its only job is to satisfy Chrome's PWA
 * installability criteria (a registered SW that responds to fetches).
 *
 * We deliberately do NOT cache audio: songs stream from /api/stream/* with
 * Range requests, and a naive cache breaks seeking + wastes phone storage.
 * We do cache the static app shell so the UI loads instantly on warm visits
 * and works briefly offline (audio still requires network).
 */

const CACHE_NAME = "scoutbangers-shell-v1"
const PRECACHE = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)

  // Never intercept API or audio streams — let the network handle them so
  // Range requests and freshness work correctly.
  if (url.pathname.startsWith("/api/")) return

  // Network-first for navigations so deploys propagate immediately.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/index.html").then((res) => res ?? Response.error())
      )
    )
    return
  }

  // Cache-first for same-origin static assets.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
            return response
          })
      )
    )
  }
})
