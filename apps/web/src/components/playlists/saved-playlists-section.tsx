import * as React from "react"
import { BookmarkCheck } from "lucide-react"
import { Link } from "react-router-dom"

import {
  listSavedPlaylists,
  type SavedPlaylistSummary,
} from "@/lib/playlist-saves"
import { getCached, setCached } from "@/lib/storage"

interface SavedPlaylistsSectionProps {
  /** The user whose saved playlists we're listing. */
  userId: string
}

const CACHE_TTL_MS = 5 * 60 * 1000
const savedPlaylistsCacheKey = (userId: string) => `scoutbangers:saved-playlists:${userId}`

/**
 * Lists playlists the user has saved (others' public playlists).
 * Hidden when the user has saved nothing — keeps the "your
 * playlists" page clean for users who don't engage with the
 * social side.
 *
 * `listSavedPlaylists` swallows its own errors (returns `[]`), which
 * offline would otherwise silently hide this whole section instead of
 * showing what was saved last time — so unlike the SWR pages elsewhere,
 * this only ever overwrites `items` with a genuinely fresh (non-empty
 * OR confirmed-empty-by-a-successful-fetch) result. Since we can't tell
 * "fetch failed" from "really has nothing saved" here, we keep it
 * simple: seed from cache, and only persist a fresh fetch back to cache
 * (never blank the display on a failed one).
 */
export function SavedPlaylistsSection({ userId }: SavedPlaylistsSectionProps) {
  const [items, setItems] = React.useState<SavedPlaylistSummary[] | null>(
    () => getCached<SavedPlaylistSummary[]>(savedPlaylistsCacheKey(userId))
  )
  // Snapshot of "did we have cache at mount", taken once via lazy init —
  // deliberately NOT reactive to `items` so the effect below doesn't need
  // it as a dependency (and can't see a stale value from a prior render).
  const hadCacheRef = React.useRef(items !== null)

  React.useEffect(() => {
    let cancelled = false
    void listSavedPlaylists(userId).then((next) => {
      if (cancelled) return
      // An empty result here is ambiguous (genuinely nothing saved vs.
      // the fetch failing offline) — only overwrite what's already
      // showing when we got something, or when we had nothing cached to
      // begin with (first-ever load).
      if (next.length > 0 || !hadCacheRef.current) {
        setItems(next)
      }
      if (next.length > 0) {
        setCached(savedPlaylistsCacheKey(userId), next, CACHE_TTL_MS)
        hadCacheRef.current = true
      }
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
