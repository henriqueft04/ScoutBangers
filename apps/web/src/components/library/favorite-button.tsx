import * as React from "react"
import { Heart } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import { SignInDialog } from "@/components/auth/sign-in-dialog"
import { useFavorites } from "@/hooks/useFavorites"
import { supabaseConfigured } from "@/lib/supabase"

import { AddToPlaylistDialog } from "./add-to-playlist-dialog"

interface FavoriteButtonProps {
  songId: string
  className?: string
  size?: "sm" | "md" | "lg"
  /** When true, stops the click from bubbling to a parent card/row. */
  stopPropagation?: boolean
}

/**
 * Heart button. Filled when the song is favorited, outlined otherwise.
 * Opens the save-to-playlist picker on click, or a sign-in dialog when no user is authenticated. Clicks
 * never bubble to parent rows so a user can favorite a song without
 * starting playback.
 */
export function FavoriteButton({
  songId,
  className,
  size = "md",
  stopPropagation = true,
}: FavoriteButtonProps) {
  const { isFavorite, toggle, disabled } = useFavorites()
  const [signInOpen, setSignInOpen] = React.useState(false)
  const [addOpen, setAddOpen] = React.useState(false)
  const fav = isFavorite(songId)

  const iconSize = size === "sm" ? "size-4" : size === "lg" ? "size-7" : "size-5"
  const buttonSize = size === "sm" ? "size-7" : size === "lg" ? "size-12" : "size-9"

  return (
    <>
      <button
        type="button"
        aria-label={
          fav ? "Gerir nas playlists" : "Guardar numa playlist"
        }
        aria-pressed={fav}
        onClick={(event) => {
          if (stopPropagation) event.stopPropagation()
          if (disabled) {
            if (supabaseConfigured) setSignInOpen(true)
            return
          }
          // Favorite right away, then open the chooser so the user can undo
          // it or add the song to other playlists. An already-favorited
          // song just opens the chooser.
          if (!fav) void toggle(songId)
          setAddOpen(true)
        }}
        className={cn(
          "touch-manipulation inline-flex shrink-0 items-center justify-center rounded-full transition-colors",
          "focus-visible:ring-ring/40 focus-visible:ring-2 focus-visible:outline-none",
          buttonSize,
          fav
            ? "text-primary hover:text-primary"
            : "text-muted-foreground hover:text-foreground",
          className
        )}
      >
        <Heart
          className={cn(iconSize, fav && "fill-current")}
          strokeWidth={fav ? 2 : 1.75}
        />
      </button>
      <SignInDialog open={signInOpen} onClose={() => setSignInOpen(false)} />
      <AddToPlaylistDialog
        open={addOpen}
        songId={songId}
        onClose={() => setAddOpen(false)}
      />
    </>
  )
}
