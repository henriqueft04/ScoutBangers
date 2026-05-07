import { BrowserRouter, Route, Routes } from "react-router-dom"

import { AppShell } from "@/components/layout/app-shell"
import { ArtistPage } from "@/components/pages/artist-page"
import { LibraryPage } from "@/components/pages/library-page"
import { PlayerProvider } from "@/components/player/player-provider"

/**
 * Routes:
 *   /             → library (default)
 *   /artist/:name → artist profile (Spotify-style)
 */
export function App() {
  return (
    <BrowserRouter>
      <PlayerProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<LibraryPage />} />
            <Route path="/artist/:name" element={<ArtistPage />} />
            <Route path="*" element={<LibraryPage />} />
          </Routes>
        </AppShell>
      </PlayerProvider>
    </BrowserRouter>
  )
}
