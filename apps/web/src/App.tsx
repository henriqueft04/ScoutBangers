import * as React from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"

import { AppShell } from "@/components/layout/app-shell"
import { AuthProvider } from "@/components/auth/auth-provider"
import { HomePage } from "@/components/pages/home-page"
import { PlayerProvider } from "@/components/player/player-provider"

// Routes that aren't the home page get code-split so the initial JS
// payload is lean — most users land on /, and the rest of the routes
// load on demand. The library page is also lazy because it pulls in
// the full song list rendering.
const LibraryPage = React.lazy(() =>
  import("@/components/pages/library-page").then((m) => ({
    default: m.LibraryPage,
  }))
)
const PlaylistsPage = React.lazy(() =>
  import("@/components/pages/playlists-page").then((m) => ({
    default: m.PlaylistsPage,
  }))
)
const PlaylistDetailPage = React.lazy(() =>
  import("@/components/pages/playlist-detail-page").then((m) => ({
    default: m.PlaylistDetailPage,
  }))
)
const ProfilePage = React.lazy(() =>
  import("@/components/pages/profile-page").then((m) => ({
    default: m.ProfilePage,
  }))
)
const AboutPage = React.lazy(() =>
  import("@/components/pages/about-page").then((m) => ({
    default: m.AboutPage,
  }))
)
const PublicProfilePage = React.lazy(() =>
  import("@/components/pages/public-profile-page").then((m) => ({
    default: m.PublicProfilePage,
  }))
)
const ArtistPage = React.lazy(() =>
  import("@/components/pages/artist-page").then((m) => ({
    default: m.ArtistPage,
  }))
)
const StatsPage = React.lazy(() =>
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
