/**
 * Register the service worker that makes the app installable as a PWA.
 *
 * Only runs in production and when the browser supports SW. Imported with a
 * one-line side effect from `main.tsx`.
 *
 * Getting everyone onto the latest deploy depends on two separate things
 * going right, and this file (plus `_headers`) is responsible for both:
 *   1. The browser has to actually FETCH a fresh `/sw.js` to notice a new
 *      version exists. Browsers only do this on navigation/certain
 *      triggers, and even then they skip the request entirely if the HTTP
 *      cache says the old copy is still "fresh" — so `/sw.js` must be
 *      served with `Cache-Control: no-cache` (see `public/_headers`) and
 *      we additionally force a check on every visibility change / a
 *      periodic timer, because a PWA that's resumed from the home screen
 *      rather than freshly navigated-to (the common case on iOS) may
 *      never trigger the browser's own opportunistic check at all.
 *   2. Once a new SW has taken control, the already-open page has to
 *      actually reload to start using it. `reloadWhenSafe` handles that —
 *      deferred until playback is idle so a deploy doesn't cut a song off
 *      mid-play, but bounded so it can't be deferred forever.
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return
  if (!("serviceWorker" in navigator)) return
  if (!import.meta.env.PROD) return

  // When a new SW takes control (skipWaiting + clients.claim), reload the
  // page so the new app bundle is loaded. Guard against reload loops with
  // a flag — controllerchange can fire more than once in edge cases.
  let reloading = false
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return
    reloading = true
    reloadWhenSafe()
  })

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        sendLoadedAssetsToSW()
        watchForUpdates(registration)
      })
      .catch(() => {
        /* registration failed — non-critical */
      })
  })
}

/** Never check more than once per this window — visibilitychange can fire
 *  in rapid bursts (alt-tabbing) and there's no point hammering the SW
 *  script on every one of them. */
const MIN_UPDATE_CHECK_GAP_MS = 5 * 60 * 1000
/** Fallback for a tab that's simply never backgrounded (desktop browser
 *  left open for days) — visibilitychange alone wouldn't fire for that. */
const BACKGROUND_UPDATE_INTERVAL_MS = 60 * 60 * 1000

/**
 * Actively ask the browser to re-check `/sw.js` for changes, instead of
 * waiting on its own opportunistic timing. `registration.update()` is a
 * conditional GET (cheap 304 when nothing changed) — safe to call
 * liberally. This is what actually catches "app was added to the home
 * screen once and just gets resumed forever after."
 */
function watchForUpdates(registration: ServiceWorkerRegistration): void {
  let lastCheck = Date.now()
  const check = () => {
    const now = Date.now()
    if (now - lastCheck < MIN_UPDATE_CHECK_GAP_MS) return
    lastCheck = now
    void registration.update().catch(() => undefined)
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check()
  })
  setInterval(check, BACKGROUND_UPDATE_INTERVAL_MS)
}

/** Upper bound on how long we'll hold off reloading for an in-progress
 *  song — long enough to let most songs finish naturally, short enough
 *  that an update can't be stuck waiting indefinitely (e.g. repeat-one). */
const MAX_RELOAD_DEFER_MS = 10 * 60 * 1000

/**
 * Reload to pick up the new SW/app bundle, but not in the middle of a
 * song — a silent mid-track cutoff because a deploy happened to land
 * right then would be a jarring regression for a music player
 * specifically. Waits for every `<audio>` element to be paused/ended,
 * with a hard cap so a stuck or repeat-one track can't block the update
 * forever.
 */
function reloadWhenSafe(): void {
  const audios = Array.from(document.querySelectorAll("audio"))
  const isPlaying = () => audios.some((audio) => !audio.paused)

  if (!isPlaying()) {
    window.location.reload()
    return
  }

  let done = false
  const finish = () => {
    if (done) return
    done = true
    window.location.reload()
  }
  const onIdle = () => {
    if (!isPlaying()) finish()
  }
  audios.forEach((audio) => {
    audio.addEventListener("pause", onIdle)
    audio.addEventListener("ended", onIdle)
  })
  setTimeout(finish, MAX_RELOAD_DEFER_MS)
}

/**
 * Tell the active SW which static assets this page actually loaded, so
 * they get cached for offline use. The SW's HTML-scrape prewarm can
 * miss things (timing, CSP, etc.); reading the live document is
 * authoritative.
 */
function sendLoadedAssetsToSW(): void {
  const post = (sw: ServiceWorker | null): void => {
    if (!sw) return
    const urls = new Set<string>()
    document
      .querySelectorAll<HTMLLinkElement>('link[href]')
      .forEach((el) => {
        const href = el.getAttribute("href")
        if (href && href.startsWith("/") && !href.startsWith("//")) {
          urls.add(href)
        }
      })
    document
      .querySelectorAll<HTMLScriptElement>('script[src]')
      .forEach((el) => {
        const src = el.getAttribute("src")
        if (src && src.startsWith("/") && !src.startsWith("//")) {
          urls.add(src)
        }
      })
    if (urls.size === 0) return
    sw.postMessage({ type: "cache-urls", urls: Array.from(urls) })
  }
  const ctrl = navigator.serviceWorker.controller
  if (ctrl) {
    post(ctrl)
  } else {
    navigator.serviceWorker.ready.then((reg) => {
      post(reg.active)
    })
  }
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    post(navigator.serviceWorker.controller)
  })
}
