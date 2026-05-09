import { Bookmark, BookmarkCheck } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { useAuth } from "@/hooks/useAuth"
import { usePlaylistSave } from "@/hooks/usePlaylistSave"

interface PlaylistSaveButtonProps {
  playlistId: string
  /**
   * The playlist's owner — used to hide the button when the
   * current user is the owner (you can't save your own playlist).
   */
  ownerId: string
  /**
   * Skip rendering entirely if the playlist isn't public — you
   * can't save private playlists. Pass through is_public from the
   * detail page; the component handles the rest.
   */
  isPublic: boolean
}

/**
 * Save / unsave toggle for a public playlist, with a public count
 * that doubles as a like counter. When the current user is the
 * owner of the playlist (or signed out / playlist is private), the
 * component falls back to a small read-only count badge instead.
 */
export function PlaylistSaveButton({
  playlistId,
  ownerId,
  isPublic,
}: PlaylistSaveButtonProps) {
  const { user } = useAuth()
  const { saved, count, toggle, busy } = usePlaylistSave(playlistId)

  if (!isPublic) return null

  const isOwner = user?.id === ownerId
  // Owner / signed out: show the count read-only.
  if (isOwner || !user) {
    if (count === 0) return null
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs tabular-nums">
        <Bookmark className="size-3.5" />
        {count}
      </span>
    )
  }

  return (
    <Button
      type="button"
      variant={saved ? "default" : "outline"}
      size="sm"
      aria-pressed={saved}
      aria-label={saved ? "Remover dos guardados" : "Guardar playlist"}
      onClick={toggle}
      disabled={busy}
      className="gap-1.5"
    >
      {saved ? (
        <BookmarkCheck className="size-4" />
      ) : (
        <Bookmark className="size-4" />
      )}
      {saved ? "Guardada" : "Guardar"}
      {count > 0 ? (
        <span className="text-muted-foreground ml-1 text-xs tabular-nums">
          · {count}
        </span>
      ) : null}
    </Button>
  )
}
