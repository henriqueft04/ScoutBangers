import * as React from "react"
import { Check, Loader2, Plus, Search } from "lucide-react"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { TrackArtwork } from "@/components/library/track-artwork"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { useFilteredSongs } from "@/hooks/useFilteredSongs"
import { useTrackVisuals } from "@/hooks/useTrackVisuals"
import { displayArtist, displayTitle } from "@/lib/song-display"
import type { Song } from "@/lib/types"

const MAX_VISIBLE = 100

interface AddSongsSheetProps {
  open: boolean
  /** Whole catalogue to pick from. */
  songs: Song[]
  /** Ids already in the playlist. */
  songIds: string[]
  onAdd: (songId: string) => Promise<void>
  onRemove: (songId: string) => Promise<void>
  onClose: () => void
}

function AddSongRow({
  song,
  added,
  busy,
  onToggle,
}: {
  song: Song
  added: boolean
  busy: boolean
  onToggle: () => void
}) {
  // Metadata (and with it the thumbnail) loads lazily once the row scrolls
  // into view, same as the main song list.
  const { ref, meta } = useTrackVisuals<HTMLButtonElement>(
    song.id,
    true,
    song.modifiedTime
  )
  const artist = displayArtist(song, meta)
  return (
    <button
      ref={ref}
      type="button"
      onClick={onToggle}
      disabled={busy}
      aria-pressed={added}
      className="hover:bg-accent/40 flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors"
    >
      <TrackArtwork meta={meta} className="size-10" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">
          {displayTitle(song, meta)}
        </span>
        {artist ? (
          <span className="text-muted-foreground truncate text-xs">
            {artist}
          </span>
        ) : null}
      </span>
      {busy ? (
        <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" />
      ) : added ? (
        <Check className="text-primary size-4 shrink-0" />
      ) : (
        <Plus className="text-muted-foreground size-4 shrink-0" />
      )}
    </button>
  )
}

/**
 * Bottom sheet for adding songs to a playlist: search the catalogue, tap
 * + to add, tap ✓ to take a song back out.
 */
export function AddSongsSheet({
  open,
  songs,
  songIds,
  onAdd,
  onRemove,
  onClose,
}: AddSongsSheetProps) {
  const [query, setQuery] = React.useState("")
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const debounced = useDebouncedValue(query, 150)
  const filtered = useFilteredSongs(songs, debounced)
  const inPlaylist = React.useMemo(() => new Set(songIds), [songIds])

  if (!open) return null

  const visible = filtered.slice(0, MAX_VISIBLE)

  const handleToggle = async (songId: string) => {
    setBusyId(songId)
    try {
      if (inPlaylist.has(songId)) await onRemove(songId)
      else await onAdd(songId)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <BottomSheet
      open={open}
      title="Adicionar músicas"
      onClose={onClose}
      className="flex max-h-[85vh] flex-col"
    >
      <div className="relative mb-2">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pesquisar músicas"
          className="border-input bg-background focus-visible:ring-ring/40 w-full rounded-md border py-2 pr-3 pl-9 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Nenhuma música encontrada.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {visible.map((song) => (
              <li key={song.id}>
                <AddSongRow
                  song={song}
                  added={inPlaylist.has(song.id)}
                  busy={busyId === song.id}
                  onToggle={() => void handleToggle(song.id)}
                />
              </li>
            ))}
          </ul>
        )}
        {filtered.length > MAX_VISIBLE ? (
          <p className="text-muted-foreground py-2 text-center text-xs">
            A mostrar {MAX_VISIBLE} de {filtered.length} — afina a pesquisa.
          </p>
        ) : null}
      </div>
    </BottomSheet>
  )
}
