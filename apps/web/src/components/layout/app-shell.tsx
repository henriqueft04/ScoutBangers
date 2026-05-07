import { Header } from "./header"
import { Library } from "@/components/library/library"
import { PlayerBar } from "@/components/player/player-bar"
import { useMediaSession } from "@/hooks/useMediaSession"

/**
 * Top-level layout: sticky header + scrollable library + sticky player bar.
 * Uses `min-h-svh` so the column fills the visual viewport on mobile (handles
 * the dynamic browser chrome correctly on iOS Safari).
 *
 * Also bridges the player to the OS Media Session so audio keeps playing in
 * the background and lock-screen controls work.
 */
export function AppShell() {
  useMediaSession()
  return (
    <div className="bg-background text-foreground flex min-h-svh flex-col">
      <Header />
      <main className="flex-1">
        <Library />
      </main>
      <PlayerBar />
    </div>
  )
}
