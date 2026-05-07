import * as React from "react"
import type { ReactNode } from "react"

import { Header } from "./header"
import { FullscreenPlayer } from "@/components/player/fullscreen-player"
import { PlayerBar } from "@/components/player/player-bar"
import { useMediaSession } from "@/hooks/useMediaSession"

interface AppShellProps {
  children: ReactNode
}

/**
 * Top-level layout: sticky header + scrollable route content + sticky player
 * bar. Bridges the player to the OS Media Session so audio keeps playing in
 * the background and lock-screen controls work.
 *
 * Owns the boolean state for the fullscreen "Now Playing" sheet — kept here
 * (rather than in PlayerProvider) because it's a UI concern that doesn't
 * affect playback.
 */
export function AppShell({ children }: AppShellProps) {
  useMediaSession()
  const [fullscreen, setFullscreen] = React.useState(false)

  const open = React.useCallback(() => setFullscreen(true), [])
  const close = React.useCallback(() => setFullscreen(false), [])

  return (
    <div className="bg-background text-foreground flex min-h-svh flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <PlayerBar onExpand={open} />
      <FullscreenPlayer open={fullscreen} onClose={close} />
    </div>
  )
}
