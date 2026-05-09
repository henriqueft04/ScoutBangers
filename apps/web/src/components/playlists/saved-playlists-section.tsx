import * as React from "react"
import { BookmarkCheck } from "lucide-react"
import { Link } from "react-router-dom"

import {
  listSavedPlaylists,
  type SavedPlaylistSummary,
} from "@/lib/playlist-saves"

interface SavedPlaylistsSectionProps {
  /** The user whose saved playlists we're listing. */
  userId: string
}

/**
 * Lists playlists the user has saved (others' public playlists).
 * Hidden when the user has saved nothing — keeps the "your
 * playlists" page clean for users who don't engage with the
 * social side.
 */
export function SavedPlaylistsSection({ userId }: SavedPlaylistsSectionProps) {
  const [items, setItems] = React.useState<SavedPlaylistSummary[] | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void listSavedPlaylists(userId).then((next) => {
      if (cancelled) return
      setItems(next)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (!items || items.length === 0) return null

  return (
    <section className="mt-6 flex flex-col gap-2">
      <h3 className="text-muted-foreground text-xs uppercase tracking-wider">
        Guardadas
      </h3>
      <ul role="list" className="flex flex-col gap-1">
        {items.map((playlist) => (
          <li key={playlist.id}>
            <Link
              to={`/playlists/${playlist.id}`}
              className="hover:bg-accent/40 flex items-center justify-between gap-2 rounded-md px-3 py-2.5 transition-colors"
            >
              <span className="text-foreground flex min-w-0 items-center gap-2 text-sm font-medium">
                <BookmarkCheck className="text-primary size-3.5 shrink-0" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{playlist.name}</span>
                  {playlist.ownerDisplayName ? (
                    <span className="text-muted-foreground truncate text-xs">
                      de {playlist.ownerDisplayName}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {playlist.songCount}{" "}
                {playlist.songCount === 1 ? "música" : "músicas"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
