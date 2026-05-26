/**
 * Register the service worker that makes the app installable as a PWA.
 *
 * Only runs in production and when the browser supports SW. Imported with a
 * one-line side effect from `main.tsx`.
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
    window.location.reload()
  })

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => sendLoadedAssetsToSW())
      .catch(() => {
        /* registration failed — non-critical */
      })
  })
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
