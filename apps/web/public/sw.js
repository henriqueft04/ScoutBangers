/*
 * Service worker for ScoutBangers.
 *
 *  - Caches the static app shell so the UI loads instantly on warm visits.
 *  - Intercepts `/api/stream/<id>` requests:
 *      * If the song has been explicitly downloaded into `AUDIO_CACHE`,
 *        serve it from disk — including byte-range responses synthesised
 *        from the cached blob — so playback is instant and works offline.
 *      * Otherwise, pass through to the network so the Drive proxy
 *        handles the request normally.
 *  - The audio cache is populated only by `audio-cache.ts`'s download
 *    manager. We never auto-cache streamed bytes (that would silently
 *    fill storage with partial blobs).
 */

const SHELL_CACHE = "scoutbangers-shell-v1"
const AUDIO_CACHE = "scoutbangers-audio-v1"
const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      // cache.addAll is atomic — one 404 fails the whole batch and
      // leaves /index.html uncached, which is what you saw as the
      // 'Está offline' native page. Add each entry individually and
      // swallow per-URL failures so a stale/missing asset can't take
      // down the offline shell.
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(url).catch(() => undefined)
        )
      )
    })
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== AUDIO_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
      // Pre-warm hashed JS/CSS bundles referenced by the live
      // index.html. Without this, the first offline visit after a
      // deploy returns the cached index.html but its <script> /
      // <link> tags point at asset URLs the cache has never seen,
      // and the page can't boot. Best-effort — the rest of activate
      // shouldn't block on this.
      .then(() => prewarmAssets())
      .catch(() => undefined)
  )
})

async function prewarmAssets() {
  try {
    const cache = await caches.open(SHELL_CACHE)
    const indexResponse = await fetch("/index.html", { cache: "no-cache" })
    if (!indexResponse.ok) return
    await cache.put("/index.html", indexResponse.clone())
    const html = await indexResponse.text()
    const urls = new Set()
    // Extract every absolute / root-relative URL from <script src> and
    // <link href>. Crude but sufficient for Vite's output where every
    // asset reference is a root-relative /assets/... path.
    const regex = /(?:src|href)=["']([^"']+)["']/g
    let match
    while ((match = regex.exec(html)) !== null) {
      const url = match[1]
      if (!url) continue
      if (
        url.startsWith("/") &&
        !url.startsWith("//") &&
        !url.startsWith("/api/")
      ) {
        urls.add(url)
      }
    }
    await Promise.all(
      Array.from(urls).map((url) =>
        cache
          .add(url)
          .catch(() => undefined)
      )
    )
  } catch {
    /* best-effort */
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)

  // Audio: cache-first via the explicit-download cache, network fallback.
  if (url.pathname.startsWith("/api/stream/")) {
    event.respondWith(handleAudioRequest(request))
    return
  }

  // Other API calls always go to network so Range / freshness work.
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
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy))
            return response
          })
      )
    )
  }
})

async function handleAudioRequest(request) {
  // Cache lookup uses URL only (Range header would defeat the match).
  const cacheKey = new Request(request.url, { method: "GET" })
  const cache = await caches.open(AUDIO_CACHE)
  const cached = await cache.match(cacheKey, { ignoreVary: true })

  if (!cached) {
    // Not downloaded — pass through.
    return fetch(request)
  }

  const range = request.headers.get("Range")
  if (!range) {
    // Full-file request: clone-and-return the cached response so the
    // caller can read its body without consuming our cache entry.
    return cached.clone()
  }

  // Parse "bytes=START-END". Either bound may be omitted (open ranges).
  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  if (!match) return cached.clone()

  const blob = await cached.blob()
  const total = blob.size
  const start = match[1] ? parseInt(match[1], 10) : 0
  const end = match[2] ? parseInt(match[2], 10) : total - 1
  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    start >= total ||
    start > end
  ) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${total}` },
    })
  }
  const slice = blob.slice(start, end + 1)
  return new Response(slice, {
    status: 206,
    headers: {
      "Content-Type":
        cached.headers.get("Content-Type") || "audio/mpeg",
      "Content-Length": String(slice.size),
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Accept-Ranges": "bytes",
      "X-Modified-Time": cached.headers.get("X-Modified-Time") || "",
    },
  })
}
