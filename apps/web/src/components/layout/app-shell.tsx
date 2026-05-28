import * as React from "react"
import type { ReactNode } from "react"

import { BottomNav } from "./bottom-nav"
import { DesktopSidebar } from "./desktop-sidebar"
import { FriendsRail } from "./friends-rail"
import { Header } from "./header"
import { NewSongsBanner } from "@/components/library/new-songs-banner"
import { InstallPrompt } from "@/components/onboarding/install-prompt"
import { FullscreenPlayer } from "@/components/player/fullscreen-player"
import { LyricsPanel } from "@/components/player/lyrics-panel"
import { PlayerBar } from "@/components/player/player-bar"
import { useMediaSession } from "@/hooks/useMediaSession"
import { usePlayer } from "@/hooks/usePlayer"
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
  const { toggle } = usePlayer()

  // Desktop-only: spacebar toggles play/pause from anywhere in the app,
  // unless focus is in an editable field (input, textarea, contentEditable)
  // or a button — buttons get spacebar to fire their own click handler.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (!window.matchMedia("(min-width: 1024px)").matches) return
      const target = event.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          tag === "BUTTON" ||
          target.isContentEditable
        ) {
          return
        }
      }
      event.preventDefault()
      toggle()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [toggle])


  const [fullscreen, setFullscreen] = React.useState(false)
  const [initialPanel, setInitialPanel] = React.useState<
    "queue" | "lyrics" | null
  >(null)
  // Desktop-only: when set, the center column shows this panel inline
  // (Spotify-style) instead of routing through the fullscreen sheet.
  const [desktopPanel, setDesktopPanel] = React.useState<"lyrics" | null>(null)

  const isDesktop = React.useCallback(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches,
    []
  )

  const open = React.useCallback(() => {
    setInitialPanel(null)
    setFullscreen(true)
  }, [])
  const openQueue = React.useCallback(() => {
    setInitialPanel("queue")
    setFullscreen(true)
  }, [])
  const openLyrics = React.useCallback(() => {
    if (isDesktop()) {
      setDesktopPanel("lyrics")
      return
    }
    setInitialPanel("lyrics")
    setFullscreen(true)
  }, [isDesktop])
  const close = React.useCallback(() => setFullscreen(false), [])
  const closeDesktopPanel = React.useCallback(() => setDesktopPanel(null), [])

  // Drop the inline panel if the viewport falls below lg — the layout
  // would otherwise hide the sidebars and leave the panel orphaned.
  React.useEffect(() => {
    if (!desktopPanel) return
    const mq = window.matchMedia("(min-width: 1024px)")
    const onChange = () => {
      if (!mq.matches) setDesktopPanel(null)
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [desktopPanel])

  return (
    <div className="bg-background text-foreground flex min-h-svh flex-col">
      <div className="flex min-h-svh flex-1 flex-col lg:flex-row">
        <DesktopSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {desktopPanel === "lyrics" ? (
            <LyricsPanel
              onClose={closeDesktopPanel}
              variant="inline"
              className="flex-1 pb-24"
            />
          ) : (
            <>
              <Header />
              <NewSongsBanner />
              <main className="flex-1 pb-2">{children}</main>
            </>
          )}
        </div>
        <FriendsRail />
      </div>
      <div className="sticky inset-x-0 bottom-0 z-20">
        <PlayerBar
          onExpand={open}
          onOpenQueue={openQueue}
          onOpenLyrics={openLyrics}
        />
        <BottomNav />
      </div>
      <FullscreenPlayer
        open={fullscreen}
        onClose={close}
        initialPanel={initialPanel}
      />
      <InstallPrompt />
    </div>
  )
}
