import * as React from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"

import { AppShell } from "@/components/layout/app-shell"
import { AuthProvider } from "@/components/auth/auth-provider"
import { HomePage } from "@/components/pages/home-page"
import { PlayerProvider } from "@/components/player/player-provider"

/**
 * After a deploy, the cached index.html (served by the service worker
 * or held by the browser HTTP cache) can reference Vite chunk hashes
 * that the host has since pruned. Any client-side route change that
 * needs a lazy chunk then fails with "Failed to fetch dynamically
 * imported module" / 404, and React's Suspense — whose fallback is
 * null — silently shows nothing. Result: from the user's POV, only
 * the eager-loaded home route works; tapping anything else does
 * nothing.
 *
 * `lazyWithReload` recovers automatically: if the import rejects, we
 * force a full reload. A full navigation hits the SW's
 * network-first `handleNavigation`, which fetches the live
 * index.html (with current chunk hashes) and overwrites the cached
 * copy. Second attempt succeeds.
 *
 * A session-scoped flag prevents reload loops if the failure is
 * something other than stale hashes (offline + uncached, broken
 * deploy). The flag clears as soon as any lazy chunk loads
 * successfully, so future deploys remain self-healing for the same
 * tab.
 */
const RELOAD_KEY = "scoutbangers:chunk-reload"

function safeSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null
  } catch {
    return null
  }
}

function lazyWithReload<T extends React.ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      const mod = await factory()
      safeSessionStorage()?.removeItem(RELOAD_KEY)
      return mod
    } catch (err) {
      const storage = safeSessionStorage()
      if (storage?.getItem(RELOAD_KEY) === "1") {
        // Already reloaded once and the chunk still fails — surface
        // the error rather than loop. Caller will see the Suspense
        // fallback / error boundary.
        throw err
      }
      try {
        storage?.setItem(RELOAD_KEY, "1")
      } catch {
        /* private mode / quota — best-effort */
      }
      if (typeof window !== "undefined") {
        window.location.reload()
      }
      // Suspend forever so React doesn't render an error frame before
      // the reload kicks in.
      return await new Promise<never>(() => {})
    }
  })
}

// Routes that aren't the home page get code-split so the initial JS
// payload is lean — most users land on /, and the rest of the routes
// load on demand. The library page is also lazy because it pulls in
// the full song list rendering.
const LibraryPage = lazyWithReload(() =>
  import("@/components/pages/library-page").then((m) => ({
    default: m.LibraryPage,
  }))
)
const PlaylistsPage = lazyWithReload(() =>
  import("@/components/pages/playlists-page").then((m) => ({
    default: m.PlaylistsPage,
  }))
)
const PlaylistDetailPage = lazyWithReload(() =>
  import("@/components/pages/playlist-detail-page").then((m) => ({
    default: m.PlaylistDetailPage,
  }))
)
const ProfilePage = lazyWithReload(() =>
  import("@/components/pages/profile-page").then((m) => ({
    default: m.ProfilePage,
  }))
)
const AboutPage = lazyWithReload(() =>
  import("@/components/pages/about-page").then((m) => ({
    default: m.AboutPage,
  }))
)
const PublicProfilePage = lazyWithReload(() =>
  import("@/components/pages/public-profile-page").then((m) => ({
    default: m.PublicProfilePage,
  }))
)
const ArtistPage = lazyWithReload(() =>
  import("@/components/pages/artist-page").then((m) => ({
    default: m.ArtistPage,
  }))
)
const StatsPage = lazyWithReload(() =>
  import("@/components/pages/stats-page").then((m) => ({
    default: m.StatsPage,
  }))
)

// Eagerly fetch every lazy-loaded route chunk after first paint, so
// each chunk lands in the service worker's asset cache and tab
// switches work offline. Without this, an offline user who only
// visited "/" online would get a failed dynamic import when navigating
// to /music, /playlists, etc.
if (typeof window !== "undefined") {
  window.addEventListener("load", () => {
    const prefetch = () => {
      void import("@/components/pages/library-page")
      void import("@/components/pages/playlists-page")
      void import("@/components/pages/playlist-detail-page")
      void import("@/components/pages/profile-page")
      void import("@/components/pages/about-page")
      void import("@/components/pages/public-profile-page")
      void import("@/components/pages/artist-page")
      void import("@/components/pages/stats-page")
    }
    if ("requestIdleCallback" in window) {
      ;(window as Window & typeof globalThis).requestIdleCallback(prefetch)
    } else {
      setTimeout(prefetch, 1500)
    }
  })
}

/**
 * Routes:
 *   /                    → home (top 10)
 *   /music               → library / catalog
 *   /playlists           → user's playlists
 *   /playlists/:id       → individual playlist
 *   /profile             → profile + stats
 *   /sobre               → about page (PT)
 *   /artist/:name        → artist profile
 */
export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PlayerProvider>
          <AppShell>
            <React.Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/music" element={<LibraryPage />} />
                <Route path="/playlists" element={<PlaylistsPage />} />
                <Route
                  path="/playlists/:id"
                  element={<PlaylistDetailPage />}
                />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/sobre" element={<AboutPage />} />
                <Route path="/u/:userId" element={<PublicProfilePage />} />
                <Route path="/artist/:name" element={<ArtistPage />} />
                <Route path="/estatisticas" element={<StatsPage />} />
                <Route path="*" element={<HomePage />} />
              </Routes>
            </React.Suspense>
          </AppShell>
        </PlayerProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
