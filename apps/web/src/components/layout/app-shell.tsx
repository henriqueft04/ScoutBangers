import * as React from "react"
import type { ReactNode } from "react"

import { BottomNav } from "./bottom-nav"
import { Header } from "./header"
import { NewSongsBanner } from "@/components/library/new-songs-banner"
import { FullscreenPlayer } from "@/components/player/fullscreen-player"
import { PlayerBar } from "@/components/player/player-bar"
import { useMediaSession } from "@/hooks/useMediaSession"
import { usePlayTracking } from "@/hooks/usePlayTracking"

interface AppShellProps {
  children: ReactNode
}

/**
 * Top-level layout: sticky header + scrollable route content + sticky bottom
 * stack (player bar above bottom nav). Bridges the player to the OS Media
 * Session so audio keeps playing in the background and lock-screen controls
 * work.
 *
 * Owns the boolean state for the fullscreen "Now Playing" sheet — kept here
 * (rather than in PlayerProvider) because it's a UI concern that doesn't
 * affect playback.
 */
export function AppShell({ children }: AppShellProps) {
  useMediaSession()
  usePlayTracking()
  const [fullscreen, setFullscreen] = React.useState(false)

  const open = React.useCallback(() => setFullscreen(true), [])
  const close = React.useCallback(() => setFullscreen(false), [])

  return (
    <div className="bg-background text-foreground flex min-h-svh flex-col">
      <Header />
      <NewSongsBanner />
      <main className="flex-1 pb-2">{children}</main>
      <div className="sticky inset-x-0 bottom-0 z-20">
        <PlayerBar onExpand={open} />
        <BottomNav />
      </div>
      <FullscreenPlayer open={fullscreen} onClose={close} />
    </div>
  )
}
