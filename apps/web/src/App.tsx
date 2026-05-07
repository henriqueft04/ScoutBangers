import { AppShell } from "@/components/layout/app-shell"
import { PlayerProvider } from "@/components/player/player-provider"

export function App() {
  return (
    <PlayerProvider>
      <AppShell />
    </PlayerProvider>
  )
}
