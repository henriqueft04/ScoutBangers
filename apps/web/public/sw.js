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

const SHELL_CACHE = "scoutbangers-shell-v3"
const AUDIO_CACHE = "scoutbangers-audio-v2"
const AUDIO_HOST = "audio.scoutbangers.com"
const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/icon-header.png",
  "/apple-touch-icon.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      // cache.addAll is atomic — one 404 fails the whole batch and
      // leaves /index.html uncached. Add each entry individually and
      // swallow per-URL failures so a stale/missing asset can't take
      // down the offline shell.
      await Promise.all(
        PRECACHE.map((url) => cache.add(url).catch(() => undefined))
      )
      // Critical: also prewarm the live index.html + its hashed asset
      // references during install. If we wait for activate, the user
      // could go offline before activate completes and the cached
      // index.html points at uncached /assets/* URLs that won't load.
      await prewarmAssets().catch(() => undefined)
    })()
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== AUDIO_CACHE)
          .map((k) => caches.delete(k))
      )
      await self.clients.claim()
      // Re-prewarm on activate too, in case install's pass was
      // skipped (e.g. the SW was installed while offline).
      await prewarmAssets().catch(() => undefined)
    })()
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

// Allow the page to tell us exactly which assets it loaded. The
// regex-based prewarm can miss entries when CSP or timing get in the
// way; an explicit list from the live document is the source of truth.
self.addEventListener("message", (event) => {
  const data = event.data
  if (!data || data.type !== "cache-urls" || !Array.isArray(data.urls)) return
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.all(
        data.urls.map((url) =>
          cache.add(url).catch(() => undefined)
        )
      )
    )
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)

  // Audio: cache-first via the explicit-download cache, network fallback.
  // Songs are served from R2 at audio.scoutbangers.com — cross-origin —
  // and that's the URL `audio-cache.ts` stores them under, so we match
  // against the host, not a same-origin path.
  if (url.host === AUDIO_HOST) {
    event.respondWith(handleAudioRequest(request))
    return
  }

  // Other API calls always go to network so Range / freshness work.
  if (url.pathname.startsWith("/api/")) return

  // Network-first for navigations so deploys propagate immediately.
  // Offline: fall back to any cached HTML shell we have.
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request))
    return
  }

  // Cache-first for same-origin static assets, with offline-safe fallback.
  if (url.origin === self.location.origin) {
    event.respondWith(handleAsset(request))
  }
})

async function handleNavigation(request) {
  // If the browser already knows it's offline, skip the network entirely
  // — otherwise fetch can stall for seconds before rejecting, which on
  // an SPA route change shows up as a hang.
  if (self.navigator && self.navigator.onLine === false) {
    return (await cachedShell()) || offlineFallback()
  }
  try {
    // Race the network against a short timeout so flaky connectivity
    // falls through to the cached shell quickly.
    const response = await fetchWithTimeout(request, 3000)
    if (response && response.ok) {
      const copy = response.clone()
      caches
        .open(SHELL_CACHE)
        .then((cache) => cache.put("/index.html", copy))
        .catch(() => undefined)
    }
    return response
  } catch {
    return (await cachedShell()) || offlineFallback()
  }
}

async function cachedShell() {
  const cache = await caches.open(SHELL_CACHE)
  return (
    (await cache.match("/index.html")) ||
    (await cache.match("/")) ||
    (await caches.match("/index.html")) ||
    (await caches.match("/"))
  )
}

function offlineFallback() {
  return new Response(
    "<!doctype html><meta charset=utf-8><title>Offline</title><body style=\"font-family:sans-serif;padding:2rem\"><h1>Offline</h1><p>Não foi possível carregar a aplicação. Liga-te à internet pelo menos uma vez para guardar a app para uso offline.</p></body>",
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  )
}

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms)
    fetch(request).then(
      (res) => {
        clearTimeout(timer)
        resolve(res)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

async function handleAsset(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response && response.ok) {
      const copy = response.clone()
      caches
        .open(SHELL_CACHE)
        .then((cache) => cache.put(request, copy))
        .catch(() => undefined)
    }
    return response
  } catch {
    // Offline and uncached — let the browser fail naturally rather
    // than surfacing chrome's full-page "unavailable" error for what
    // is usually a non-critical asset (font, image, etc.).
    return Response.error()
  }
}

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
