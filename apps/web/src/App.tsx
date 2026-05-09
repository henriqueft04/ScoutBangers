import { BrowserRouter, Route, Routes } from "react-router-dom"

import { AppShell } from "@/components/layout/app-shell"
import { AuthProvider } from "@/components/auth/auth-provider"
import { AboutPage } from "@/components/pages/about-page"
import { ArtistPage } from "@/components/pages/artist-page"
import { HomePage } from "@/components/pages/home-page"
import { LibraryPage } from "@/components/pages/library-page"
import { PlaylistsPage } from "@/components/pages/playlists-page"
import { PlaylistDetailPage } from "@/components/pages/playlist-detail-page"
import { ProfilePage } from "@/components/pages/profile-page"
import { PublicProfilePage } from "@/components/pages/public-profile-page"
import { PlayerProvider } from "@/components/player/player-provider"

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
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/music" element={<LibraryPage />} />
              <Route path="/playlists" element={<PlaylistsPage />} />
              <Route path="/playlists/:id" element={<PlaylistDetailPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/sobre" element={<AboutPage />} />
              <Route path="/u/:userId" element={<PublicProfilePage />} />
              <Route path="/artist/:name" element={<ArtistPage />} />
              <Route path="*" element={<HomePage />} />
            </Routes>
          </AppShell>
        </PlayerProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
