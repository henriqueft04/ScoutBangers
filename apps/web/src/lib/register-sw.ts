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

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* registration failed — non-critical */
    })
  })
}
