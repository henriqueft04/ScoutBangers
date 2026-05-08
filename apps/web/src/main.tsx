import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@workspace/ui/globals.css"
import { App } from "./App.tsx"
import { registerServiceWorker } from "./lib/register-sw"

// Mobile in-page DevTools — opt in with `?debug=1`. Persists in
// sessionStorage so navigations within the SPA keep it active. Useful
// for chasing bugs that only reproduce on a phone, without needing a
// USB tether or remote-debugging setup.
const debugRequested =
  new URLSearchParams(window.location.search).get("debug") === "1"
if (debugRequested) {
  sessionStorage.setItem("scoutbangers:debug", "1")
}
if (sessionStorage.getItem("scoutbangers:debug") === "1") {
  // Lazy-loaded so it never enters the main bundle for normal users.
  void import("eruda").then((mod) => {
    const eruda = (mod as unknown as { default: { init: () => void } }).default
    eruda.init()
  })
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

registerServiceWorker()
