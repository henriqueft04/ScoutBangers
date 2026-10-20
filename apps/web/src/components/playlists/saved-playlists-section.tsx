import * as React from "react"
import { BookmarkCheck } from "lucide-react"

import { PlaylistRow } from "@/components/playlists/playlist-row"
import {
  listSavedPlaylists,
  savedPlaylistsCacheKey,
  type SavedPlaylistSummary,
} from "@/lib/playlist-saves"
import { getCached, setCached } from "@/lib/storage"

interface SavedPlaylistsSectionProps {
  /** The user whose saved playlists we're listing. */
  userId: string
}

const CACHE_TTL_MS = 5 * 60 * 1000

/**
 * Lists playlists the user has saved (others' public playlists).
 * Hidden when the user has saved nothing — keeps the "your
 * playlists" page clean for users who don't engage with the
 * social side.
 *
 * Seeded from cache so the section shows instantly; a successful fetch
 * (including a confirmed-empty one, e.g. after unsaving the last playlist)
 * replaces it, while a failed fetch leaves what is showing alone.
 */
export function SavedPlaylistsSection({ userId }: SavedPlaylistsSectionProps) {
  const [items, setItems] = React.useState<SavedPlaylistSummary[] | null>(
    () => getCached<SavedPlaylistSummary[]>(savedPlaylistsCacheKey(userId))
  )
  React.useEffect(() => {
    let cancelled = false
    void listSavedPlaylists(userId).then((next) => {
      if (cancelled || !next) return
      setItems(next)
      setCached(savedPlaylistsCacheKey(userId), next, CACHE_TTL_MS)
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
            <PlaylistRow
              id={playlist.id}
              name={playlist.name}
              ownerName={playlist.ownerDisplayName}
              songCount={playlist.songCount}
              saveCount={playlist.saveCount}
              coverUrl={playlist.coverUrl}
              previewSongIds={playlist.previewSongIds}
              icon={<BookmarkCheck className="text-primary size-3.5 shrink-0" />}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
